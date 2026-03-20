package com.admin.service.impl;

import com.admin.entity.*;
import com.admin.mapper.*;
import com.admin.service.NotificationService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 告警聚合引擎
 *
 * 核心能力:
 * 1. 时间窗口聚合 — 同一服务器多指标异常合并
 * 2. 关联抑制 — 服务器离线时抑制其他指标告警
 * 3. 恢复通知 — 指标恢复正常时发送恢复消息
 * 4. 站内通知 — 所有告警写入 notification 表，外部渠道分发由通知中心(策略+渠道)统一处理
 */
@Slf4j
@Service
public class AlertAggregationService {

    @Resource
    private MonitorAlertLogMapper alertLogMapper;
    @Resource
    private NotificationService notificationService;
    @Resource
    private MonitorNodeSnapshotMapper nodeSnapshotMapper;
    @Resource
    private AssetHostMapper assetHostMapper;
    @Resource
    private MonitorAlertRuleMapper alertRuleMapper;
    @Resource
    private NotificationMapper notificationMapper;
    @Resource
    private NodeMapper nodeMapper;

    // ==================== Aggregation Buffer ====================

    /** 当前窗口内的告警事件, key = nodeName/targetName */
    private final Map<String, List<AlertEvent>> windowBuffer = new ConcurrentHashMap<>();

    /** 上一轮活跃告警状态, key = "ruleId:nodeId", 用于检测恢复 */
    private final ConcurrentHashMap<String, AlertEvent> activeAlerts = new ConcurrentHashMap<>();

    /** 上次 flush 时间 */
    private volatile long lastFlushAt = 0;

    /** 获取当前活跃告警（按 nodeId 分组，同时返回 assetId 映射） */
    public Map<Long, List<Map<String, Object>>> getActiveAlertsByNode() {
        Map<Long, List<Map<String, Object>>> result = new LinkedHashMap<>();
        for (AlertEvent e : activeAlerts.values()) {
            if (e.getNodeId() == null || e.getNodeId() <= 0) continue;
            // 查 assetId
            Long assetId = null;
            try {
                MonitorNodeSnapshot snap = nodeSnapshotMapper.selectById(e.getNodeId());
                if (snap != null) assetId = snap.getAssetId();
            } catch (Exception ignored) {}
            result.computeIfAbsent(e.getNodeId(), k -> new ArrayList<>()).add(Map.of(
                    "ruleId", e.getRuleId(),
                    "ruleName", e.getRuleName() != null ? e.getRuleName() : "",
                    "metric", e.getMetric() != null ? e.getMetric() : "",
                    "severity", e.getSeverity() != null ? e.getSeverity() : "warning",
                    "message", e.getMessage() != null ? e.getMessage() : "",
                    "category", e.getCategory() != null ? e.getCategory() : "",
                    "timestamp", e.getTimestamp()
            ));
        }
        return result;
    }

    /** 获取当前有活跃告警的 assetId 集合（引擎内存 + alert_log 近24h） */
    public Set<Long> getAlertingAssetIds() {
        Set<Long> result = new HashSet<>();

        // 1. 引擎内存中的活跃告警 → assetId（排除恢复事件）
        for (AlertEvent e : activeAlerts.values()) {
            if (e.getNodeId() == null || e.getNodeId() <= 0) continue;
            if (isRecoveryMessage(e.getMessage())) continue;
            try {
                MonitorNodeSnapshot snap = nodeSnapshotMapper.selectById(e.getNodeId());
                if (snap != null && snap.getAssetId() != null) result.add(snap.getAssetId());
            } catch (Exception ignored) {}
        }

        // 2. alert_log 表近 24h 的告警记录（排除恢复）→ 通过 nodeId 关联 assetId
        try {
            long since = System.currentTimeMillis() - 24 * 60 * 60 * 1000L;
            List<MonitorAlertLog> recentLogs = alertLogMapper.selectList(
                    new LambdaQueryWrapper<MonitorAlertLog>()
                            .eq(MonitorAlertLog::getStatus, 0)
                            .ge(MonitorAlertLog::getCreatedTime, since)
                            .isNotNull(MonitorAlertLog::getNodeId)
                            .notLike(MonitorAlertLog::getMessage, "已恢复:")
                            .select(MonitorAlertLog::getNodeId)
                            .groupBy(MonitorAlertLog::getNodeId));
            for (MonitorAlertLog log : recentLogs) {
                if (log.getNodeId() == null || log.getNodeId() <= 0) continue;
                try {
                    MonitorNodeSnapshot snap = nodeSnapshotMapper.selectById(log.getNodeId());
                    if (snap != null && snap.getAssetId() != null) result.add(snap.getAssetId());
                } catch (Exception ignored) {}
            }
        } catch (Exception e) {
            log.warn("[AlertAggregation] Failed to query alert_log for alerting assets: {}", e.getMessage());
        }

        return result;
    }

