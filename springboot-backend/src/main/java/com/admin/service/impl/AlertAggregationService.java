package com.admin.service.impl;

import com.admin.common.utils.WeChatWorkUtil;
import com.admin.entity.*;
import com.admin.mapper.*;
import com.admin.service.NotificationService;
import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.impl.conn.PoolingHttpClientConnectionManager;
import org.apache.http.util.EntityUtils;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 告警聚合引擎
 *
 * 核心能力:
 * 1. 时间窗口聚合 — 同一服务器多指标异常合并为一条摘要
 * 2. 关联抑制 — 服务器离线时抑制其他指标告警
 * 3. 恢复通知 — 指标恢复正常时发送恢复消息
 * 4. 分级路由 — Critical走专线, Warning走聚合摘要, Info仅站内
 * 5. 站内通知 — 所有告警同步写入 notification 表
 */
@Slf4j
@Service
public class AlertAggregationService {

    private static final CloseableHttpClient SHARED_CLIENT;
    static {
        PoolingHttpClientConnectionManager cm = new PoolingHttpClientConnectionManager();
        cm.setMaxTotal(20);
        cm.setDefaultMaxPerRoute(5);
        SHARED_CLIENT = HttpClients.custom().setConnectionManager(cm).build();
    }

    @Resource
    private MonitorAlertLogMapper alertLogMapper;
    @Resource
    private MonitorAlertRuleMapper alertRuleMapper;
    @Resource
    private ViteConfigMapper viteConfigMapper;
    @Resource
    private NotificationService notificationService;
    @Resource
    private MonitorNodeSnapshotMapper nodeSnapshotMapper;

    // ==================== Aggregation Buffer ====================

    /** 当前窗口内的告警事件, key = nodeName/targetName */
    private final Map<String, List<AlertEvent>> windowBuffer = new ConcurrentHashMap<>();

    /** 上一轮活跃告警状态, key = "ruleId:nodeId", 用于检测恢复 */
    private final ConcurrentHashMap<String, AlertEvent> activeAlerts = new ConcurrentHashMap<>();

    /** 上次 flush 时间 */
    private volatile long lastFlushAt = 0;

    /** 聚合窗口: 5分钟 */
    private static final long AGGREGATION_WINDOW_MS = 5 * 60 * 1000;

    @Data
    public static class AlertEvent {
        private Long ruleId;
        private String ruleName;
        private Long nodeId;
        private String nodeName;
        private String nodeIp;
        private String metric;
        private double currentValue;
        private double threshold;
        private String message;
        private String severity;   // effective severity
        private String notifyType; // log, webhook, wechat
        private String notifyTarget;
        private long timestamp;
        private boolean escalation;
    }

    // ==================== Public API ====================

    /**
     * 将告警事件投入聚合缓冲区 (由 AlertServiceImpl 调用)
     */
    public void submitAlert(AlertEvent event) {
        String key = event.getNodeName() != null ? event.getNodeName() : "unknown";
        windowBuffer.computeIfAbsent(key, k -> Collections.synchronizedList(new ArrayList<>())).add(event);

        // 记录活跃告警状态
        String activeKey = event.getRuleId() + ":" + event.getNodeId();
        activeAlerts.put(activeKey, event);
    }

    /**
     * 标记指标已恢复 (由 AlertServiceImpl 调用, 当条件不再满足时)
     */
    public void markRecovered(Long ruleId, Long nodeId, String ruleName, String nodeName, String metric) {
        String activeKey = ruleId + ":" + nodeId;
        AlertEvent prev = activeAlerts.remove(activeKey);
        if (prev != null) {
            // 生成恢复事件
            AlertEvent recovery = new AlertEvent();
            recovery.setRuleId(ruleId);
            recovery.setRuleName(ruleName);
            recovery.setNodeId(nodeId);
            recovery.setNodeName(nodeName);
            recovery.setNodeIp(prev.getNodeIp());
            recovery.setMetric(metric);
            recovery.setCurrentValue(prev.getCurrentValue());
            recovery.setThreshold(prev.getThreshold());
            recovery.setSeverity("info");
            recovery.setNotifyType(prev.getNotifyType());
            recovery.setNotifyTarget(prev.getNotifyTarget());
            recovery.setTimestamp(System.currentTimeMillis());
            recovery.setMessage(String.format("已恢复: %s「%s」%s 恢复正常", ruleName, nodeName, metric));

            String key = nodeName != null ? nodeName : "unknown";
            windowBuffer.computeIfAbsent(key, k -> Collections.synchronizedList(new ArrayList<>())).add(recovery);

            log.info("[AlertAggregation] Recovery detected: {} - {}", ruleName, nodeName);
        }
    }

