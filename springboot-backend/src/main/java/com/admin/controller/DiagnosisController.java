package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.lang.R;
import com.admin.common.utils.DiagnosisAlertTemplateUtil;
import com.admin.entity.ViteConfig;
import com.admin.mapper.ViteConfigMapper;
import com.admin.service.DiagnosisService;
import com.admin.service.NotificationService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * 诊断相关接口
 */
@RestController
@CrossOrigin
@RequestMapping("/api/v1/diagnosis")
public class DiagnosisController extends BaseController {

    @Autowired
    private DiagnosisService diagnosisService;

    @Autowired
    private ViteConfigMapper viteConfigMapper;

    @Autowired
    private NotificationService notificationService;

    /**
     * 获取最新诊断状态快照（看板首页数据）
     */
    @RequireRole
    @PostMapping("/summary")
    public R summary() {
        return diagnosisService.getLatestSummary();
    }

    /**
     * 获取某个隧道或转发的诊断历史
     * 参数: targetType (tunnel/forward), targetId, limit(可选,默认20)
     */
    @RequireRole
    @PostMapping("/history")
    public R history(@RequestBody Map<String, Object> params) {
        String targetType = (String) params.get("targetType");
        Object targetIdObj = params.get("targetId");
        if (targetIdObj == null) return R.err("targetId 不能为空");
        Integer targetId = Integer.valueOf(targetIdObj.toString());
        Object limitObj = params.get("limit");
        int limit = limitObj != null ? Integer.parseInt(limitObj.toString()) : 20;
        return diagnosisService.getDiagnosisHistory(targetType, targetId, limit);
    }

    /**
     * 手动触发全量诊断（异步执行）
     * 仅管理员可用
     */
    @LogAnnotation
    @RequireRole
    @PostMapping("/run-now")
    public R runNow() {
        return diagnosisService.triggerNow();
    }

    /**
     * 获取当前诊断运行状态
     */
    @RequireRole
    @PostMapping("/runtime-status")
    public R runtimeStatus() {
        return diagnosisService.getRuntimeStatus();
    }

    /**
     * 批量获取最新诊断记录
     * 参数: targetType (forward/tunnel), targetIds (ID数组)
     */
    @RequireRole
    @SuppressWarnings("unchecked")
    @PostMapping("/latest-batch")
    public R latestBatch(@RequestBody Map<String, Object> params) {
        String targetType = (String) params.get("targetType");
        List<Integer> targetIds;
        Object idsObj = params.get("targetIds");
        if (idsObj instanceof List) {
            targetIds = ((List<?>) idsObj).stream()
                    .map(id -> Integer.valueOf(id.toString()))
                    .collect(java.util.stream.Collectors.toList());
        } else {
            return R.err("targetIds 参数格式错误");
        }
        return diagnosisService.getLatestBatch(targetType, targetIds);
    }

    /**
     * 获取诊断趋势数据
     * 参数: hours (小时数，可选，默认24)
     */
    @RequireRole
    @PostMapping("/trend")
    public R trend(@RequestBody(required = false) Map<String, Object> params) {
        int hours = 24;
        if (params != null && params.containsKey("hours")) {
            hours = Integer.parseInt(params.get("hours").toString());
        }
        return diagnosisService.getTrend(hours);
    }

    /**
     * 测试通知推送（通过通知中心统一路由到已配置的渠道）
     */
    @LogAnnotation
    @RequireRole
    @PostMapping("/test-webhook")
    public R testWebhook() {
        try {
            String appName = getConfigValue("app_name");
            if (appName == null) appName = "flux-panel";
            String environment = getConfigValue("site_environment_name");
            if (environment == null) environment = "默认环境";
            String time = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

            String content = String.format(
                    "## 🔔 诊断通知测试\n\n" +
                    "**应用**: %s\n**环境**: %s\n**时间**: %s\n\n" +
                    "这是一条测试消息，用于验证通知中心渠道配置是否正常。\n\n" +
                    "> 示例异常：主入口 TCP Ping 超时\n> 示例异常：出口节点丢包率升高",
                    appName, environment, time
            );

            notificationService.send(
                    "[诊断测试] " + appName + " 通知渠道测试",
                    content,
                    "diagnosis",
                    "info",
                    "diagnosis",
                    null
            );
            return R.ok("测试通知已发送，将通过通知中心路由到已配置的渠道（企业微信/钉钉/Webhook等）");
        } catch (Exception e) {
            return R.err("发送失败: " + e.getMessage());
        }
    }

    private String getConfigValue(String key) {
        QueryWrapper<ViteConfig> qw = new QueryWrapper<ViteConfig>().eq("name", key);
        ViteConfig cfg = viteConfigMapper.selectOne(qw);
        return cfg != null ? cfg.getValue() : null;
    }
}
