package com.admin.service.impl;

import com.admin.common.dto.AlertRuleDto;
import com.admin.common.lang.R;
import com.admin.entity.MonitorAlertLog;
import com.admin.entity.MonitorAlertRule;
import com.admin.entity.MonitorMetricLatest;
import com.admin.entity.MonitorNodeSnapshot;
import com.admin.mapper.MonitorAlertLogMapper;
import com.admin.mapper.MonitorAlertRuleMapper;
import com.admin.mapper.MonitorMetricLatestMapper;
import com.admin.mapper.MonitorNodeSnapshotMapper;
import com.admin.entity.MonitorInstance;
import com.admin.mapper.MonitorInstanceMapper;
import com.admin.service.AlertService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.admin.entity.DiagnosisRecord;
import com.admin.entity.XuiClientSnapshot;
import com.admin.mapper.DiagnosisRecordMapper;
import com.admin.mapper.XuiClientSnapshotMapper;

import javax.annotation.Resource;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class AlertServiceImpl extends ServiceImpl<MonitorAlertRuleMapper, MonitorAlertRule> implements AlertService {

    @Resource
    private MonitorAlertRuleMapper alertRuleMapper;
    @Resource
    private MonitorAlertLogMapper alertLogMapper;
    @Resource
    private MonitorNodeSnapshotMapper nodeSnapshotMapper;
    @Resource
    private MonitorMetricLatestMapper metricLatestMapper;
    @Resource
    private MonitorInstanceMapper monitorInstanceMapper;
    @Resource
    private DiagnosisRecordMapper diagnosisRecordMapper;
    @Resource
    private XuiClientSnapshotMapper xuiClientSnapshotMapper;
    @Resource
    private AlertAggregationService aggregationService;

    /**
     * 持续时间防抖缓存: key = "ruleId:nodeId/targetId", value = 首次触发时间戳
     * 只有当条件从首次触发持续超过 durationSeconds 后才真正告警
     * 条件恢复正常时自动清除
     */
    private final ConcurrentHashMap<String, Long> durationTracker = new ConcurrentHashMap<>();

    @Override
    public R listRules() {
        List<MonitorAlertRule> rules = alertRuleMapper.selectList(
                new LambdaQueryWrapper<MonitorAlertRule>()
                        .eq(MonitorAlertRule::getStatus, 0)
                        .orderByDesc(MonitorAlertRule::getCreatedTime));
        return R.ok(rules);
    }

    @Override
    public R createRule(AlertRuleDto dto) {
        MonitorAlertRule rule = new MonitorAlertRule();
        BeanUtils.copyProperties(dto, rule);
        long now = System.currentTimeMillis();
        rule.setCreatedTime(now);
        rule.setUpdatedTime(now);
        rule.setStatus(0);
        if (rule.getEnabled() == null) rule.setEnabled(1);
        if (rule.getOperator() == null) rule.setOperator("gt");
        if (rule.getScopeType() == null) rule.setScopeType("all");
        if (rule.getNotifyType() == null) rule.setNotifyType("log");
        if (rule.getCooldownMinutes() == null) rule.setCooldownMinutes(5);
        if (rule.getDurationSeconds() == null) rule.setDurationSeconds(0);
        if (rule.getSeverity() == null) rule.setSeverity("warning");
        alertRuleMapper.insert(rule);
        return R.ok(rule);
    }

    @Override
    public R updateRule(AlertRuleDto dto) {
        if (dto.getId() == null) return R.err("规则 ID 不能为空");
        MonitorAlertRule rule = alertRuleMapper.selectById(dto.getId());
        if (rule == null) return R.err("规则不存在");
        BeanUtils.copyProperties(dto, rule);
        rule.setUpdatedTime(System.currentTimeMillis());
        alertRuleMapper.updateById(rule);
        return R.ok(rule);
    }

    @Override
    public R deleteRule(Long id) {
        MonitorAlertRule rule = alertRuleMapper.selectById(id);
        if (rule == null) return R.err("规则不存在");
        alertRuleMapper.deleteById(id);
        return R.ok("已删除");
    }

    @Override
    public R toggleRule(Long id) {
        MonitorAlertRule rule = alertRuleMapper.selectById(id);
        if (rule == null) return R.err("规则不存在");
        rule.setEnabled(rule.getEnabled() == 1 ? 0 : 1);
        rule.setUpdatedTime(System.currentTimeMillis());
        alertRuleMapper.updateById(rule);
        return R.ok(rule);
    }

    @Override
    public R listLogs(int page, int size) {
        if (page < 1) page = 1;
        if (size < 1 || size > 100) size = 20;
        Page<MonitorAlertLog> p = alertLogMapper.selectPage(
                new Page<>(page, size),
                new LambdaQueryWrapper<MonitorAlertLog>()
                        .orderByDesc(MonitorAlertLog::getCreatedTime));
        return R.ok(Map.of("records", p.getRecords(), "total", p.getTotal(), "page", p.getCurrent(), "size", p.getSize()));
    }

    @Override
    public R clearLogs() {
        alertLogMapper.delete(new LambdaQueryWrapper<>());
        return R.ok("已清除所有告警日志");
    }

    // ==================== Alert Evaluation Engine (with Aggregation) ====================

    @Override
    public void evaluateAlerts() {
        List<MonitorAlertRule> rules = alertRuleMapper.selectList(
                new LambdaQueryWrapper<MonitorAlertRule>()
                        .eq(MonitorAlertRule::getStatus, 0)
                        .eq(MonitorAlertRule::getEnabled, 1));
        if (rules.isEmpty()) {
            aggregationService.checkAndFlush();
            return;
        }

        // Load all online nodes and their metrics
        List<MonitorNodeSnapshot> allNodes = nodeSnapshotMapper.selectList(
                new LambdaQueryWrapper<MonitorNodeSnapshot>().eq(MonitorNodeSnapshot::getStatus, 0));
        List<MonitorMetricLatest> allMetrics = metricLatestMapper.selectList(
                new LambdaQueryWrapper<MonitorMetricLatest>().eq(MonitorMetricLatest::getStatus, 0));

        // Build metric lookup by nodeSnapshotId
        Map<Long, MonitorMetricLatest> metricMap = new HashMap<>();
        for (MonitorMetricLatest m : allMetrics) {
            metricMap.put(m.getNodeSnapshotId(), m);
        }

        long now = System.currentTimeMillis();

        for (MonitorAlertRule rule : rules) {
            // Check cooldown with escalation support
            boolean isEscalation = false;
            if (rule.getLastTriggeredAt() != null) {
                int cooldownMs = (rule.getCooldownMinutes() != null ? rule.getCooldownMinutes() : 5) * 60 * 1000;
                long elapsed = now - rule.getLastTriggeredAt();
                if (elapsed < cooldownMs) {
                    if (rule.getEscalateAfterMinutes() != null && rule.getEscalateAfterMinutes() > 0) {
                        long escalateMs = rule.getEscalateAfterMinutes() * 60 * 1000L;
                        if (elapsed >= escalateMs) {
                            isEscalation = true;
                        } else {
                            continue;
                        }
                    } else {
                        continue;
                    }
                }
            }

            // ===== Separate evaluation paths for non-node metrics =====
            if ("forward_health".equals(rule.getMetric())) {
                evaluateForwardHealthRule(rule, now, isEscalation);
                continue;
            }
            if ("probe_stale".equals(rule.getMetric())) {
                evaluateProbeStaleRule(rule, now, isEscalation);
                continue;
            }
            if ("xui_client_expiry".equals(rule.getMetric()) || "xui_client_traffic".equals(rule.getMetric())) {
                evaluateXuiClientRules(rule, now, isEscalation);
                continue;
            }

            // Determine which nodes to check
            List<MonitorNodeSnapshot> targetNodes = filterNodesByScope(allNodes, rule);
            targetNodes = filterNodesByProbeCondition(targetNodes, rule);

            for (MonitorNodeSnapshot node : targetNodes) {
                boolean triggered = false;
                double currentValue = 0;
                String message = "";

                if ("offline".equals(rule.getMetric())) {
                    if (node.getOnline() == null || node.getOnline() != 1) {
                        triggered = true;
                        message = String.format("节点「%s」已离线", node.getName());
                    } else {
                        // Node is online — check for recovery
                        aggregationService.markRecovered(rule.getId(), node.getId(), rule.getName(), node.getName(), rule.getMetric());
                        durationTracker.remove(rule.getId() + ":" + node.getId());
                        continue;
                    }
                } else if ("expiry".equals(rule.getMetric())) {
                    if (node.getExpiredAt() == null || node.getExpiredAt() <= 0) continue;
                    long daysRemaining = (node.getExpiredAt() - now) / (24 * 60 * 60 * 1000L);
                    currentValue = daysRemaining;
                    triggered = daysRemaining <= (long) rule.getThreshold().intValue();
                    if (!triggered) continue;
                    if (daysRemaining < 0) {
                        message = String.format("节点「%s」已过期 %d 天", node.getName(), Math.abs(daysRemaining));
                    } else {
                        message = String.format("节点「%s」将在 %d 天后到期", node.getName(), daysRemaining);
                    }
                } else if ("traffic_quota".equals(rule.getMetric())) {
                    if (node.getTrafficLimit() == null || node.getTrafficLimit() <= 0) continue;
                    long used = node.getTrafficUsed() != null ? node.getTrafficUsed() : 0;
                    currentValue = (double) used / node.getTrafficLimit() * 100;
                    triggered = compare(currentValue, rule.getOperator(), rule.getThreshold());
                    if (!triggered) {
                        aggregationService.markRecovered(rule.getId(), node.getId(), rule.getName(), node.getName(), rule.getMetric());
                        continue;
                    }
                    message = String.format("节点「%s」流量已用 %.1f%% (%s / %s)",
                            node.getName(), currentValue,
                            formatTraffic(used), formatTraffic(node.getTrafficLimit()));
                } else {
                    MonitorMetricLatest metric = metricMap.get(node.getId());
                    if (metric == null) continue;

                    currentValue = getMetricValue(metric, rule.getMetric(), node);
                    triggered = compare(currentValue, rule.getOperator(), rule.getThreshold());
                    if (!triggered) {
                        // Check for recovery
                        aggregationService.markRecovered(rule.getId(), node.getId(), rule.getName(), node.getName(), rule.getMetric());
                        durationTracker.remove(rule.getId() + ":" + node.getId());
                        continue;
                    }
                    message = String.format("节点「%s」%s=%s 超过阈值 %s %s",
                            node.getName(), rule.getMetric(),
                            formatValue(currentValue, rule.getMetric()),
                            rule.getOperator(), formatValue(rule.getThreshold(), rule.getMetric()));
                }

                if (triggered) {
                    // Duration debounce
                    String durationKey = rule.getId() + ":" + node.getId();
                    int requiredDuration = rule.getDurationSeconds() != null ? rule.getDurationSeconds() : 0;
                    if (requiredDuration > 0) {
                        long firstTriggeredAt = durationTracker.computeIfAbsent(durationKey, k -> now);
                        long elapsedSec = (now - firstTriggeredAt) / 1000;
                        if (elapsedSec < requiredDuration) {
                            continue;
                        }
                        durationTracker.remove(durationKey);
                    }

                    // Determine effective severity
                    String baseSeverity = rule.getSeverity() != null ? rule.getSeverity() : "warning";
                    String effectiveSeverity = baseSeverity;
                    if (isEscalation) {
                        effectiveSeverity = escalateSeverity(baseSeverity);
                        message = "[升级] " + message;
                    }

                    // Submit to aggregation buffer (instead of direct send)
                    AlertAggregationService.AlertEvent event = new AlertAggregationService.AlertEvent();
                    event.setRuleId(rule.getId());
                    event.setRuleName(rule.getName());
                    event.setNodeId(node.getId());
                    event.setNodeName(node.getName());
                    event.setNodeIp(node.getIp());
                    event.setMetric(rule.getMetric());
                    event.setCurrentValue(currentValue);
                    event.setThreshold(rule.getThreshold());
                    event.setMessage(message);
                    event.setSeverity(effectiveSeverity);
                    event.setNotifyType(rule.getNotifyType());
                    event.setNotifyTarget(rule.getNotifyTarget());
                    event.setTimestamp(now);
                    event.setEscalation(isEscalation);
                    event.setCategory(resolveCategory(rule.getMetric()));
                    aggregationService.submitAlert(event);

                    // Update cooldown
                    rule.setLastTriggeredAt(now);
                    rule.setUpdatedTime(now);
                    alertRuleMapper.updateById(rule);

                    log.info("[Alert] {} - {}", rule.getName(), message);
                    break; // One trigger per rule per evaluation cycle
                }
            }
        }

        // After all rules evaluated, check if aggregation window needs flushing
        aggregationService.checkAndFlush();
    }

    private List<MonitorNodeSnapshot> filterNodesByScope(List<MonitorNodeSnapshot> allNodes, MonitorAlertRule rule) {
        String scopeType = rule.getScopeType();
        String scopeValue = rule.getScopeValue();

        if (scopeType == null || "all".equals(scopeType)) {
            return allNodes;
        }

        if ("node".equals(scopeType) && StringUtils.hasText(scopeValue)) {
            try {
                long nodeId = Long.parseLong(scopeValue);
                List<MonitorNodeSnapshot> result = new ArrayList<>();
                for (MonitorNodeSnapshot n : allNodes) {
                    if (n.getId().equals(nodeId)) result.add(n);
                }
                return result;
            } catch (NumberFormatException e) {
                return allNodes;
            }
        }

        if ("tag".equals(scopeType) && StringUtils.hasText(scopeValue)) {
            List<MonitorNodeSnapshot> result = new ArrayList<>();
            for (MonitorNodeSnapshot n : allNodes) {
                if (n.getTags() != null && n.getTags().contains(scopeValue)) {
                    result.add(n);
                }
            }
            return result;
        }

        return allNodes;
    }

    private List<MonitorNodeSnapshot> filterNodesByProbeCondition(List<MonitorNodeSnapshot> nodes, MonitorAlertRule rule) {
        String condition = rule.getProbeCondition();
        if (condition == null || "any".equals(condition)) {
            return nodes;
        }

        Set<Long> instanceIds = new HashSet<>();
        for (MonitorNodeSnapshot n : nodes) {
            if (n.getInstanceId() != null) instanceIds.add(n.getInstanceId());
        }
        if (instanceIds.isEmpty()) return nodes;

        Map<Long, String> instanceTypeMap = new HashMap<>();
        for (MonitorInstance inst : monitorInstanceMapper.selectBatchIds(instanceIds)) {
            instanceTypeMap.put(inst.getId(), inst.getType());
        }

        if ("komari".equals(condition)) {
            List<MonitorNodeSnapshot> result = new ArrayList<>();
            for (MonitorNodeSnapshot n : nodes) {
                if ("komari".equals(instanceTypeMap.get(n.getInstanceId()))) result.add(n);
            }
            return result;
        }
        if ("pika".equals(condition)) {
            List<MonitorNodeSnapshot> result = new ArrayList<>();
            for (MonitorNodeSnapshot n : nodes) {
                if ("pika".equals(instanceTypeMap.get(n.getInstanceId()))) result.add(n);
            }
            return result;
        }
        if ("both".equals(condition)) {
            Map<String, Set<String>> ipProbeTypes = new HashMap<>();
            for (MonitorNodeSnapshot n : nodes) {
                if (n.getIp() != null) {
                    ipProbeTypes.computeIfAbsent(n.getIp(), k -> new HashSet<>())
                            .add(instanceTypeMap.getOrDefault(n.getInstanceId(), ""));
                }
            }
            Set<String> dualIps = new HashSet<>();
            for (Map.Entry<String, Set<String>> entry : ipProbeTypes.entrySet()) {
                if (entry.getValue().contains("komari") && entry.getValue().contains("pika")) {
                    dualIps.add(entry.getKey());
                }
            }
            List<MonitorNodeSnapshot> result = new ArrayList<>();
            for (MonitorNodeSnapshot n : nodes) {
                if (dualIps.contains(n.getIp())) result.add(n);
            }
            return result;
        }

        return nodes;
    }

    /**
     * 转发健康度告警评估 (with aggregation integration)
     */
    private void evaluateForwardHealthRule(MonitorAlertRule rule, long now, boolean isEscalation) {
        try {
            List<DiagnosisRecord> records = diagnosisRecordMapper.selectList(
                    new LambdaQueryWrapper<DiagnosisRecord>()
                            .eq(DiagnosisRecord::getTargetType, "forward")
                            .orderByDesc(DiagnosisRecord::getCreatedTime));

            Map<Integer, DiagnosisRecord> latestByForward = new LinkedHashMap<>();
            for (DiagnosisRecord r : records) {
                latestByForward.putIfAbsent(r.getTargetId(), r);
            }

            for (Map.Entry<Integer, DiagnosisRecord> entry : latestByForward.entrySet()) {
                DiagnosisRecord rec = entry.getValue();
                if (rec.getCreatedTime() != null && now - rec.getCreatedTime() > 3600_000) continue;

                double healthScore = 100.0;
                if (rec.getOverallSuccess() == null || !rec.getOverallSuccess()) {
                    healthScore -= 50;
                }
                if (rec.getPacketLoss() != null) {
                    healthScore -= rec.getPacketLoss();
                }
                if (rec.getAverageTime() != null) {
                    if (rec.getAverageTime() > 500) healthScore -= 30;
                    else if (rec.getAverageTime() > 200) healthScore -= 15;
                    else if (rec.getAverageTime() > 100) healthScore -= 5;
                }
                healthScore = Math.max(0, Math.min(100, healthScore));

                boolean triggered = healthScore < (rule.getThreshold() != null ? rule.getThreshold() : 60);
                String durationKey = rule.getId() + ":fwd:" + rec.getTargetId();
                String forwardName = rec.getTargetName() != null ? rec.getTargetName() : "ID:" + rec.getTargetId();
                Long fwdNodeId = rec.getTargetId() != null ? rec.getTargetId().longValue() : null;

                if (!triggered) {
                    durationTracker.remove(durationKey);
                    aggregationService.markRecovered(rule.getId(), fwdNodeId, rule.getName(), forwardName, "forward_health");
                    continue;
                }

                int requiredDuration = rule.getDurationSeconds() != null ? rule.getDurationSeconds() : 0;
                if (requiredDuration > 0) {
                    long firstTriggeredAt = durationTracker.computeIfAbsent(durationKey, k -> now);
                    long elapsedSec = (now - firstTriggeredAt) / 1000;
                    if (elapsedSec < requiredDuration) continue;
                    durationTracker.remove(durationKey);
                }

                String baseSeverity = rule.getSeverity() != null ? rule.getSeverity() : "warning";
                String effectiveSeverity = isEscalation ? escalateSeverity(baseSeverity) : baseSeverity;

                String message = String.format("%s转发「%s」健康度 %.0f%% 低于阈值 %.0f%%（丢包:%.1f%% 延迟:%.0fms 连通:%s）",
                        isEscalation ? "[升级] " : "",
                        forwardName, healthScore, rule.getThreshold(),
                        rec.getPacketLoss() != null ? rec.getPacketLoss() : 0,
                        rec.getAverageTime() != null ? rec.getAverageTime() : 0,
                        (rec.getOverallSuccess() != null && rec.getOverallSuccess()) ? "正常" : "异常");

                // Submit to aggregation
                AlertAggregationService.AlertEvent event = new AlertAggregationService.AlertEvent();
                event.setRuleId(rule.getId());
                event.setRuleName(rule.getName());
                event.setNodeId(fwdNodeId);
                event.setNodeName(forwardName);
                event.setMetric("forward_health");
                event.setCurrentValue(healthScore);
                event.setThreshold(rule.getThreshold());
                event.setMessage(message);
                event.setSeverity(effectiveSeverity);
                event.setNotifyType(rule.getNotifyType());
                event.setNotifyTarget(rule.getNotifyTarget());
                event.setTimestamp(now);
                event.setEscalation(isEscalation);
                event.setCategory(resolveCategory("forward_health"));
                aggregationService.submitAlert(event);

                rule.setLastTriggeredAt(now);
                rule.setUpdatedTime(now);
                alertRuleMapper.updateById(rule);

                log.info("[Alert] {} - {}", rule.getName(), message);
                break;
            }
        } catch (Exception e) {
            log.error("[Alert] evaluateForwardHealthRule error: {}", e.getMessage(), e);
        }
    }

    private double getMetricValue(MonitorMetricLatest metric, String metricName, MonitorNodeSnapshot node) {
        switch (metricName) {
            case "cpu": return metric.getCpuUsage() != null ? metric.getCpuUsage() : 0;
            case "mem":
                if (metric.getMemUsed() != null && metric.getMemTotal() != null && metric.getMemTotal() > 0) {
                    return (double) metric.getMemUsed() / metric.getMemTotal() * 100;
                }
                return 0;
            case "disk":
                if (metric.getDiskUsed() != null && metric.getDiskTotal() != null && metric.getDiskTotal() > 0) {
                    return (double) metric.getDiskUsed() / metric.getDiskTotal() * 100;
                }
                return 0;
            case "net_in": return metric.getNetIn() != null ? metric.getNetIn() : 0;
            case "net_out": return metric.getNetOut() != null ? metric.getNetOut() : 0;
            case "load": return metric.getLoad1() != null ? metric.getLoad1() : 0;
            case "temperature": return metric.getTemperature() != null ? metric.getTemperature() : 0;
            case "connections": return metric.getConnections() != null ? metric.getConnections() : 0;
            case "swap":
                if (metric.getSwapUsed() != null && metric.getSwapTotal() != null && metric.getSwapTotal() > 0) {
                    return (double) metric.getSwapUsed() / metric.getSwapTotal() * 100;
                }
                return 0;
            default: return 0;
        }
    }

    private boolean compare(double value, String operator, double threshold) {
        if (operator == null) operator = "gt";
        switch (operator) {
            case "gt": return value > threshold;
            case "lt": return value < threshold;
            case "eq": return Math.abs(value - threshold) < 0.01;
            case "gte": return value >= threshold;
            case "lte": return value <= threshold;
            default: return value > threshold;
        }
    }

    private String escalateSeverity(String severity) {
        if ("info".equals(severity)) return "warning";
        if ("warning".equals(severity)) return "critical";
        return "critical";
    }

    private String formatValue(double value, String metric) {
        if ("cpu".equals(metric) || "mem".equals(metric) || "disk".equals(metric) || "traffic_quota".equals(metric) || "swap".equals(metric)) {
            return String.format("%.1f%%", value);
        }
        if ("net_in".equals(metric) || "net_out".equals(metric)) {
            if (value < 1024) return String.format("%.0f B/s", value);
            if (value < 1024 * 1024) return String.format("%.1f KB/s", value / 1024);
            return String.format("%.1f MB/s", value / (1024 * 1024));
        }
        if ("expiry".equals(metric)) {
            return String.format("%.0f 天", value);
        }
        return String.format("%.2f", value);
    }

    private String formatTraffic(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
        if (bytes < 1024L * 1024 * 1024) return String.format("%.1f MB", bytes / (1024.0 * 1024));
        if (bytes < 1024L * 1024 * 1024 * 1024) return String.format("%.2f GB", bytes / (1024.0 * 1024 * 1024));
        return String.format("%.2f TB", bytes / (1024.0 * 1024 * 1024 * 1024));
    }

    // ==================== Alert Category ====================

    private static String resolveCategory(String metric) {
        if (metric == null) return "infra";
        switch (metric) {
            case "cpu": case "mem": case "disk": case "load":
            case "temperature": case "swap": case "connections":
                return "infra";
            case "offline": case "forward_health": case "probe_stale":
                return "connectivity";
            case "expiry": case "traffic_quota":
            case "xui_client_expiry": case "xui_client_traffic":
                return "resource";
            default:
                return "infra";
        }
    }

    // ==================== Probe Stale Detection ====================

    private void evaluateProbeStaleRule(MonitorAlertRule rule, long now, boolean isEscalation) {
        try {
            List<MonitorInstance> instances = monitorInstanceMapper.selectList(
                    new LambdaQueryWrapper<MonitorInstance>()
                            .eq(MonitorInstance::getStatus, 0)
                            .eq(MonitorInstance::getSyncEnabled, 1));

            double thresholdMinutes = rule.getThreshold() != null ? rule.getThreshold() : 10;

            for (MonitorInstance inst : instances) {
                Long lastSync = inst.getLastSyncAt();
                boolean stale = (lastSync == null) || (now - lastSync > thresholdMinutes * 60 * 1000);
                Long probeNodeId = -inst.getId(); // 负 ID 空间
                String durationKey = rule.getId() + ":probe:" + inst.getId();

                if (!stale) {
                    aggregationService.markRecovered(rule.getId(), probeNodeId,
                            rule.getName(), inst.getName(), "probe_stale");
                    durationTracker.remove(durationKey);
                    continue;
                }

                // Duration debounce
                int requiredDuration = rule.getDurationSeconds() != null ? rule.getDurationSeconds() : 0;
                if (requiredDuration > 0) {
                    long firstTriggeredAt = durationTracker.computeIfAbsent(durationKey, k -> now);
                    if ((now - firstTriggeredAt) / 1000 < requiredDuration) continue;
                    durationTracker.remove(durationKey);
                }

                long staleMins = lastSync != null ? (now - lastSync) / 60000 : -1;
                String baseSeverity = rule.getSeverity() != null ? rule.getSeverity() : "critical";
                String effectiveSeverity = isEscalation ? escalateSeverity(baseSeverity) : baseSeverity;
                String message = String.format("%s探针「%s」(%s) 已断联 %s",
                        isEscalation ? "[升级] " : "",
                        inst.getName(), inst.getType(),
                        staleMins >= 0 ? staleMins + " 分钟" : "未知时长");

                AlertAggregationService.AlertEvent event = new AlertAggregationService.AlertEvent();
                event.setRuleId(rule.getId());
                event.setRuleName(rule.getName());
                event.setNodeId(probeNodeId);
                event.setNodeName(inst.getName());
                event.setNodeIp(inst.getBaseUrl());
                event.setMetric("probe_stale");
                event.setCurrentValue(staleMins);
                event.setThreshold(rule.getThreshold());
                event.setMessage(message);
                event.setSeverity(effectiveSeverity);
                event.setNotifyType(rule.getNotifyType());
                event.setNotifyTarget(rule.getNotifyTarget());
                event.setTimestamp(now);
                event.setEscalation(isEscalation);
                event.setCategory(resolveCategory("probe_stale"));
                aggregationService.submitAlert(event);

                rule.setLastTriggeredAt(now);
                rule.setUpdatedTime(now);
                alertRuleMapper.updateById(rule);
                log.info("[Alert] {} - {}", rule.getName(), message);
                break; // One trigger per rule per cycle
            }
        } catch (Exception e) {
            log.error("[Alert] evaluateProbeStaleRule error: {}", e.getMessage(), e);
        }
    }

    // ==================== XUI Client Expiry / Traffic ====================

    private void evaluateXuiClientRules(MonitorAlertRule rule, long now, boolean isEscalation) {
        try {
            List<XuiClientSnapshot> clients = xuiClientSnapshotMapper.selectList(
                    new LambdaQueryWrapper<XuiClientSnapshot>()
                            .eq(XuiClientSnapshot::getStatus, 0)
                            .eq(XuiClientSnapshot::getEnable, 1));

            for (XuiClientSnapshot client : clients) {
                boolean triggered = false;
                double currentValue = 0;
                String message = "";
                String clientName = client.getEmail() != null ? client.getEmail() : "ID:" + client.getId();
                Long clientNodeId = 1_000_000L + client.getId(); // 高位 ID 空间
                String durationKey = rule.getId() + ":xui:" + client.getId();

                if ("xui_client_expiry".equals(rule.getMetric())) {
                    if (client.getExpiryTime() == null || client.getExpiryTime() <= 0) continue;
                    long daysRemaining = (client.getExpiryTime() - now) / (24 * 60 * 60 * 1000L);
                    currentValue = daysRemaining;
                    triggered = daysRemaining <= rule.getThreshold().longValue();
                    if (!triggered) {
                        aggregationService.markRecovered(rule.getId(), clientNodeId,
                                rule.getName(), clientName, rule.getMetric());
                        durationTracker.remove(durationKey);
                        continue;
                    }
                    if (daysRemaining < 0) {
                        message = String.format("XUI 客户端「%s」已过期 %d 天", clientName, Math.abs(daysRemaining));
                    } else {
                        message = String.format("XUI 客户端「%s」将在 %d 天后到期", clientName, daysRemaining);
                    }
                } else if ("xui_client_traffic".equals(rule.getMetric())) {
                    if (client.getTotal() == null || client.getTotal() <= 0) continue; // unlimited
                    long used = (client.getUp() != null ? client.getUp() : 0)
                              + (client.getDown() != null ? client.getDown() : 0);
                    currentValue = (double) used / client.getTotal() * 100;
                    triggered = compare(currentValue, rule.getOperator(), rule.getThreshold());
                    if (!triggered) {
                        aggregationService.markRecovered(rule.getId(), clientNodeId,
                                rule.getName(), clientName, rule.getMetric());
                        durationTracker.remove(durationKey);
                        continue;
                    }
                    message = String.format("XUI 客户端「%s」流量已用 %.1f%% (%s / %s)",
                            clientName, currentValue,
                            formatTraffic(used), formatTraffic(client.getTotal()));
                }

                if (triggered) {
                    // Duration debounce
                    int requiredDuration = rule.getDurationSeconds() != null ? rule.getDurationSeconds() : 0;
                    if (requiredDuration > 0) {
                        long firstTriggeredAt = durationTracker.computeIfAbsent(durationKey, k -> now);
                        if ((now - firstTriggeredAt) / 1000 < requiredDuration) continue;
                        durationTracker.remove(durationKey);
                    }

                    String baseSeverity = rule.getSeverity() != null ? rule.getSeverity() : "warning";
                    String effectiveSeverity = isEscalation ? escalateSeverity(baseSeverity) : baseSeverity;
                    if (isEscalation) message = "[升级] " + message;

                    AlertAggregationService.AlertEvent event = new AlertAggregationService.AlertEvent();
                    event.setRuleId(rule.getId());
                    event.setRuleName(rule.getName());
                    event.setNodeId(clientNodeId);
                    event.setNodeName(clientName);
                    event.setMetric(rule.getMetric());
                    event.setCurrentValue(currentValue);
                    event.setThreshold(rule.getThreshold());
                    event.setMessage(message);
                    event.setSeverity(effectiveSeverity);
                    event.setNotifyType(rule.getNotifyType());
                    event.setNotifyTarget(rule.getNotifyTarget());
                    event.setTimestamp(now);
                    event.setEscalation(isEscalation);
                    event.setCategory(resolveCategory(rule.getMetric()));
                    aggregationService.submitAlert(event);

                    rule.setLastTriggeredAt(now);
                    rule.setUpdatedTime(now);
                    alertRuleMapper.updateById(rule);
                    log.info("[Alert] {} - {}", rule.getName(), message);
                    break; // One trigger per rule per cycle
                }
            }
        } catch (Exception e) {
            log.error("[Alert] evaluateXuiClientRules error: {}", e.getMessage(), e);
        }
    }
}