    /**
     * 检查聚合窗口, 如果到期则 flush 并发送聚合摘要
     * 每次 evaluateAlerts() 结束后调用
     */
    public void checkAndFlush() {
        long now = System.currentTimeMillis();

        // 首次初始化
        if (lastFlushAt == 0) {
            lastFlushAt = now;
            return;
        }

        // 窗口未到期且没有 critical 事件 — 等待
        boolean hasCritical = windowBuffer.values().stream()
                .flatMap(List::stream)
                .anyMatch(e -> "critical".equals(e.getSeverity()));

        if (!hasCritical && (now - lastFlushAt) < AGGREGATION_WINDOW_MS) {
            return;
        }

        // Flush
        flush(now);
    }

    // ==================== Core Flush Logic ====================

    private void flush(long now) {
        if (windowBuffer.isEmpty()) {
            lastFlushAt = now;
            return;
        }

        // Snapshot and clear buffer
        Map<String, List<AlertEvent>> snapshot = new LinkedHashMap<>();
        for (Map.Entry<String, List<AlertEvent>> entry : windowBuffer.entrySet()) {
            List<AlertEvent> events;
            synchronized (entry.getValue()) {
                events = new ArrayList<>(entry.getValue());
                entry.getValue().clear();
            }
            if (!events.isEmpty()) {
                snapshot.put(entry.getKey(), events);
            }
        }
        // Clean up empty keys
        windowBuffer.entrySet().removeIf(e -> e.getValue().isEmpty());
        lastFlushAt = now;

        if (snapshot.isEmpty()) return;

        // 1. Apply correlation suppression (offline suppresses other metrics for same node)
        applyCorrelationSuppression(snapshot);

        // 2. Deduplicate within each node group (keep latest per metric)
        deduplicateEvents(snapshot);

        // 3. Separate by severity for routing
        List<AlertEvent> criticalEvents = new ArrayList<>();
        List<AlertEvent> warningEvents = new ArrayList<>();
        List<AlertEvent> infoEvents = new ArrayList<>();
        List<AlertEvent> recoveryEvents = new ArrayList<>();

        for (List<AlertEvent> events : snapshot.values()) {
            for (AlertEvent e : events) {
                if (e.getMessage() != null && e.getMessage().startsWith("已恢复:")) {
                    recoveryEvents.add(e);
                } else if ("critical".equals(e.getSeverity())) {
                    criticalEvents.add(e);
                } else if ("warning".equals(e.getSeverity())) {
                    warningEvents.add(e);
                } else {
                    infoEvents.add(e);
                }
            }
        }

        // 4. Write alert logs for all events
        writeAlertLogs(snapshot, now);

        // 5. Route by severity
        // Critical: send immediately (individual messages, not aggregated)
        for (AlertEvent ce : criticalEvents) {
            sendCriticalAlert(ce);
        }

        // Warning + Recovery: send aggregated summary
        List<AlertEvent> summaryEvents = new ArrayList<>();
        summaryEvents.addAll(warningEvents);
        summaryEvents.addAll(recoveryEvents);
        if (!summaryEvents.isEmpty()) {
            sendAggregatedSummary(summaryEvents, now);
        }

        // Info: site notification only (already written in writeAlertLogs)

        // 6. Write site notifications for all events
        writeSiteNotifications(snapshot);

        int totalEvents = snapshot.values().stream().mapToInt(List::size).sum();
        log.info("[AlertAggregation] Flushed {} events (critical:{}, warning:{}, info:{}, recovery:{})",
                totalEvents, criticalEvents.size(), warningEvents.size(), infoEvents.size(), recoveryEvents.size());
    }

    // ==================== Correlation Suppression ====================

