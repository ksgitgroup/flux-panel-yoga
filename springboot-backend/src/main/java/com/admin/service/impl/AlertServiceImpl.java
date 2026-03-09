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
import com.admin.common.utils.WeChatWorkUtil;
import com.admin.entity.MonitorInstance;
import com.admin.entity.ViteConfig;
import com.admin.mapper.MonitorInstanceMapper;
import com.admin.mapper.ViteConfigMapper;
import com.admin.service.AlertService;
import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.impl.conn.PoolingHttpClientConnectionManager;
import org.apache.http.util.EntityUtils;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.admin.entity.DiagnosisRecord;
import com.admin.mapper.DiagnosisRecordMapper;

import javax.annotation.Resource;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class AlertServiceImpl extends ServiceImpl<MonitorAlertRuleMapper, MonitorAlertRule> implements AlertService {

    /** 共享连接池 HttpClient，用于 Webhook 通知 */
    private static final CloseableHttpClient SHARED_CLIENT;
    static {
        PoolingHttpClientConnectionManager cm = new PoolingHttpClientConnectionManager();
        cm.setMaxTotal(20);
        cm.setDefaultMaxPerRoute(5);
        SHARED_CLIENT = HttpClients.custom().setConnectionManager(cm).build();
    }

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
    private ViteConfigMapper viteConfigMapper;
    @Resource
    private DiagnosisRecordMapper diagnosisRecordMapper;

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

    // ==================== Alert Evaluation Engine ====================

    @Override
    public void evaluateAlerts() {
        List<MonitorAlertRule> rules = alertRuleMapper.selectList(
                new LambdaQueryWrapper<MonitorAlertRule>()
                        .eq(MonitorAlertRule::getStatus, 0)
                        .eq(MonitorAlertRule::getEnabled, 1));
        if (rules.isEmpty()) return;

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
                    // Within cooldown - check if escalation applies
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

            // ===== Forward health metric: separate evaluation path =====
            if ("forward_health".equals(rule.getMetric())) {
                evaluateForwardHealthRule(rule, now, isEscalation);
                continue;
            }

            // Determine which nodes to check
            List<MonitorNodeSnapshot> targetNodes = filterNodesByScope(allNodes, rule);
            targetNodes = filterNodesByProbeCondition(targetNodes, rule);

            for (MonitorNodeSnapshot node : targetNodes) {
                boolean triggered = false;
                double currentValue = 0;
                String message;

                if ("offline".equals(rule.getMetric())) {
                    // Offline alert: node.online != 1
                    if (node.getOnline() == null || node.getOnline() != 1) {
                        triggered = true;
                        message = String.format("节点「%s」已离线", node.getName());
                    } else {
                        continue;
                    }
                } else if ("expiry".equals(rule.getMetric())) {
                    // Expiry alert: threshold = days remaining to trigger (e.g. 7 means alert when <=7 days left)
                    if (node.getExpiredAt() == null || node.getExpiredAt() <= 0) continue;
                    long daysRemaining = (node.getExpiredAt() - now) / (24 * 60 * 60 * 1000L);
                    currentValue = daysRemaining;
                    // For expiry, we always use "lte" logic: alert when days remaining <= threshold
                    triggered = daysRemaining <= (long) rule.getThreshold().intValue();
                    if (!triggered) continue;
                    if (daysRemaining < 0) {
                        message = String.format("节点「%s」已过期 %d 天", node.getName(), Math.abs(daysRemaining));
                    } else {
                        message = String.format("节点「%s」将在 %d 天后到期", node.getName(), daysRemaining);
                    }
                } else if ("traffic_quota".equals(rule.getMetric())) {
                    // Traffic quota alert: threshold = usage percentage (e.g. 80 means alert when >=80% used)
                    if (node.getTrafficLimit() == null || node.getTrafficLimit() <= 0) continue;
                    long used = node.getTrafficUsed() != null ? node.getTrafficUsed() : 0;
                    currentValue = (double) used / node.getTrafficLimit() * 100;
                    triggered = compare(currentValue, rule.getOperator(), rule.getThreshold());
                    if (!triggered) continue;
                    message = String.format("节点「%s」流量已用 %.1f%% (%s / %s)",
                            node.getName(), currentValue,
                            formatTraffic(used), formatTraffic(node.getTrafficLimit()));
                } else {
                    MonitorMetricLatest metric = metricMap.get(node.getId());
                    if (metric == null) continue;

                    currentValue = getMetricValue(metric, rule.getMetric(), node);
                    triggered = compare(currentValue, rule.getOperator(), rule.getThreshold());
                    if (!triggered) continue;
                    message = String.format("节点「%s」%s=%s 超过阈值 %s %s",
                            node.getName(), rule.getMetric(),
                            formatValue(currentValue, rule.getMetric()),
                            rule.getOperator(), formatValue(rule.getThreshold(), rule.getMetric()));
                }

                // Duration debounce: require condition to persist for durationSeconds
                String durationKey = rule.getId() + ":" + node.getId();
                if (!triggered) {
                    // Condition cleared — remove from tracker
                    durationTracker.remove(durationKey);
                }

                if (triggered) {
                    // Check duration requirement
                    int requiredDuration = rule.getDurationSeconds() != null ? rule.getDurationSeconds() : 0;
                    if (requiredDuration > 0) {
                        long firstTriggeredAt = durationTracker.computeIfAbsent(durationKey, k -> now);
                        long elapsedSec = (now - firstTriggeredAt) / 1000;
                        if (elapsedSec < requiredDuration) {
                            // Not yet sustained long enough — skip this alert
                            continue;
                        }
                        // Sustained long enough — clear tracker and proceed with alert
                        durationTracker.remove(durationKey);
                    }

                    // Determine effective severity (escalate if applicable)
                    String baseSeverity = rule.getSeverity() != null ? rule.getSeverity() : "warning";
                    String effectiveSeverity = baseSeverity;
                    if (isEscalation) {
                        effectiveSeverity = escalateSeverity(baseSeverity);
                        message = "[升级] " + message;
                    }

                    // Create log
                    MonitorAlertLog logEntry = new MonitorAlertLog();
                    logEntry.setRuleId(rule.getId());
                    logEntry.setRuleName(rule.getName());
                    logEntry.setNodeId(node.getId());
                    logEntry.setNodeName(node.getName());
                    logEntry.setMetric(rule.getMetric());
                    logEntry.setCurrentValue(currentValue);
                    logEntry.setThreshold(rule.getThreshold());
                    logEntry.setMessage(String.format("[%s] %s", effectiveSeverity.toUpperCase(), message));
                    logEntry.setCreatedTime(now);
                    logEntry.setUpdatedTime(now);
                    logEntry.setStatus(0);

                    // Send notification
                    String notifyStatus = sendNotification(rule, effectiveSeverity, message, node);
                    logEntry.setNotifyStatus(notifyStatus);
                    alertLogMapper.insert(logEntry);

                    // Update cooldown
                    rule.setLastTriggeredAt(now);
                    rule.setUpdatedTime(now);
                    alertRuleMapper.updateById(rule);

                    log.info("[Alert] {} - {}", rule.getName(), message);
                    break; // One trigger per rule per evaluation cycle
                }
            }
        }
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

        // Build instance type map
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
            // Only include nodes where the same IP has both komari and pika probes
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

    private String formatValue(double value, String metric) {
        if ("cpu".equals(metric) || "mem".equals(metric) || "disk".equals(metric) || "traffic_quota".equals(metric)) {
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

    /**
     * 转发健康度告警评估。
     * 查询最近的 DiagnosisRecord，计算健康分 = 100 - packetLoss - (avgTime > 500 ? 30 : avgTime > 200 ? 15 : 0) - (失败 ? 50 : 0)
     * threshold: 低于此分数触发（如 60）
     * durationSeconds: 持续低于阈值多久才真正告警
     */
    private void evaluateForwardHealthRule(MonitorAlertRule rule, long now, boolean isEscalation) {
        try {
            // Get all recent diagnosis records (latest per forward)
            List<DiagnosisRecord> records = diagnosisRecordMapper.selectList(
                    new LambdaQueryWrapper<DiagnosisRecord>()
                            .eq(DiagnosisRecord::getTargetType, "forward")
                            .orderByDesc(DiagnosisRecord::getCreatedTime));

            // Group by targetId, keep only latest
            Map<Integer, DiagnosisRecord> latestByForward = new LinkedHashMap<>();
            for (DiagnosisRecord r : records) {
                latestByForward.putIfAbsent(r.getTargetId(), r);
            }

            for (Map.Entry<Integer, DiagnosisRecord> entry : latestByForward.entrySet()) {
                DiagnosisRecord rec = entry.getValue();
                // Skip stale records (older than 1 hour)
                if (rec.getCreatedTime() != null && now - rec.getCreatedTime() > 3600_000) continue;

                // Calculate health score
                double healthScore = 100.0;
                if (rec.getOverallSuccess() == null || !rec.getOverallSuccess()) {
                    healthScore -= 50;
                }
                if (rec.getPacketLoss() != null) {
                    healthScore -= rec.getPacketLoss(); // e.g. 20% loss → -20
                }
                if (rec.getAverageTime() != null) {
                    if (rec.getAverageTime() > 500) healthScore -= 30;
                    else if (rec.getAverageTime() > 200) healthScore -= 15;
                    else if (rec.getAverageTime() > 100) healthScore -= 5;
                }
                healthScore = Math.max(0, Math.min(100, healthScore));

                boolean triggered = healthScore < (rule.getThreshold() != null ? rule.getThreshold() : 60);
                String durationKey = rule.getId() + ":fwd:" + rec.getTargetId();

                if (!triggered) {
                    durationTracker.remove(durationKey);
                    continue;
                }

                // Duration debounce
                int requiredDuration = rule.getDurationSeconds() != null ? rule.getDurationSeconds() : 0;
                if (requiredDuration > 0) {
                    long firstTriggeredAt = durationTracker.computeIfAbsent(durationKey, k -> now);
                    long elapsedSec = (now - firstTriggeredAt) / 1000;
                    if (elapsedSec < requiredDuration) continue;
                    durationTracker.remove(durationKey);
                }

                String baseSeverity = rule.getSeverity() != null ? rule.getSeverity() : "warning";
                String effectiveSeverity = isEscalation ? escalateSeverity(baseSeverity) : baseSeverity;

                String forwardName = rec.getTargetName() != null ? rec.getTargetName() : "ID:" + rec.getTargetId();
                String message = String.format("%s转发「%s」健康度 %.0f%% 低于阈值 %.0f%%（丢包:%.1f%% 延迟:%.0fms 连通:%s）",
                        isEscalation ? "[升级] " : "",
                        forwardName, healthScore, rule.getThreshold(),
                        rec.getPacketLoss() != null ? rec.getPacketLoss() : 0,
                        rec.getAverageTime() != null ? rec.getAverageTime() : 0,
                        (rec.getOverallSuccess() != null && rec.getOverallSuccess()) ? "正常" : "异常");

                // Create alert log (use targetId as nodeId for forward alerts)
                MonitorAlertLog logEntry = new MonitorAlertLog();
                logEntry.setRuleId(rule.getId());
                logEntry.setRuleName(rule.getName());
                logEntry.setNodeId(rec.getTargetId() != null ? rec.getTargetId().longValue() : null);
                logEntry.setNodeName(forwardName);
                logEntry.setMetric("forward_health");
                logEntry.setCurrentValue(healthScore);
                logEntry.setThreshold(rule.getThreshold());
                logEntry.setMessage(String.format("[%s] %s", effectiveSeverity.toUpperCase(), message));
                logEntry.setCreatedTime(now);
                logEntry.setUpdatedTime(now);
                logEntry.setStatus(0);

                // Send notification (use a dummy node for compatibility)
                MonitorNodeSnapshot dummyNode = new MonitorNodeSnapshot();
                dummyNode.setName(forwardName);
                String notifyStatus = sendNotification(rule, effectiveSeverity, message, dummyNode);
                logEntry.setNotifyStatus(notifyStatus);
                alertLogMapper.insert(logEntry);

                // Update cooldown
                rule.setLastTriggeredAt(now);
                rule.setUpdatedTime(now);
                alertRuleMapper.updateById(rule);

                log.info("[Alert] {} - {}", rule.getName(), message);
                break; // One trigger per rule per cycle
            }
        } catch (Exception e) {
            log.error("[Alert] evaluateForwardHealthRule error: {}", e.getMessage(), e);
        }
    }

    private String escalateSeverity(String severity) {
        if ("info".equals(severity)) return "warning";
        if ("warning".equals(severity)) return "critical";
        return "critical"; // already critical stays critical
    }

    private String sendNotification(MonitorAlertRule rule, String severity, String message, MonitorNodeSnapshot node) {
        if ("wechat".equals(rule.getNotifyType())) {
            return sendWeChatNotification(rule, severity, message, node);
        }

        if (!"webhook".equals(rule.getNotifyType()) || !StringUtils.hasText(rule.getNotifyTarget())) {
            return "sent"; // log-only mode
        }

        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("ruleName", rule.getName());
            payload.put("severity", severity);
            payload.put("metric", rule.getMetric());
            payload.put("nodeName", node.getName());
            payload.put("nodeIp", node.getIp());
            payload.put("message", message);
            payload.put("timestamp", System.currentTimeMillis());

            HttpPost request = new HttpPost(rule.getNotifyTarget());
            request.setConfig(RequestConfig.custom().setConnectTimeout(5000).setSocketTimeout(10000).build());
            request.setHeader("Content-Type", "application/json");
            request.setEntity(new StringEntity(JSON.toJSONString(payload), StandardCharsets.UTF_8));

            try (CloseableHttpResponse response = SHARED_CLIENT.execute(request)) {
                int statusCode = response.getStatusLine().getStatusCode();
                EntityUtils.consumeQuietly(response.getEntity());
                if (statusCode >= 200 && statusCode < 300) {
                    return "sent";
                } else {
                    log.warn("[Alert] Webhook returned HTTP {}", statusCode);
                    return "failed";
                }
            }
        } catch (Exception e) {
            log.warn("[Alert] Webhook failed: {}", e.getMessage());
            return "failed";
        }
    }

    private String sendWeChatNotification(MonitorAlertRule rule, String severity, String message, MonitorNodeSnapshot node) {
        try {
            // Read webhook URL from config
            ViteConfig config = viteConfigMapper.selectOne(
                    new LambdaQueryWrapper<ViteConfig>().eq(ViteConfig::getName, "wechat_webhook_url"));
            String webhookUrl = config != null ? config.getValue() : null;
            if (!StringUtils.hasText(webhookUrl)) {
                log.warn("[Alert] 企业微信 Webhook URL 未配置");
                return "failed";
            }

            // Build markdown message with severity
            String severityIcon = "critical".equals(severity) ? "\uD83D\uDD34" : "warning".equals(severity) ? "⚠️" : "\u2139\uFE0F";
            String markdown = String.format(
                    "## %s [%s] 告警: %s\n" +
                    "> **节点**: %s (%s)\n" +
                    "> **指标**: %s\n" +
                    "> **详情**: %s\n" +
                    "> **时间**: %s",
                    severityIcon, severity.toUpperCase(), rule.getName(),
                    node.getName(), node.getIp() != null ? node.getIp() : "-",
                    rule.getMetric(),
                    message,
                    new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new java.util.Date())
            );

            boolean success = WeChatWorkUtil.sendMarkdown(webhookUrl, markdown);
            return success ? "sent" : "failed";
        } catch (Exception e) {
            log.warn("[Alert] 企业微信通知失败: {}", e.getMessage());
            return "failed";
        }
    }
}