    /** 确认/已处理告警，从活跃列表中移除 + 标记通知已读 */
    public void acknowledgeAlert(Long ruleId, Long nodeId) {
        // 引擎内存中的活跃告警
        String activeKey = ruleId + ":" + nodeId;
        AlertEvent removed = activeAlerts.remove(activeKey);
        if (removed != null) {
            log.info("[AlertAggregation] Alert acknowledged (engine): rule={}, node={}", ruleId, nodeId);
        }

        // 通知表中该节点的未读告警也标记已读（ruleId=0 表示来自通知表）
        if (nodeId != null && nodeId > 0) {
            try {
                Notification update = new Notification();
                update.setReadStatus(1);
                update.setReadAt(System.currentTimeMillis());
                notificationMapper.update(update,
                        new LambdaQueryWrapper<Notification>()
                                .eq(Notification::getSourceId, nodeId)
                                .eq(Notification::getSourceModule, "gost")
                                .eq(Notification::getReadStatus, 0)
                                .isNull(Notification::getUserId));
                log.info("[AlertAggregation] Marked gost notifications as read for nodeId={}", nodeId);
            } catch (Exception e) {
                log.warn("[AlertAggregation] Failed to mark notifications read: {}", e.getMessage());
            }
        }
    }

    /** 按 assetId 获取告警详情（引擎内存 + alert_log 近24h，最多20条） */
    public List<Map<String, Object>> getActiveAlertsForAsset(Long assetId) {
        List<Map<String, Object>> result = new ArrayList<>();

        // 找出该 assetId 关联的所有 monitor_node_snapshot IDs
        Set<Long> snapshotIds = new HashSet<>();
        try {
            List<MonitorNodeSnapshot> snapshots = nodeSnapshotMapper.selectList(
                    new LambdaQueryWrapper<MonitorNodeSnapshot>()
                            .eq(MonitorNodeSnapshot::getAssetId, assetId)
                            .eq(MonitorNodeSnapshot::getStatus, 0)
                            .select(MonitorNodeSnapshot::getId));
            for (MonitorNodeSnapshot s : snapshots) snapshotIds.add(s.getId());
        } catch (Exception ignored) {}
        if (snapshotIds.isEmpty()) return result;

        // 1. 引擎内存中的活跃告警（排除恢复事件）
        Set<String> seen = new HashSet<>();
        for (AlertEvent e : activeAlerts.values()) {
            if (e.getNodeId() != null && snapshotIds.contains(e.getNodeId()) && !isRecoveryMessage(e.getMessage())) {
                String key = e.getRuleId() + ":" + e.getNodeId() + ":" + e.getMetric();
                if (seen.add(key)) {
                    Map<String, Object> m = new HashMap<>();
                    m.put("ruleId", e.getRuleId());
                    m.put("ruleName", e.getRuleName() != null ? e.getRuleName() : "");
                    m.put("nodeId", e.getNodeId());
                    m.put("metric", e.getMetric() != null ? e.getMetric() : "");
                    m.put("severity", e.getSeverity() != null ? e.getSeverity() : "warning");
                    m.put("message", e.getMessage() != null ? e.getMessage() : "");
                    m.put("category", e.getCategory() != null ? e.getCategory() : "");
                    m.put("timestamp", e.getTimestamp());
                    m.put("source", "active");
                    result.add(m);
                }
            }
        }

        // 2. alert_log 表近 24h 的历史记录（排除恢复）
        try {
            long since = System.currentTimeMillis() - 24 * 60 * 60 * 1000L;
            List<MonitorAlertLog> logs = alertLogMapper.selectList(
                    new LambdaQueryWrapper<MonitorAlertLog>()
                            .eq(MonitorAlertLog::getStatus, 0)
                            .in(MonitorAlertLog::getNodeId, snapshotIds)
                            .ge(MonitorAlertLog::getCreatedTime, since)
                            .notLike(MonitorAlertLog::getMessage, "已恢复:")
                            .orderByDesc(MonitorAlertLog::getCreatedTime)
                            .last("LIMIT 20"));
            for (MonitorAlertLog lg : logs) {
                String key = lg.getRuleId() + ":" + lg.getNodeId() + ":" + lg.getMetric();
                if (seen.add(key)) {
                    Map<String, Object> m = new HashMap<>();
                    m.put("logId", lg.getId());
                    m.put("ruleId", lg.getRuleId());
                    m.put("ruleName", lg.getRuleName() != null ? lg.getRuleName() : "");
                    m.put("nodeId", lg.getNodeId() != null ? lg.getNodeId() : 0L);
                    m.put("metric", lg.getMetric() != null ? lg.getMetric() : "");
                    m.put("severity", "warning");
                    m.put("message", lg.getMessage() != null ? lg.getMessage() : "");
                    m.put("category", "");
                    m.put("timestamp", lg.getCreatedTime());
                    m.put("source", "log");
                    result.add(m);
                }
            }
        } catch (Exception e) {
            log.warn("[AlertAggregation] Failed to query alert_log for asset {}: {}", assetId, e.getMessage());
        }

        return result;
    }

