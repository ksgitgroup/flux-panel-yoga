package com.admin.service.impl;

import com.admin.common.lang.R;
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
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
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

    // ────────────────────────────────────────────────
    // 核心：全量诊断
    // ────────────────────────────────────────────────

    @Override
    public void runAllDiagnosis() {
        log.info("[自动诊断] 开始全量诊断 ...");

        // 读取企业微信配置
        String webhookUrl = getConfig("wechat_webhook_url");
        boolean wechatEnabled = "true".equals(getConfig("wechat_webhook_enabled"));

        List<String> failureMessages = new ArrayList<>();

        // 1. 诊断所有活跃隧道（排除已禁用的）
        List<Tunnel> tunnels = tunnelService.list().stream()
                .filter(t -> t.getStatus() != null && t.getStatus() == 1)
                .collect(Collectors.toList());
        for (Tunnel tunnel : tunnels) {
            try {
                R result = tunnelService.diagnoseTunnel(tunnel.getId());
                boolean success = (result.getCode() == 0) && isAllSuccess(result.getData());
                double[] metrics = extractMetrics(result.getData());
                saveRecord("tunnel", tunnel.getId().intValue(), tunnel.getName(), success, result.getData(), metrics[0], metrics[1]);

                if (!success) {
                    failureMessages.add(String.format("🔴 **隧道异常**：%s（ID:%d）%n> %s",
                            tunnel.getName(), tunnel.getId(), extractFailureReason(result.getData())));
                }
            } catch (Exception e) {
                log.error("[自动诊断] 诊断隧道 {} 时异常: {}", tunnel.getId(), e.getMessage());
            }
        }

        // 2. 诊断所有活跃转发（排除已暂停的）
        List<Forward> forwards = forwardService.list().stream()
                .filter(f -> f.getStatus() != null && f.getStatus() == 1)
                .collect(Collectors.toList());
        for (Forward forward : forwards) {
            try {
                R result = forwardService.diagnoseForward(forward.getId().longValue(), true);
                boolean success = (result.getCode() == 0) && isAllSuccess(result.getData());
                double[] metrics = extractMetrics(result.getData());
                saveRecord("forward", forward.getId().intValue(), forward.getName(), success, result.getData(), metrics[0], metrics[1]);

                if (!success) {
                    failureMessages.add(String.format("🔴 **转发异常**：%s（ID:%d）%n> %s",
                            forward.getName(), forward.getId(), extractFailureReason(result.getData())));
                }
            } catch (Exception e) {
                log.error("[自动诊断] 诊断转发 {} 时异常: {}", forward.getId(), e.getMessage());
            }
        }

        // 3. 发送企业微信通知
        if (wechatEnabled && !failureMessages.isEmpty()) {
            sendWeChatAlert(webhookUrl, failureMessages, tunnels.size(), forwards.size());
        }

        log.info("[自动诊断] 全量诊断完成，共 {} 个隧道，{} 个转发，发现 {} 个异常",
                tunnels.size(), forwards.size(), failureMessages.size());
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

        // 按 targetType+targetId 分组，保留最新
        Map<String, DiagnosisRecord> latestMap = new LinkedHashMap<>();
        for (DiagnosisRecord r : all) {
            String key = r.getTargetType() + "_" + r.getTargetId();
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
        summary.put("avgLatency", avgLatency >= 0 ? Math.round(avgLatency * 10.0) / 10.0 : null);
        summary.put("records", latestRecords);

        // 最近一次全量诊断时间
        Optional<DiagnosisRecord> latest = all.stream().findFirst();
        latest.ifPresent(r -> summary.put("lastRunTime", r.getCreatedTime()));

        return R.ok(summary);
    }

    @Override
    public R triggerNow() {
        try {
            // 使用守护线程异步执行，避免接口超时
            // 注意：runAllDiagnosis 内部使用 isSystemTask=true 跳过 JWT 认证
            Thread diagnosisThread = new Thread(this::runAllDiagnosis);
            diagnosisThread.setDaemon(true);
            diagnosisThread.setName("diagnosis-manual-" + System.currentTimeMillis());
            diagnosisThread.start();
            return R.ok("诊断任务已启动，请稍后查看看板");
        } catch (Exception e) {
            log.error("[手动诊断] 触发失败: {}", e.getMessage());
            return R.err("诊断任务启动失败: " + e.getMessage());
        }
    }

    @Override
    public R getLatestBatch(String targetType, List<Integer> targetIds) {
        if (targetIds == null || targetIds.isEmpty()) {
            return R.ok(Collections.emptyMap());
        }

        // 获取指定类型的所有记录（按时间倒序）
        List<DiagnosisRecord> all = this.list(
                new QueryWrapper<DiagnosisRecord>()
                        .eq("target_type", targetType)
                        .in("target_id", targetIds)
                        .orderByDesc("created_time")
        );

        // 按 targetId 分组取最新一条
        Map<Integer, DiagnosisRecord> latestMap = new LinkedHashMap<>();
        for (DiagnosisRecord r : all) {
            latestMap.putIfAbsent(r.getTargetId(), r);
        }

        return R.ok(latestMap);
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

    /** 判断诊断报告中所有 results 是否全部成功 */
    @SuppressWarnings("unchecked")
    private boolean isAllSuccess(Object data) {
        if (data == null) return false;
        try {
            JSONObject obj = JSON.parseObject(JSON.toJSONString(data));
            Object resultsObj = obj.get("results");
            if (resultsObj == null) return false;
            List<JSONObject> results = (List<JSONObject>) JSON.parseArray(JSON.toJSONString(resultsObj), JSONObject.class);
            return results.stream().allMatch(r -> Boolean.TRUE.equals(r.getBoolean("success")));
        } catch (Exception e) {
            return false;
        }
    }

    /** 从诊断结果中提取平均延迟和丢包率 [averageTime, packetLoss] */
    @SuppressWarnings("unchecked")
    private double[] extractMetrics(Object data) {
        double avgTime = -1;
        double avgLoss = -1;
        if (data == null) return new double[]{avgTime, avgLoss};
        try {
            JSONObject obj = JSON.parseObject(JSON.toJSONString(data));
            Object resultsObj = obj.get("results");
            if (resultsObj == null) return new double[]{avgTime, avgLoss};
            List<JSONObject> results = (List<JSONObject>) JSON.parseArray(JSON.toJSONString(resultsObj), JSONObject.class);

            List<Double> times = new ArrayList<>();
            List<Double> losses = new ArrayList<>();
            for (JSONObject r : results) {
                if (Boolean.TRUE.equals(r.getBoolean("success"))) {
                    Double at = r.getDouble("averageTime");
                    Double pl = r.getDouble("packetLoss");
                    if (at != null && at >= 0) times.add(at);
                    if (pl != null && pl >= 0) losses.add(pl);
                }
            }
            if (!times.isEmpty()) {
                avgTime = times.stream().mapToDouble(Double::doubleValue).average().orElse(-1);
            }
            if (!losses.isEmpty()) {
                avgLoss = losses.stream().mapToDouble(Double::doubleValue).average().orElse(-1);
            }
        } catch (Exception e) {
            log.warn("[自动诊断] 提取指标异常: {}", e.getMessage());
        }
        return new double[]{avgTime, avgLoss};
    }

    /** 提取失败原因摘要 */
    @SuppressWarnings("unchecked")
    private String extractFailureReason(Object data) {
        if (data == null) return "无响应";
        try {
            JSONObject obj = JSON.parseObject(JSON.toJSONString(data));
            List<JSONObject> results = (List<JSONObject>) JSON.parseArray(
                    JSON.toJSONString(obj.get("results")), JSONObject.class);
            return results.stream()
                    .filter(r -> !Boolean.TRUE.equals(r.getBoolean("success")))
                    .map(r -> r.getString("description") + ": " + r.getString("message"))
                    .collect(Collectors.joining("; "));
        } catch (Exception e) {
            return "解析异常";
        }
    }

    /** 持久化诊断结果 */
    private void saveRecord(String type, Integer targetId, String name, boolean success, Object data, double averageTime, double packetLoss) {
        DiagnosisRecord record = new DiagnosisRecord();
        record.setTargetType(type);
        record.setTargetId(targetId);
        record.setTargetName(name);
        record.setOverallSuccess(success);
        record.setResultsJson(JSON.toJSONString(data));
        record.setAverageTime(averageTime >= 0 ? Math.round(averageTime * 100.0) / 100.0 : null);
        record.setPacketLoss(packetLoss >= 0 ? Math.round(packetLoss * 100.0) / 100.0 : null);
        record.setCreatedTime(System.currentTimeMillis());
        this.save(record);
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

    /** 构造并发送企业微信告警 */
    private void sendWeChatAlert(String webhookUrl, List<String> failures, int tunnelTotal, int forwardTotal) {
        String time = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        StringBuilder sb = new StringBuilder();
        sb.append("# 🚨 flux-panel 自动诊断告警\n\n");
        sb.append(String.format("> 诊断时间：%s\n", time));
        sb.append(String.format("> 共诊断 %d 个隧道，%d 个转发，发现 **%d 个异常**\n\n", 
                tunnelTotal, forwardTotal, failures.size()));
        sb.append("---\n\n");
        for (String msg : failures) {
            sb.append(msg).append("\n\n");
        }
        WeChatWorkUtil.sendMarkdown(webhookUrl, sb.toString());
    }
}
