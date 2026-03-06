package com.admin.common.utils;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

/**
 * 企业微信机器人通知工具
 * 使用企业微信群机器人 Webhook 推送 Markdown 消息
 */
@Slf4j
public class WeChatWorkUtil {

    private static final RestTemplate restTemplate = new RestTemplate();

    /**
     * 发送 Markdown 格式消息到企业微信群机器人
     *
     * @param webhookUrl 企业微信机器人 Webhook URL
     * @param content    Markdown 格式内容
     */
    public static boolean sendMarkdown(String webhookUrl, String content) {
        if (webhookUrl == null || webhookUrl.trim().isEmpty()) {
            log.warn("[企业微信] Webhook URL 未配置，跳过通知");
            return false;
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> body = new HashMap<>();
            body.put("msgtype", "markdown");
            Map<String, String> markdownContent = new HashMap<>();
            markdownContent.put("content", content);
            body.put("markdown", markdownContent);

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(webhookUrl, request, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                log.info("[企业微信] 通知发送成功");
                return true;
            } else {
                log.warn("[企业微信] 通知发送失败，HTTP状态: {}", response.getStatusCode());
                return false;
            }
        } catch (Exception e) {
            log.error("[企业微信] 发送通知异常: {}", e.getMessage(), e);
            return false;
        }
    }
}