    /** 获取活跃告警汇总统计 */
    public Map<String, Object> getActiveSummary() {
        int total = activeAlerts.size();
        int critical = 0, warning = 0, info = 0;
        Set<Long> affectedNodes = new HashSet<>();
        for (AlertEvent e : activeAlerts.values()) {
            if ("critical".equals(e.getSeverity())) critical++;
            else if ("warning".equals(e.getSeverity())) warning++;
            else info++;
            if (e.getNodeId() != null && e.getNodeId() > 0) affectedNodes.add(e.getNodeId());
        }
        return Map.of("total", total, "critical", critical, "warning", warning, "info", info,
                "affectedNodes", affectedNodes.size());
    }

    /** 判断消息是否为恢复通知（不应计入告警中） */
    private static boolean isRecoveryMessage(String message) {
        if (message == null) return false;
        return message.startsWith("已恢复:") || message.startsWith("[INFO] 已恢复:") || message.contains("恢复正常");
    }

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
        private String category;    // infra, connectivity, resource
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

            // 恢复后重置规则的渐进冷却计数
            try {
                MonitorAlertRule rule = alertRuleMapper.selectById(ruleId);
                if (rule != null && rule.getTriggerCount() != null && rule.getTriggerCount() > 0) {
                    rule.setTriggerCount(0);
                    alertRuleMapper.updateById(rule);
                }
            } catch (Exception ignored) {}

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

        // 5. Write site notifications + dispatch via notification center (policies → channels)
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
        // 收集所有事件，按 ruleId 聚合（恢复事件单独分组）
        Map<String, List<AlertEvent>> groupedAlerts = new LinkedHashMap<>();
        List<AlertEvent> recoveryEvents = new ArrayList<>();

        for (List<AlertEvent> events : snapshot.values()) {
            for (AlertEvent e : events) {
                if (e.getMessage() != null && e.getMessage().startsWith("已恢复:")) {
                    recoveryEvents.add(e);
                } else {
                    String groupKey = e.getRuleId() + ":" + e.getRuleName();
                    groupedAlerts.computeIfAbsent(groupKey, k -> new ArrayList<>()).add(e);
                }
            }
        }