    /**
     * 如果同一节点同时有 offline 告警, 则抑制该节点的其他指标告警
     */
    private void applyCorrelationSuppression(Map<String, List<AlertEvent>> snapshot) {
        for (Map.Entry<String, List<AlertEvent>> entry : snapshot.entrySet()) {
            List<AlertEvent> events = entry.getValue();
            boolean hasOffline = events.stream().anyMatch(e -> "offline".equals(e.getMetric()));
            if (hasOffline && events.size() > 1) {
                int before = events.size();
                events.removeIf(e -> !"offline".equals(e.getMetric()) && !e.getMessage().startsWith("已恢复:"));
                int suppressed = before - events.size();
                if (suppressed > 0) {
                    log.info("[AlertAggregation] Suppressed {} alerts for offline node {}", suppressed, entry.getKey());
                }
            }
        }
    }

    /**
     * 同一节点同一指标只保留最新一条
     */
    private void deduplicateEvents(Map<String, List<AlertEvent>> snapshot) {
        for (Map.Entry<String, List<AlertEvent>> entry : snapshot.entrySet()) {
            List<AlertEvent> events = entry.getValue();
            Map<String, AlertEvent> latest = new LinkedHashMap<>();
            for (AlertEvent e : events) {
                String dedupKey = e.getMetric() + ":" + (e.getMessage() != null && e.getMessage().startsWith("已恢复:") ? "recovery" : "alert");
                AlertEvent existing = latest.get(dedupKey);
                if (existing == null || e.getTimestamp() > existing.getTimestamp()) {
                    latest.put(dedupKey, e);
                }
            }
            events.clear();
            events.addAll(latest.values());
        }
    }

    // ==================== Write Alert Logs ====================

    private void writeAlertLogs(Map<String, List<AlertEvent>> snapshot, long now) {
        for (List<AlertEvent> events : snapshot.values()) {
            for (AlertEvent e : events) {
                MonitorAlertLog logEntry = new MonitorAlertLog();
                logEntry.setRuleId(e.getRuleId());
                logEntry.setRuleName(e.getRuleName());
                logEntry.setNodeId(e.getNodeId());
                logEntry.setNodeName(e.getNodeName());
                logEntry.setMetric(e.getMetric());
                logEntry.setCurrentValue(e.getCurrentValue());
                logEntry.setThreshold(e.getThreshold());
                logEntry.setMessage(String.format("[%s] %s", e.getSeverity().toUpperCase(), e.getMessage()));
                logEntry.setNotifyStatus("sent");
                logEntry.setCreatedTime(e.getTimestamp());
                logEntry.setUpdatedTime(now);
                logEntry.setStatus(0);
                alertLogMapper.insert(logEntry);
            }
        }
    }

    // ==================== Site Notifications ====================

    private void writeSiteNotifications(Map<String, List<AlertEvent>> snapshot) {
        for (List<AlertEvent> events : snapshot.values()) {
            for (AlertEvent e : events) {
                boolean isRecovery = e.getMessage() != null && e.getMessage().startsWith("已恢复:");
                String type = isRecovery ? "alert_recovery" : "alert";
                try {
                    notificationService.send(
                            e.getRuleName(),
                            e.getMessage(),
                            type,
                            e.getSeverity(),
                            "alert_engine",
                            e.getRuleId());
                } catch (Exception ex) {
                    log.warn("[AlertAggregation] Failed to write site notification: {}", ex.getMessage());
                }
            }
        }
    }

    // ==================== Critical: Immediate Individual Alert ====================

    private void sendCriticalAlert(AlertEvent event) {
        String wechatUrl = getWeChatWebhookUrl();
        if (StringUtils.hasText(wechatUrl)) {
            String markdown = formatCriticalMarkdown(event);
            WeChatWorkUtil.sendMarkdown(wechatUrl, markdown);
        }

        // Also send via rule's own channel if it's webhook
        if ("webhook".equals(event.getNotifyType()) && StringUtils.hasText(event.getNotifyTarget())) {
            sendWebhook(event);
        }
    }

    private String formatCriticalMarkdown(AlertEvent event) {
        SimpleDateFormat sdf = new SimpleDateFormat("HH:mm:ss");
        return String.format(
                "## \uD83D\uDD34 CRITICAL 紧急告警\n" +
                "> **规则**: %s\n" +
                "> **节点**: %s (%s)\n" +
                "> **详情**: %s\n" +
                "> **时间**: %s\n\n" +
                "请立即处理!",
                event.getRuleName(),
                event.getNodeName(),
                event.getNodeIp() != null ? event.getNodeIp() : "-",
                event.getMessage(),
                sdf.format(new Date(event.getTimestamp()))
        );
    }

