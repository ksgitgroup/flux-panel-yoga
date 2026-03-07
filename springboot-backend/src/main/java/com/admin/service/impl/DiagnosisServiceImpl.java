package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.common.utils.DiagnosisAlertTemplateUtil;
import com.admin.common.utils.WeChatWorkUtil;
import com.admin.entity.DiagnosisRecord;
import com.admin.entity.Forward;
import com.admin.entity.Tunnel;
import com.admin.entity.ViteConfig;
import com.admin.mapper.DiagnosisRecordMapper;
import com.admin.mapper.ViteConfigMapper;
import com.admin.service.DiagnosisService;
import com.admin.service.ForwardService;
import com.admin.service.TunnelService;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

/**
 * 诊断服务实现类
 *
 * 架构说明：复用现有的 forwardService.diagnoseForward / tunnelService.diagnoseTunnel
 * 方法，不引入新的依赖或容器，结果持久化到 diagnosis_record 表。
 */
@Slf4j
@Service
public class DiagnosisServiceImpl extends ServiceImpl<DiagnosisRecordMapper, DiagnosisRecord>
        implements DiagnosisService {

    @Autowired
    private ForwardService forwardService;

    @Autowired
    private TunnelService tunnelService;

    @Autowired
    private ViteConfigMapper viteConfigMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final AtomicBoolean diagnosisRunning = new AtomicBoolean(false);
    private final Object runtimeLock = new Object();
    private DiagnosisRuntimeSnapshot runtimeSnapshot = DiagnosisRuntimeSnapshot.idle();

    private static class DiagnosisRuntimeSnapshot {
        private boolean running;
        private String triggerSource;
        private long startedAt;
        private long finishedAt;
        private int totalCount;
        private int completedCount;
        private int successCount;
        private int failCount;
        private String currentTargetType;
        private Integer currentTargetId;
        private String currentTargetName;
        private List<Map<String, Object>> recentItems = new ArrayList<>();

        static DiagnosisRuntimeSnapshot idle() {
            DiagnosisRuntimeSnapshot snapshot = new DiagnosisRuntimeSnapshot();
            snapshot.running = false;
            snapshot.triggerSource = "idle";
            snapshot.startedAt = 0L;
            snapshot.finishedAt = 0L;
            snapshot.totalCount = 0;
            snapshot.completedCount = 0;
            snapshot.successCount = 0;
            snapshot.failCount = 0;
            snapshot.currentTargetType = null;
            snapshot.currentTargetId = null;
            snapshot.currentTargetName = null;
            snapshot.recentItems = new ArrayList<>();
            return snapshot;
        }
    }

    @javax.annotation.PostConstruct
    public void initDatabaseSchema() {
        try {
            jdbcTemplate.execute("ALTER TABLE diagnosis_record ADD COLUMN average_time DOUBLE DEFAULT NULL COMMENT '平均延迟(ms)'");
            log.info("数据库升级: 已添加 average_time 列");
        } catch (Exception e) {
            // 列可能已存在，忽略错误
        }
        try {
            jdbcTemplate.execute("ALTER TABLE diagnosis_record ADD COLUMN packet_loss DOUBLE DEFAULT NULL COMMENT '丢包率(%)'");
            log.info("数据库升级: 已添加 packet_loss 列");
        } catch (Exception e) {
            // 列可能已存在，忽略错误
        }
    }

    // ────────────────────────────────────────────────
    // 核心：全量诊断
    // ────────────────────────────────────────────────

    @Override
    public void runAllDiagnosis() {
        runAllDiagnosisInternal("auto", false);
    }

    private void runAllDiagnosisInternal(String triggerSource, boolean lockAlreadyHeld) {
        if (!lockAlreadyHeld && !diagnosisRunning.compareAndSet(false, true)) {
            log.info("[自动诊断] 当前已有任务执行中，本次 {} 触发跳过", triggerSource);
            return;
        }

        log.info("[自动诊断] 开始全量诊断 ...");

        // 读取企业微信配置
        String webhookUrl = getConfig("wechat_webhook_url");
        boolean wechatEnabled = getBooleanConfig("wechat_webhook_enabled", false);
        String appName = getConfigOrDefault("app_name", "flux-panel");
        String environment = getConfigOrDefault("site_environment_name", "默认环境");
        int cooldownMinutes = getIntConfig("wechat_webhook_cooldown_minutes", 30);
        int maxFailures = Math.max(1, getIntConfig("wechat_webhook_max_failures", 8));
        boolean recoveryEnabled = getBooleanConfig("wechat_notify_recovery_enabled", true);

        List<String> failureMessages = new ArrayList<>();
        List<Tunnel> tunnels = Collections.emptyList();
        List<Forward> forwards = Collections.emptyList();

        try {
            // 1. 诊断所有活跃隧道（排除已禁用的）
            tunnels = tunnelService.list().stream()
                    .filter(t -> t.getStatus() != null && t.getStatus() == 1)
                    .collect(Collectors.toList());

            // 2. 诊断所有活跃转发（排除已暂停的）
            forwards = forwardService.list().stream()
                    .filter(f -> f.getStatus() != null && f.getStatus() == 1)
                    .collect(Collectors.toList());

            beginRuntimeSnapshot(triggerSource, tunnels.size() + forwards.size());

            int stepIndex = 0;
            for (Tunnel tunnel : tunnels) {
                stepIndex++;
                markRuntimeStep(stepIndex, "tunnel", tunnel.getId().intValue(), tunnel.getName());
                try {
                    R result = tunnelService.diagnoseTunnel(tunnel.getId());
                    boolean success = (result.getCode() == 0) && isAllSuccess(result.getData());
                    double[] metrics = extractMetrics(result.getData());
                    saveRecord("tunnel", tunnel.getId().intValue(), tunnel.getName(), success, result.getData(), metrics[0], metrics[1]);
                    completeRuntimeStep("tunnel", tunnel.getId().intValue(), tunnel.getName(), success, metrics[0], metrics[1], null);

                    if (!success) {
                        failureMessages.add(String.format("🔴 **隧道异常**：%s（ID:%d）%n> %s",
                                tunnel.getName(), tunnel.getId(), extractFailureReason(result.getData())));
                    }
                } catch (Exception e) {
                    completeRuntimeStep("tunnel", tunnel.getId().intValue(), tunnel.getName(), false, -1, -1, e.getMessage());
                    failureMessages.add(String.format("🔴 **隧道异常**：%s（ID:%d）%n> %s",
                            tunnel.getName(), tunnel.getId(), e.getMessage()));
                    log.error("[自动诊断] 诊断隧道 {} 时异常: {}", tunnel.getId(), e.getMessage());
                }
            }

            for (Forward forward : forwards) {
                stepIndex++;
                markRuntimeStep(stepIndex, "forward", forward.getId().intValue(), forward.getName());
                try {
                    R result = forwardService.diagnoseForward(forward.getId().longValue(), true);
                    boolean success = (result.getCode() == 0) && isAllSuccess(result.getData());
                    double[] metrics = extractMetrics(result.getData());
                    saveRecord("forward", forward.getId().intValue(), forward.getName(), success, result.getData(), metrics[0], metrics[1]);
                    completeRuntimeStep("forward", forward.getId().intValue(), forward.getName(), success, metrics[0], metrics[1], null);

                    if (!success) {
                        failureMessages.add(String.format("🔴 **转发异常**：%s（ID:%d）%n> %s",
                                forward.getName(), forward.getId(), extractFailureReason(result.getData())));
                    }
                } catch (Exception e) {
                    completeRuntimeStep("forward", forward.getId().intValue(), forward.getName(), false, -1, -1, e.getMessage());
                    failureMessages.add(String.format("🔴 **转发异常**：%s（ID:%d）%n> %s",
                            forward.getName(), forward.getId(), e.getMessage()));
                    log.error("[自动诊断] 诊断转发 {} 时异常: {}", forward.getId(), e.getMessage());
                }
            }

            if (wechatEnabled) {
                processWebhookNotifications(
                        webhookUrl,
                        appName,
                        environment,
                        cooldownMinutes,
                        maxFailures,
                        recoveryEnabled,
                        failureMessages,
                        tunnels.size(),
                        forwards.size()
                );
            }

            log.info("[自动诊断] 全量诊断完成，处理资源合计: {} 个隧道，{} 个转发，异常数: {}",
                    tunnels.size(), forwards.size(), failureMessages.size());
        } finally {
            finishRuntimeSnapshot();
            diagnosisRunning.set(false);
        }
    }

    // ────────────────────────────────────────────────
    // REST API 方法
    // ────────────────────────────────────────────────

    @Override
    public R getDiagnosisHistory(String targetType, Integer targetId, int limit) {
        QueryWrapper<DiagnosisRecord> qw = new QueryWrapper<DiagnosisRecord>()
                .eq("target_type", targetType)
                .eq("target_id", targetId)
                .orderByDesc("created_time")
                .last("LIMIT " + Math.min(limit, 100));
        List<DiagnosisRecord> records = this.list(qw);
        return R.ok(records);
    }

    @Override
    public R getLatestSummary() {
        // 对每个 target_type+target_id 取最新一条记录
        List<DiagnosisRecord> all = this.list(
                new QueryWrapper<DiagnosisRecord>().orderByDesc("created_time")
        );

        // 获取当前所有有效的隧道和转发 ID 列表，用于剔除已删除的资源
        // 这一步是解决用户提到的“已删除资源仍显示在统计中”的问题
        Set<Integer> activeTunnelIds = tunnelService.list().stream()
                .map(t -> t.getId().intValue()).collect(Collectors.toSet());
        Set<Integer> activeForwardIds = forwardService.list().stream()
                .map(f -> f.getId().intValue()).collect(Collectors.toSet());

        // 按 targetType+targetId 分组，保留最新且有效的
        Map<String, DiagnosisRecord> latestMap = new LinkedHashMap<>();
        for (DiagnosisRecord r : all) {
            String targetType = r.getTargetType();
            Integer targetId = r.getTargetId();
            
            // 校验资源是否还存在
            boolean exists = false;
            if ("tunnel".equals(targetType)) {
                exists = activeTunnelIds.contains(targetId);
            } else if ("forward".equals(targetType)) {
                exists = activeForwardIds.contains(targetId);
            }
            
            if (!exists) continue; // 剔除已删除的资源

            String key = targetType + "_" + targetId;
            latestMap.putIfAbsent(key, r);
        }

        // 统计
        Collection<DiagnosisRecord> latestRecords = latestMap.values();
        long totalCount = latestRecords.size();
        long failCount = latestRecords.stream().filter(r -> !Boolean.TRUE.equals(r.getOverallSuccess())).count();
        long successCount = totalCount - failCount;


        // 计算平均延迟
        double avgLatency = latestRecords.stream()
                .filter(r -> r.getAverageTime() != null && r.getAverageTime() >= 0)
                .mapToDouble(DiagnosisRecord::getAverageTime)
                .average()
                .orElse(-1);

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalCount", totalCount);
        summary.put("successCount", successCount);
        summary.put("failCount", failCount);
        summary.put("healthRate", totalCount > 0 ? Math.round((successCount * 100.0 / totalCount) * 10.0) / 10.0 : 100.0);
        summary.put("avgLatency", avgLatency >= 0 ? Math.round(avgLatency * 10.0) / 10.0 : null);
        summary.put("records", latestRecords);
        
        // 最近异常记录 (最多5条)
        List<DiagnosisRecord> recentFailures = latestRecords.stream()
                .filter(r -> !Boolean.TRUE.equals(r.getOverallSuccess()))
                .limit(5)
                .collect(Collectors.toList());
        summary.put("recentFailures", recentFailures);

        // 最近一次全量诊断时间
        Optional<DiagnosisRecord> latest = all.stream().findFirst();
        latest.ifPresent(r -> summary.put("lastRunTime", r.getCreatedTime()));

        return R.ok(summary);
    }

    @Override
    public R triggerNow() {
        try {
            if (diagnosisRunning.get()) {
                R response = R.ok(buildRuntimePayload());
                response.setMsg("诊断任务已在执行中");
                return response;
            }
            if (!diagnosisRunning.compareAndSet(false, true)) {
                R response = R.ok(buildRuntimePayload());
                response.setMsg("诊断任务已在执行中");
                return response;
            }
            synchronized (runtimeLock) {
                DiagnosisRuntimeSnapshot snapshot = DiagnosisRuntimeSnapshot.idle();
                snapshot.running = true;
                snapshot.triggerSource = "manual";
                snapshot.startedAt = System.currentTimeMillis();
                snapshot.currentTargetName = "准备诊断队列";
                runtimeSnapshot = snapshot;
            }
            // 使用守护线程异步执行，避免接口超时
            // 注意：runAllDiagnosis 内部使用 isSystemTask=true 跳过 JWT 认证
            Thread diagnosisThread = new Thread(() -> runAllDiagnosisInternal("manual", true));
            diagnosisThread.setDaemon(true);
            diagnosisThread.setName("diagnosis-manual-" + System.currentTimeMillis());
            diagnosisThread.start();
            R response = R.ok(buildRuntimePayload());
            response.setMsg("诊断任务已启动");
            return response;
        } catch (Exception e) {
            log.error("[手动诊断] 触发失败: {}", e.getMessage());
            return R.err("诊断任务启动失败: " + e.getMessage());
        }
    }

    @Override
    public R getRuntimeStatus() {
        return R.ok(buildRuntimePayload());
    }

    @Override
    public R getLatestBatch(String targetType, List<Integer> targetIds) {
        if (targetIds == null || targetIds.isEmpty()) {
            return R.ok(Collections.emptyMap());
        }

        // 获取指定类型的所有记录（按时间倒序）
        // 为了支持趋势图，我们需要获取每个 ID 的最近若干条记录
        List<DiagnosisRecord> all = this.list(
                new QueryWrapper<DiagnosisRecord>()
                        .eq("target_type", targetType)
                        .in("target_id", targetIds)
                        .orderByDesc("created_time")
        );

        // 按 targetId 分组
        Map<Integer, List<DiagnosisRecord>> grouped = all.stream()
                .collect(Collectors.groupingBy(DiagnosisRecord::getTargetId));

        Map<Integer, Map<String, Object>> resultMap = new LinkedHashMap<>();
        for (Integer id : targetIds) {
            List<DiagnosisRecord> records = grouped.getOrDefault(id, Collections.emptyList());
            if (!records.isEmpty()) {
                Map<String, Object> item = new HashMap<>();
                DiagnosisRecord latest = records.get(0);
                
                // 放入最新记录的所有字段
                item.put("id", latest.getId());
                item.put("targetType", latest.getTargetType());
                item.put("targetId", latest.getTargetId());
                item.put("targetName", latest.getTargetName());
                item.put("overallSuccess", latest.getOverallSuccess());
                item.put("averageTime", latest.getAverageTime());
                item.put("packetLoss", latest.getPacketLoss());
                item.put("createdTime", latest.getCreatedTime());
                
                // 放入历史记录 (最多最近10条)
                item.put("history", records.stream().limit(10).collect(Collectors.toList()));
                
                resultMap.put(id, item);
            }
        }

        return R.ok(resultMap);
    }

    @Override
    public R getTrend(int hours) {
        if (hours <= 0 || hours > 168) hours = 24; // 最大7天

        long now = System.currentTimeMillis();
        long startTime = now - (long) hours * 3600 * 1000;

        List<DiagnosisRecord> records = this.list(
                new QueryWrapper<DiagnosisRecord>()
                        .ge("created_time", startTime)
                        .orderByAsc("created_time")
        );

        // 按小时分桶
        List<Map<String, Object>> trend = new ArrayList<>();
        for (int i = 0; i < hours; i++) {
            long bucketStart = startTime + (long) i * 3600 * 1000;
            long bucketEnd = bucketStart + 3600 * 1000;

            List<DiagnosisRecord> bucket = records.stream()
                    .filter(r -> r.getCreatedTime() >= bucketStart && r.getCreatedTime() < bucketEnd)
                    .collect(Collectors.toList());

            long successCount = bucket.stream().filter(r -> Boolean.TRUE.equals(r.getOverallSuccess())).count();
            long failCount = bucket.size() - successCount;

            double avgLatency = bucket.stream()
                    .filter(r -> r.getAverageTime() != null && r.getAverageTime() >= 0)
                    .mapToDouble(DiagnosisRecord::getAverageTime)
                    .average()
                    .orElse(-1);

            Map<String, Object> point = new LinkedHashMap<>();
            point.put("time", bucketStart);
            point.put("hour", new java.text.SimpleDateFormat("HH:00").format(new Date(bucketStart)));
            point.put("success", successCount);
            point.put("fail", failCount);
            point.put("total", bucket.size());
            point.put("avgLatency", avgLatency >= 0 ? Math.round(avgLatency * 10.0) / 10.0 : null);
            trend.add(point);
        }

        return R.ok(trend);
    }

    // ────────────────────────────────────────────────
    // 私有工具方法
    // ────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private boolean isAllSuccess(Object data) {
        if (data == null) return false;
        try {
            String jsonStr = JSON.toJSONString(data);
            JSONObject obj = JSON.parseObject(jsonStr);
            if (obj == null) return false;
            
            Object resultsObj = obj.get("results");
            if (resultsObj == null) return false;
            
            List<JSONObject> results = (List<JSONObject>) JSON.parseArray(JSON.toJSONString(resultsObj), JSONObject.class);
            if (results == null || results.isEmpty()) return false;
            
            return results.stream()
                    .filter(Objects::nonNull)
                    .allMatch(r -> Boolean.TRUE.equals(r.getBoolean("success")));
        } catch (Exception e) {
            log.warn("[自动诊断] 校验全量成功异常: {}", e.getMessage());
            return false;
        }
    }

    @SuppressWarnings("unchecked")
    private double[] extractMetrics(Object data) {
        double avgTime = -1;
        double avgLoss = -1;
        if (data == null) return new double[]{avgTime, avgLoss};
        try {
            String jsonStr = JSON.toJSONString(data);
            JSONObject obj = JSON.parseObject(jsonStr);
            if (obj == null) return new double[]{avgTime, avgLoss};
            
            // 优先使用预计算指标 (v1.4.4)
            if (obj.containsKey("totalLatency")) {
                Double tl = obj.getDouble("totalLatency");
                if (tl != null) avgTime = tl;
            }
            if (obj.containsKey("totalLoss")) {
                Double tl = obj.getDouble("totalLoss");
                if (tl != null) avgLoss = tl;
            }

            // 如果没拿到预计算指标，再尝试从 results 列表里算
            Object resultsObj = obj.get("results");
            if (resultsObj != null) {
                List<JSONObject> results = (List<JSONObject>) JSON.parseArray(JSON.toJSONString(resultsObj), JSONObject.class);
                if (results != null) {
                    List<Double> times = new ArrayList<>();
                    List<Double> losses = new ArrayList<>();
                    for (JSONObject r : results) {
                        if (r != null && Boolean.TRUE.equals(r.getBoolean("success"))) {
                            Double at = r.getDouble("averageTime");
                            Double pl = r.getDouble("packetLoss");
                            if (at != null && at >= 0) times.add(at);
                            if (pl != null && pl >= 0) losses.add(pl);
                        }
                    }
                    if (avgTime == -1 && !times.isEmpty()) {
                        avgTime = times.stream().mapToDouble(Double::doubleValue).average().orElse(-1);
                    }
                    if (avgLoss == -1 && !losses.isEmpty()) {
                        avgLoss = losses.stream().mapToDouble(Double::doubleValue).average().orElse(-1);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[自动诊断] 提取指标异常: {}", e.getMessage());
        }
        return new double[]{avgTime, avgLoss};
    }

    /** 提取失败原因摘要 */
    @SuppressWarnings("unchecked")
    private String extractFailureReason(Object data) {
        if (data == null) return "无可诊断数据";
        try {
            String jsonStr = JSON.toJSONString(data);
            JSONObject obj = JSON.parseObject(jsonStr);
            if (obj == null || obj.get("results") == null) return "结果解析为空";
            
            List<JSONObject> results = (List<JSONObject>) JSON.parseArray(
                    JSON.toJSONString(obj.get("results")), JSONObject.class);
            if (results == null) return "链路结果为空";
            
            String reasons = results.stream()
                    .filter(Objects::nonNull)
                    .filter(r -> !Boolean.TRUE.equals(r.getBoolean("success")))
                    .map(r -> {
                        String desc = r.getString("description") != null ? r.getString("description") : "未知步骤";
                        String msg = r.getString("message") != null ? r.getString("message") : "错误描述为空";
                        return desc + ": " + msg;
                    })
                    .collect(Collectors.joining("; "));
            return reasons.isEmpty() ? "全部步骤成功，但整体判定异常" : reasons;
        } catch (Exception e) {
            log.warn("[自动诊断] 解析失败原因异常: {}", e.getMessage());
            return "解析异常: " + e.getMessage();
        }
    }

    /** 保存诊断记录并更新资源状态 (用于手动和自动诊断同步) */
    @Override
    public void saveRecord(String type, Integer targetId, String name, Object data) {
        boolean success = isAllSuccess(data);
        double[] metrics = extractMetrics(data);
        
        DiagnosisRecord record = new DiagnosisRecord();
        record.setTargetType(type);
        record.setTargetId(targetId);
        record.setTargetName(name);
        record.setOverallSuccess(success);
        record.setResultsJson(JSON.toJSONString(data));
        record.setAverageTime(metrics[0] >= 0 ? Math.round(metrics[0] * 100.0) / 100.0 : null);
        record.setPacketLoss(metrics[1] >= 0 ? Math.round(metrics[1] * 100.0) / 100.0 : null);
        record.setCreatedTime(System.currentTimeMillis());
        this.save(record);
    }
    
    /** 持久化诊断结果 (内部调用版本) */
    private void saveRecord(String type, Integer targetId, String name, boolean success, Object data, double averageTime, double packetLoss) {
        saveRecord(type, targetId, name, data);
    }

    private void beginRuntimeSnapshot(String triggerSource, int totalCount) {
        synchronized (runtimeLock) {
            DiagnosisRuntimeSnapshot snapshot = DiagnosisRuntimeSnapshot.idle();
            snapshot.running = true;
            snapshot.triggerSource = triggerSource;
            snapshot.startedAt = System.currentTimeMillis();
            snapshot.totalCount = totalCount;
            runtimeSnapshot = snapshot;
        }
    }

    private void markRuntimeStep(int stepIndex, String targetType, Integer targetId, String targetName) {
        synchronized (runtimeLock) {
            runtimeSnapshot.currentTargetType = targetType;
            runtimeSnapshot.currentTargetId = targetId;
            runtimeSnapshot.currentTargetName = targetName;
            runtimeSnapshot.totalCount = Math.max(runtimeSnapshot.totalCount, stepIndex);
        }
    }

    private void completeRuntimeStep(String targetType, Integer targetId, String targetName, boolean success, double averageTime, double packetLoss, String errorMessage) {
        synchronized (runtimeLock) {
            runtimeSnapshot.completedCount += 1;
            if (success) {
                runtimeSnapshot.successCount += 1;
            } else {
                runtimeSnapshot.failCount += 1;
            }

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("targetType", targetType);
            item.put("targetId", targetId);
            item.put("targetName", targetName);
            item.put("success", success);
            item.put("averageTime", averageTime >= 0 ? Math.round(averageTime * 10.0) / 10.0 : null);
            item.put("packetLoss", packetLoss >= 0 ? Math.round(packetLoss * 10.0) / 10.0 : null);
            item.put("errorMessage", errorMessage);
            item.put("finishedAt", System.currentTimeMillis());
            runtimeSnapshot.recentItems.add(0, item);
            if (runtimeSnapshot.recentItems.size() > 8) {
                runtimeSnapshot.recentItems = new ArrayList<>(runtimeSnapshot.recentItems.subList(0, 8));
            }
        }
    }

    private void finishRuntimeSnapshot() {
        synchronized (runtimeLock) {
            runtimeSnapshot.running = false;
            runtimeSnapshot.finishedAt = System.currentTimeMillis();
            runtimeSnapshot.currentTargetType = null;
            runtimeSnapshot.currentTargetId = null;
            runtimeSnapshot.currentTargetName = null;
        }
    }

    private Map<String, Object> buildRuntimePayload() {
        synchronized (runtimeLock) {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("running", runtimeSnapshot.running);
            payload.put("triggerSource", runtimeSnapshot.triggerSource);
            payload.put("startedAt", runtimeSnapshot.startedAt);
            payload.put("finishedAt", runtimeSnapshot.finishedAt);
            payload.put("totalCount", runtimeSnapshot.totalCount);
            payload.put("completedCount", runtimeSnapshot.completedCount);
            payload.put("successCount", runtimeSnapshot.successCount);
            payload.put("failCount", runtimeSnapshot.failCount);
            payload.put("currentTargetType", runtimeSnapshot.currentTargetType);
            payload.put("currentTargetId", runtimeSnapshot.currentTargetId);
            payload.put("currentTargetName", runtimeSnapshot.currentTargetName);
            payload.put("progressPercent", runtimeSnapshot.totalCount > 0
                    ? Math.min(100, Math.round((runtimeSnapshot.completedCount * 100.0f) / runtimeSnapshot.totalCount))
                    : runtimeSnapshot.running ? 0 : 100);
            payload.put("recentItems", new ArrayList<>(runtimeSnapshot.recentItems));
            return payload;
        }
    }

    /** 读取 vite_config 配置 */
    private String getConfig(String key) {
        try {
            QueryWrapper<ViteConfig> qw = new QueryWrapper<ViteConfig>().eq("name", key);
            ViteConfig cfg = viteConfigMapper.selectOne(qw);
            return cfg != null ? cfg.getValue() : null;
        } catch (Exception e) {
            log.warn("[自动诊断] 读取配置 {} 失败: {}", key, e.getMessage());
            return null;
        }
    }

    private String getConfigOrDefault(String key, String defaultValue) {
        String value = getConfig(key);
        if (value == null || value.trim().isEmpty()) {
            return defaultValue;
        }
        return value;
    }

    private boolean getBooleanConfig(String key, boolean defaultValue) {
        String value = getConfig(key);
        if (value == null || value.trim().isEmpty()) {
            return defaultValue;
        }
        return "true".equalsIgnoreCase(value.trim());
    }

    private int getIntConfig(String key, int defaultValue) {
        String value = getConfig(key);
        if (value == null || value.trim().isEmpty()) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    private void upsertConfig(String key, String value) {
        try {
            QueryWrapper<ViteConfig> qw = new QueryWrapper<ViteConfig>().eq("name", key);
            ViteConfig cfg = viteConfigMapper.selectOne(qw);
            if (cfg == null) {
                cfg = new ViteConfig();
                cfg.setName(key);
            }
            cfg.setValue(value);
            cfg.setTime(System.currentTimeMillis());
            if (cfg.getId() == null) {
                viteConfigMapper.insert(cfg);
            } else {
                viteConfigMapper.updateById(cfg);
            }
        } catch (Exception e) {
            log.warn("[自动诊断] 写入配置 {} 失败: {}", key, e.getMessage());
        }
    }

    private void processWebhookNotifications(
            String webhookUrl,
            String appName,
            String environment,
            int cooldownMinutes,
            int maxFailures,
            boolean recoveryEnabled,
            List<String> failures,
            int tunnelTotal,
            int forwardTotal
    ) {
        String lastStatus = getConfigOrDefault("wechat_webhook_last_status", "healthy");
        long lastSentAt = 0L;
        try {
            lastSentAt = Long.parseLong(getConfigOrDefault("wechat_webhook_last_sent_at", "0"));
        } catch (NumberFormatException ignored) {
        }

        boolean hasFailures = failures != null && !failures.isEmpty();
        long now = System.currentTimeMillis();

        if (hasFailures) {
            boolean shouldSend = !"failing".equalsIgnoreCase(lastStatus)
                    || now - lastSentAt >= (long) Math.max(cooldownMinutes, 1) * 60 * 1000;
            if (!shouldSend) {
                log.info("[自动诊断] 企业微信通知进入冷静期，当前跳过发送");
                upsertConfig("wechat_webhook_last_status", "failing");
                return;
            }

            String content = buildAlertMessage(
                    appName,
                    environment,
                    Math.max(cooldownMinutes, 1),
                    failures,
                    Math.max(maxFailures, 1),
                    tunnelTotal,
                    forwardTotal
            );
            if (WeChatWorkUtil.sendMarkdown(webhookUrl, content)) {
                upsertConfig("wechat_webhook_last_sent_at", String.valueOf(now));
                upsertConfig("wechat_webhook_last_status", "failing");
            }
            return;
        }

        if (recoveryEnabled && "failing".equalsIgnoreCase(lastStatus)) {
            String content = buildRecoveryMessage(appName, environment, tunnelTotal, forwardTotal);
            if (WeChatWorkUtil.sendMarkdown(webhookUrl, content)) {
                upsertConfig("wechat_webhook_last_sent_at", String.valueOf(now));
                upsertConfig("wechat_webhook_last_status", "healthy");
            }
            return;
        }

        upsertConfig("wechat_webhook_last_status", "healthy");
    }

    private String buildAlertMessage(
            String appName,
            String environment,
            int cooldownMinutes,
            List<String> failures,
            int maxFailures,
            int tunnelTotal,
            int forwardTotal
    ) {
        String time = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String resourceSummary = String.format("%d 个隧道 / %d 个转发", tunnelTotal, forwardTotal);
        String failureDetails = formatFailureDetails(failures, maxFailures);
        Map<String, String> placeholders = DiagnosisAlertTemplateUtil.basePlaceholders(
                appName,
                environment,
                time,
                resourceSummary,
                failures.size(),
                cooldownMinutes + " 分钟内仅发送一次同类异常",
                failureDetails
        );
        String template = DiagnosisAlertTemplateUtil.fallbackTemplate(
                getConfig("wechat_webhook_template"),
                DiagnosisAlertTemplateUtil.DEFAULT_ALERT_TEMPLATE
        );
        return DiagnosisAlertTemplateUtil.render(template, placeholders);
    }

    private String buildRecoveryMessage(String appName, String environment, int tunnelTotal, int forwardTotal) {
        String time = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String resourceSummary = String.format("%d 个隧道 / %d 个转发", tunnelTotal, forwardTotal);
        Map<String, String> placeholders = DiagnosisAlertTemplateUtil.basePlaceholders(
                appName,
                environment,
                time,
                resourceSummary,
                0,
                "恢复通知即时发送",
                "最近一次诊断未发现异常"
        );
        String template = DiagnosisAlertTemplateUtil.fallbackTemplate(
                getConfig("wechat_recovery_template"),
                DiagnosisAlertTemplateUtil.DEFAULT_RECOVERY_TEMPLATE
        );
        return DiagnosisAlertTemplateUtil.render(template, placeholders);
    }

    private String formatFailureDetails(List<String> failures, int maxFailures) {
        if (failures == null || failures.isEmpty()) {
            return "最近一次诊断未发现异常";
        }

        StringBuilder sb = new StringBuilder();
        int displayCount = Math.min(failures.size(), Math.max(maxFailures, 1));
        for (int i = 0; i < displayCount; i++) {
            sb.append(failures.get(i)).append("\n\n");
        }

        if (failures.size() > displayCount) {
            sb.append(String.format("> 其余 %d 条异常已折叠，请登录面板查看完整诊断看板", failures.size() - displayCount));
        }

        return sb.toString().trim();
    }
}
