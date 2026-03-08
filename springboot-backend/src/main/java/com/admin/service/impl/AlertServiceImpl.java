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
import org.apache.http.util.EntityUtils;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import java.nio.charset.StandardCharsets;
import java.util.*;

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
            // Check cooldown
            if (rule.getLastTriggeredAt() != null) {
                int cooldownMs = (rule.getCooldownMinutes() != null ? rule.getCooldownMinutes() : 5) * 60 * 1000;
                if (now - rule.getLastTriggeredAt() < cooldownMs) continue;
            }

            // Determine which nodes to check
            List<MonitorNodeSnapshot> targetNodes = filterNodesByScope(allNodes, rule);

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

                if (triggered) {
                    // Create log
                    MonitorAlertLog logEntry = new MonitorAlertLog();
                    logEntry.setRuleId(rule.getId());
                    logEntry.setRuleName(rule.getName());
                    logEntry.setNodeId(node.getId());
                    logEntry.setNodeName(node.getName());
                    logEntry.setMetric(rule.getMetric());
                    logEntry.setCurrentValue(currentValue);
                    logEntry.setThreshold(rule.getThreshold());
                    logEntry.setMessage(message);
                    logEntry.setCreatedTime(now);
                    logEntry.setUpdatedTime(now);
                    logEntry.setStatus(0);

                    // Send notification
                    String notifyStatus = sendNotification(rule, message, node);
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
        if ("cpu".equals(metric) || "mem".equals(metric) || "disk".equals(metric)) {
            return String.format("%.1f%%", value);
        }
        if ("net_in".equals(metric) || "net_out".equals(metric)) {
            if (value < 1024) return String.format("%.0f B/s", value);
            if (value < 1024 * 1024) return String.format("%.1f KB/s", value / 1024);
            return String.format("%.1f MB/s", value / (1024 * 1024));
        }
        return String.format("%.2f", value);
    }

    private String sendNotification(MonitorAlertRule rule, String message, MonitorNodeSnapshot node) {
        if (!"webhook".equals(rule.getNotifyType()) || !StringUtils.hasText(rule.getNotifyTarget())) {
            return "sent"; // log-only mode
        }

        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("ruleName", rule.getName());
            payload.put("metric", rule.getMetric());
            payload.put("nodeName", node.getName());
            payload.put("nodeIp", node.getIp());
            payload.put("message", message);
            payload.put("timestamp", System.currentTimeMillis());

            CloseableHttpClient client = HttpClients.createDefault();
            HttpPost request = new HttpPost(rule.getNotifyTarget());
            request.setConfig(RequestConfig.custom().setConnectTimeout(5000).setSocketTimeout(10000).build());
            request.setHeader("Content-Type", "application/json");
            request.setEntity(new StringEntity(JSON.toJSONString(payload), StandardCharsets.UTF_8));

            try (CloseableHttpResponse response = client.execute(request)) {
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
}
