package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.lang.R;
import com.admin.common.utils.DiagnosisAlertTemplateUtil;
import com.admin.common.utils.WeChatWorkUtil;
import com.admin.entity.ViteConfig;
import com.admin.mapper.ViteConfigMapper;
import com.admin.service.DiagnosisService;
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
     * 测试企业微信 Webhook 推送
     * 发送一条测试消息验证配置是否正确
     */
    @LogAnnotation
    @RequireRole
    @PostMapping("/test-webhook")
    public R testWebhook() {
        try {
            String webhookUrl = getConfigValue("wechat_webhook_url");
            if (webhookUrl == null || webhookUrl.trim().isEmpty()) {
                return R.err("请先配置企业微信机器人 Webhook 地址");
            }

            String appName = getConfigValue("app_name");
            String environment = getConfigValue("site_environment_name");
            String time = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            String failureDetails = "1. 示例异常：主入口 TCP Ping 超时\n\n2. 示例异常：出口节点丢包率升高";
            String template = DiagnosisAlertTemplateUtil.fallbackTemplate(
                    getConfigValue("wechat_webhook_template"),
                    DiagnosisAlertTemplateUtil.DEFAULT_TEST_TEMPLATE
            );
            String content = DiagnosisAlertTemplateUtil.render(
                    template,
                    DiagnosisAlertTemplateUtil.basePlaceholders(
                            appName,
                            environment,
                            time,
                            "1 个隧道 / 2 个转发",
                            2,
                            "测试消息不参与节流",
                            failureDetails
                    )
            );
            boolean success = WeChatWorkUtil.sendMarkdown(webhookUrl, content);
            if (!success) {
                return R.err("企业微信消息发送失败，请检查 Webhook 地址或机器人配置");
            }
            return R.ok("测试消息已发送，请检查企业微信群");
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