    // ==================== Warning: Aggregated Summary ====================

    private void sendAggregatedSummary(List<AlertEvent> events, long now) {
        String wechatUrl = getWeChatWebhookUrl();

        // Group events by node for summary
        Map<String, List<AlertEvent>> byNode = new LinkedHashMap<>();
        for (AlertEvent e : events) {
            byNode.computeIfAbsent(e.getNodeName() != null ? e.getNodeName() : "unknown",
                    k -> new ArrayList<>()).add(e);
        }

        // Count stats
        long alertCount = events.stream().filter(e -> e.getMessage() == null || !e.getMessage().startsWith("已恢复:")).count();
        long recoveryCount = events.stream().filter(e -> e.getMessage() != null && e.getMessage().startsWith("已恢复:")).count();
        int nodeCount = byNode.size();

        // Count total online nodes for context
        long totalOnline = 0;
        try {
            totalOnline = nodeSnapshotMapper.selectCount(
                    new LambdaQueryWrapper<MonitorNodeSnapshot>()
                            .eq(MonitorNodeSnapshot::getStatus, 0)
                            .eq(MonitorNodeSnapshot::getOnline, 1));
        } catch (Exception ignored) {}

        // Build markdown
        SimpleDateFormat sdf = new SimpleDateFormat("HH:mm");
        StringBuilder md = new StringBuilder();

        if (alertCount > 0 && recoveryCount > 0) {
            md.append(String.format("## \u26A0\uFE0F 告警摘要 | %d台异常 %d项恢复 | %s\n\n",
                    nodeCount, recoveryCount, sdf.format(new Date(now))));
        } else if (recoveryCount > 0) {
            md.append(String.format("## \u2705 恢复通知 | %d项恢复 | %s\n\n",
                    recoveryCount, sdf.format(new Date(now))));
        } else {
            md.append(String.format("## \u26A0\uFE0F 告警摘要 | %d台异常 | %s\n\n",
                    nodeCount, sdf.format(new Date(now))));
        }

        for (Map.Entry<String, List<AlertEvent>> entry : byNode.entrySet()) {
            String nodeName = entry.getKey();
            List<AlertEvent> nodeEvents = entry.getValue();

            List<AlertEvent> alerts = new ArrayList<>();
            List<AlertEvent> recoveries = new ArrayList<>();
            for (AlertEvent e : nodeEvents) {
                if (e.getMessage() != null && e.getMessage().startsWith("已恢复:")) {
                    recoveries.add(e);
                } else {
                    alerts.add(e);
                }
            }

            md.append(String.format("**%s**", nodeName));
            if (!alerts.isEmpty()) {
                md.append(String.format(" (%d项异常)", alerts.size()));
            }
            md.append("\n");

            for (AlertEvent a : alerts) {
                String icon = "warning".equals(a.getSeverity()) ? "\u26A0\uFE0F" : "\u2139\uFE0F";
                md.append(String.format("> %s %s\n", icon, formatMetricBrief(a)));
            }
            for (AlertEvent r : recoveries) {
                md.append(String.format("> \u2705 %s 已恢复\n", getMetricLabel(r.getMetric())));
            }
            md.append("\n");
        }

        // Footer with global stats
        if (totalOnline > 0) {
            long alertingNodes = events.stream()
                    .filter(e -> e.getMessage() == null || !e.getMessage().startsWith("已恢复:"))
                    .map(AlertEvent::getNodeName)
                    .distinct().count();
            md.append(String.format("> \uD83D\uDCCA 全局: %d台在线 | %d台告警 | %d台正常",
                    totalOnline, alertingNodes, totalOnline - alertingNodes));
        }

        // Send
        if (StringUtils.hasText(wechatUrl)) {
            WeChatWorkUtil.sendMarkdown(wechatUrl, md.toString());
        }

        // Also send to individual webhook targets
        Set<String> sentWebhooks = new HashSet<>();
        for (AlertEvent e : events) {
            if ("webhook".equals(e.getNotifyType()) && StringUtils.hasText(e.getNotifyTarget())
                    && sentWebhooks.add(e.getNotifyTarget())) {
                sendWebhookSummary(e.getNotifyTarget(), events, now);
            }
        }
    }