        // 告警事件：按规则聚合，每条规则生成 1 条汇总通知
        for (List<AlertEvent> group : groupedAlerts.values()) {
            if (group.isEmpty()) continue;
            AlertEvent first = group.get(0);
            String highestSeverity = group.stream()
                    .map(AlertEvent::getSeverity)
                    .reduce(first.getSeverity(), this::higherSeverity);

            String categoryLabel = getCategoryLabel(first.getCategory());
            String title = categoryLabel + first.getRuleName();
            String content;
            if (group.size() == 1) {
                content = first.getMessage();
            } else {
                StringBuilder sb = new StringBuilder();
                sb.append(String.format("影响节点（%d 台）：\n", group.size()));
                int shown = 0;
                for (AlertEvent e : group) {
                    if (shown < 10) {
                        sb.append(String.format("• %s", e.getMessage())).append("\n");
                        shown++;
                    }
                }
                if (group.size() > 10) {
                    sb.append(String.format("… 等共 %d 台节点\n", group.size()));
                }
                content = sb.toString().trim();
            }

            try {
                String groupCategory = first.getCategory();
                String groupTags = resolveGroupTags(group);
                notificationService.send(title, content, "alert", highestSeverity,
                        "alert_engine", first.getRuleId(), groupCategory, groupTags);
            } catch (Exception ex) {
                log.warn("[AlertAggregation] Failed to write aggregated notification: {}", ex.getMessage());
            }
        }

        // 恢复事件：也按规则聚合
        Map<String, List<AlertEvent>> groupedRecovery = new LinkedHashMap<>();
        for (AlertEvent e : recoveryEvents) {
            String groupKey = e.getRuleId() + ":" + e.getRuleName();
            groupedRecovery.computeIfAbsent(groupKey, k -> new ArrayList<>()).add(e);
        }
        for (List<AlertEvent> group : groupedRecovery.values()) {
            if (group.isEmpty()) continue;
            AlertEvent first = group.get(0);
            String content;
            if (group.size() == 1) {
                content = first.getMessage();
            } else {
                content = String.format("已恢复: %s — %d 台节点恢复正常", first.getRuleName(), group.size());
            }
            try {
                String groupCategory = first.getCategory();
                String groupTags = resolveGroupTags(group);
                notificationService.send(first.getRuleName(), content, "alert_recovery", "info",
                        "alert_engine", first.getRuleId(), groupCategory, groupTags);
            } catch (Exception ex) {
                log.warn("[AlertAggregation] Failed to write recovery notification: {}", ex.getMessage());
            }
        }
    }

    /** 从事件组中解析标签并集：通过 nodeId → MonitorNodeSnapshot.assetId → AssetHost.tags */
    private String resolveGroupTags(List<AlertEvent> events) {
        Set<String> allTags = new LinkedHashSet<>();
        for (AlertEvent e : events) {
            if (e.getNodeId() == null || e.getNodeId() <= 0) continue; // 跳过探针（负 ID）和无 ID
            try {
                MonitorNodeSnapshot snap = nodeSnapshotMapper.selectById(e.getNodeId());
                if (snap != null && snap.getAssetId() != null) {
                    AssetHost asset = assetHostMapper.selectById(snap.getAssetId());
                    if (asset != null && asset.getTags() != null && !asset.getTags().isEmpty()) {
                        for (String tag : asset.getTags().split(",")) {
                            String t = tag.trim();
                            if (!t.isEmpty()) allTags.add(t);
                        }
                    }
                }
            } catch (Exception ignored) {}
        }
        return allTags.isEmpty() ? null : String.join(",", allTags);
    }

    private String higherSeverity(String a, String b) {
        Map<String, Integer> order = Map.of("info", 0, "warning", 1, "critical", 2);
        int oa = order.getOrDefault(a, 0);
        int ob = order.getOrDefault(b, 0);
        return oa >= ob ? a : b;
    }

    private String getCategoryLabel(String category) {
        if (category == null) return "";
        switch (category) {
            case "infra": return "[基础设施] ";
            case "connectivity": return "[连通性] ";
            case "resource": return "[资源] ";
            default: return "";
        }
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

        // 按类别统计活跃告警
        if (!activeAlerts.isEmpty()) {
            Map<String, Integer> catCount = new LinkedHashMap<>();
            for (AlertEvent e : activeAlerts.values()) {
                String cat = e.getCategory() != null ? e.getCategory() : "infra";
                catCount.merge(cat, 1, Integer::sum);
            }
            StringBuilder catLine = new StringBuilder("**按类别**: ");
            catCount.forEach((cat, count) -> catLine.append(getCategoryLabel(cat).trim()).append(" ").append(count).append("项  "));
            md.append(catLine.toString().trim()).append("\n");
        }

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

        // WeChat/DingTalk delivery handled by notificationService.send() → policy → channel
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
