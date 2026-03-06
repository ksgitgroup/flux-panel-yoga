package com.admin.common.utils;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 自动诊断告警模板渲染工具
 */
public final class DiagnosisAlertTemplateUtil {

    public static final String DEFAULT_ALERT_TEMPLATE =
            "# 🚨 {{appName}} {{environment}} 自动诊断告警\n\n" +
            "> 时间：{{time}}\n" +
            "> 环境：{{environment}}\n" +
            "> 诊断范围：{{resourceSummary}}\n" +
            "> 异常数量：**{{failureCount}}**\n" +
            "> 发送节奏：{{cooldownLabel}}\n\n" +
            "{{failureDetails}}";

    public static final String DEFAULT_RECOVERY_TEMPLATE =
            "# ✅ {{appName}} {{environment}} 诊断已恢复\n\n" +
            "> 时间：{{time}}\n" +
            "> 环境：{{environment}}\n" +
            "> 诊断范围：{{resourceSummary}}\n" +
            "> 状态：最近一次自动诊断未发现异常";

    public static final String DEFAULT_TEST_TEMPLATE =
            "# 🧪 {{appName}} {{environment}} 告警测试\n\n" +
            "> 时间：{{time}}\n" +
            "> 环境：{{environment}}\n" +
            "> 说明：这是一次企业微信机器人连通性与模板渲染测试\n\n" +
            "{{failureDetails}}";

    private DiagnosisAlertTemplateUtil() {
    }

    public static String fallbackTemplate(String template, String defaultTemplate) {
        if (template == null || template.trim().isEmpty()) {
            return defaultTemplate;
        }
        return template;
    }

    public static String render(String template, Map<String, String> placeholders) {
        String result = template == null ? "" : template;
        if (placeholders == null || placeholders.isEmpty()) {
            return result;
        }

        for (Map.Entry<String, String> entry : placeholders.entrySet()) {
            String token = "{{" + entry.getKey() + "}}";
            result = result.replace(token, entry.getValue() == null ? "" : entry.getValue());
        }
        return result;
    }

    public static Map<String, String> basePlaceholders(
            String appName,
            String environment,
            String time,
            String resourceSummary,
            int failureCount,
            String cooldownLabel,
            String failureDetails
    ) {
        Map<String, String> values = new LinkedHashMap<>();
        values.put("appName", safe(appName, "flux-panel"));
        values.put("environment", safe(environment, "默认环境"));
        values.put("time", safe(time, "-"));
        values.put("resourceSummary", safe(resourceSummary, "-"));
        values.put("failureCount", String.valueOf(Math.max(failureCount, 0)));
        values.put("cooldownLabel", safe(cooldownLabel, "-"));
        values.put("failureDetails", safe(failureDetails, "-"));
        values.put("status", failureCount > 0 ? "告警" : "恢复");
        return values;
    }

    private static String safe(String value, String fallback) {
        if (value == null || value.trim().isEmpty()) {
            return fallback;
        }
        return value;
    }
}