    private String formatMetricBrief(AlertEvent e) {
        switch (e.getMetric()) {
            case "cpu": return String.format("CPU %.1f%% \u25B2", e.getCurrentValue());
            case "mem": return String.format("内存 %.1f%% \u25B2", e.getCurrentValue());
            case "disk": return String.format("磁盘 %.1f%% \u25B2", e.getCurrentValue());
            case "net_in": return String.format("入站 %s \u25B2", formatTraffic((long) e.getCurrentValue()));
            case "net_out": return String.format("出站 %s \u25B2", formatTraffic((long) e.getCurrentValue()));
            case "offline": return "节点离线 \u274C";
            case "expiry": return String.format("即将到期 (剩余%.0f天)", e.getCurrentValue());
            case "traffic_quota": return String.format("流量配额 %.1f%% \u25B2", e.getCurrentValue());
            case "forward_health": return String.format("转发健康度 %.0f%% \u25BC", e.getCurrentValue());
            case "load": return String.format("负载 %.2f \u25B2", e.getCurrentValue());
            case "temperature": return String.format("温度 %.1f\u00B0C \u25B2", e.getCurrentValue());
            case "connections": return String.format("连接数 %.0f \u25B2", e.getCurrentValue());
            default: return e.getMessage();
        }
    }

    private String getMetricLabel(String metric) {
        switch (metric) {
            case "cpu": return "CPU";
            case "mem": return "内存";
            case "disk": return "磁盘";
            case "net_in": return "入站流量";
            case "net_out": return "出站流量";
            case "offline": return "在线状态";
            case "expiry": return "到期";
            case "traffic_quota": return "流量配额";
            case "forward_health": return "转发健康度";
            case "load": return "系统负载";
            case "temperature": return "温度";
            case "connections": return "连接数";
            default: return metric;
        }
    }

    // ==================== Helper: Send Webhook ====================

    private void sendWebhook(AlertEvent event) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("ruleName", event.getRuleName());
            payload.put("severity", event.getSeverity());
            payload.put("metric", event.getMetric());
            payload.put("nodeName", event.getNodeName());
            payload.put("nodeIp", event.getNodeIp());
            payload.put("message", event.getMessage());
            payload.put("timestamp", event.getTimestamp());
            httpPost(event.getNotifyTarget(), JSON.toJSONString(payload));
        } catch (Exception e) {
            log.warn("[AlertAggregation] Webhook failed: {}", e.getMessage());
        }
    }

    private void sendWebhookSummary(String url, List<AlertEvent> events, long now) {
        try {
            List<Map<String, Object>> items = new ArrayList<>();
            for (AlertEvent e : events) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("ruleName", e.getRuleName());
                item.put("severity", e.getSeverity());
                item.put("metric", e.getMetric());
                item.put("nodeName", e.getNodeName());
                item.put("message", e.getMessage());
                items.add(item);
            }
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("type", "aggregated_summary");
            payload.put("count", events.size());
            payload.put("events", items);
            payload.put("timestamp", now);
            httpPost(url, JSON.toJSONString(payload));
        } catch (Exception e) {
            log.warn("[AlertAggregation] Webhook summary failed: {}", e.getMessage());
        }
    }

    private void httpPost(String url, String jsonBody) {
        try {
            HttpPost request = new HttpPost(url);
            request.setConfig(RequestConfig.custom().setConnectTimeout(5000).setSocketTimeout(10000).build());
            request.setHeader("Content-Type", "application/json");
            request.setEntity(new StringEntity(jsonBody, StandardCharsets.UTF_8));
            try (CloseableHttpResponse response = SHARED_CLIENT.execute(request)) {
                EntityUtils.consumeQuietly(response.getEntity());
            }
        } catch (Exception e) {
            log.error("[AlertAggregation] HTTP POST failed: {}", e.getMessage());
        }
    }

    private String getWeChatWebhookUrl() {
        try {
            ViteConfig config = viteConfigMapper.selectOne(
                    new LambdaQueryWrapper<ViteConfig>().eq(ViteConfig::getName, "wechat_webhook_url"));
            return config != null ? config.getValue() : null;
        } catch (Exception e) {
            return null;
        }
    }

    private String formatTraffic(long bytes) {
        if (bytes < 1024) return bytes + " B/s";
        if (bytes < 1024 * 1024) return String.format("%.1f KB/s", bytes / 1024.0);
        return String.format("%.1f MB/s", bytes / (1024.0 * 1024));
    }

    // ==================== Daily Summary ====================

    /**
     * 生成每日摘要并发送 (由 ExpiryCheckScheduler 调用)
     */
    public void sendDailySummary() {
        long now = System.currentTimeMillis();
        long dayAgo = now - 24 * 60 * 60 * 1000L;

        // Count alerts in last 24h by severity
        List<MonitorAlertLog> recentLogs = alertLogMapper.selectList(
                new LambdaQueryWrapper<MonitorAlertLog>()
                        .ge(MonitorAlertLog::getCreatedTime, dayAgo)
                        .eq(MonitorAlertLog::getStatus, 0)
                        .orderByDesc(MonitorAlertLog::getCreatedTime));

        int criticalCount = 0, warningCount = 0, infoCount = 0;
        for (MonitorAlertLog l : recentLogs) {
            String msg = l.getMessage() != null ? l.getMessage().toUpperCase() : "";
            if (msg.startsWith("[CRITICAL]")) criticalCount++;
            else if (msg.startsWith("[WARNING]")) warningCount++;
            else infoCount++;
        }

        // Count active alerts (alerts without recovery in last hour)
        int activeAlertCount = activeAlerts.size();

        // Count online nodes
        long totalNodes = 0;
        long onlineNodes = 0;
        try {
            totalNodes = nodeSnapshotMapper.selectCount(
                    new LambdaQueryWrapper<MonitorNodeSnapshot>().eq(MonitorNodeSnapshot::getStatus, 0));
            onlineNodes = nodeSnapshotMapper.selectCount(
                    new LambdaQueryWrapper<MonitorNodeSnapshot>()
                            .eq(MonitorNodeSnapshot::getStatus, 0)
                            .eq(MonitorNodeSnapshot::getOnline, 1));
        } catch (Exception ignored) {}

        SimpleDateFormat dateFmt = new SimpleDateFormat("yyyy-MM-dd");
        StringBuilder md = new StringBuilder();
        md.append(String.format("## \uD83D\uDCCB 每日告警摘要 | %s\n\n", dateFmt.format(new Date(now))));
        md.append(String.format("**昨日告警**: %d次 (P0: %d, P1: %d, P2: %d)\n",
                recentLogs.size(), criticalCount, warningCount, infoCount));
        md.append(String.format("**当前活跃告警**: %d项\n", activeAlertCount));
        md.append(String.format("**服务器健康**: %d/%d 在线\n", onlineNodes, totalNodes));

        // Top alerting nodes
        if (!recentLogs.isEmpty()) {
            Map<String, Integer> nodeAlertCount = new LinkedHashMap<>();
            for (MonitorAlertLog l : recentLogs) {
                String name = l.getNodeName() != null ? l.getNodeName() : "unknown";
                nodeAlertCount.merge(name, 1, Integer::sum);
            }
            List<Map.Entry<String, Integer>> sorted = new ArrayList<>(nodeAlertCount.entrySet());
            sorted.sort((a, b) -> b.getValue() - a.getValue());

            md.append("\n**告警最多的节点**:\n");
            int shown = 0;
            for (Map.Entry<String, Integer> entry : sorted) {
                if (shown >= 5) break;
                md.append(String.format("> %s: %d次\n", entry.getKey(), entry.getValue()));
                shown++;
            }
        }

        if (recentLogs.isEmpty()) {
            md.append("\n> \u2705 昨日无告警，一切正常!");
        }

        // Send via WeChat
        String wechatUrl = getWeChatWebhookUrl();
        if (StringUtils.hasText(wechatUrl)) {
            WeChatWorkUtil.sendMarkdown(wechatUrl, md.toString());
        }

        // Also write as site notification
        notificationService.send(
                "每日告警摘要",
                md.toString(),
                "daily_summary",
                criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : "info",
                "alert_engine",
                null);

        log.info("[AlertAggregation] Daily summary sent: {} alerts in last 24h", recentLogs.size());
    }
}
