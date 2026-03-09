package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.Notification;
import com.admin.entity.NotifyChannel;
import com.admin.entity.NotifyPolicy;
import com.admin.mapper.NotificationMapper;
import com.admin.mapper.NotifyChannelMapper;
import com.admin.mapper.NotifyPolicyMapper;
import com.admin.service.NotificationService;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
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
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Slf4j
@Service
public class NotificationServiceImpl extends ServiceImpl<NotificationMapper, Notification> implements NotificationService {

    /** 共享连接池 HttpClient，用于通知投递 */
    private static final CloseableHttpClient SHARED_CLIENT;
    static {
        PoolingHttpClientConnectionManager cm = new PoolingHttpClientConnectionManager();
        cm.setMaxTotal(20);
        cm.setDefaultMaxPerRoute(5);
        SHARED_CLIENT = HttpClients.custom().setConnectionManager(cm).build();
    }

    @Resource
    private NotificationMapper notificationMapper;
    @Resource
    private NotifyPolicyMapper notifyPolicyMapper;
    @Resource
    private NotifyChannelMapper notifyChannelMapper;

    @Override
    public R send(String title, String content, String type, String severity, String sourceModule, Long sourceId) {
        long now = System.currentTimeMillis();

        // Create notification record
        Notification notification = new Notification();
        notification.setTitle(title);
        notification.setContent(content);
        notification.setType(type);
        notification.setSeverity(severity != null ? severity : "info");
        notification.setSourceModule(sourceModule);
        notification.setSourceId(sourceId);
        notification.setReadStatus(0);
        notification.setCreatedTime(now);
        notification.setUpdatedTime(now);
        notification.setStatus(0);
        notificationMapper.insert(notification);

        // Query matching policies
        List<NotifyPolicy> policies = notifyPolicyMapper.selectList(
                new LambdaQueryWrapper<NotifyPolicy>()
                        .eq(NotifyPolicy::getEnabled, 1)
                        .eq(NotifyPolicy::getStatus, 0));

        for (NotifyPolicy policy : policies) {
            // Check if event type matches
            if (StringUtils.hasText(policy.getEventTypes())) {
                if (!policy.getEventTypes().contains(type)) continue;
            }
            // Check if severity matches
            if (StringUtils.hasText(policy.getSeverityFilter())) {
                if (!policy.getSeverityFilter().contains(severity)) continue;
            }

            // Dispatch to channels
            if (StringUtils.hasText(policy.getChannelIds())) {
                String[] channelIdArr = policy.getChannelIds().split(",");
                for (String channelIdStr : channelIdArr) {
                    try {
                        Long channelId = Long.parseLong(channelIdStr.trim());
                        NotifyChannel channel = notifyChannelMapper.selectById(channelId);
                        if (channel == null || channel.getEnabled() == null || channel.getEnabled() != 1) continue;
                        dispatchToChannel(channel, title, content, severity);
                    } catch (NumberFormatException e) {
                        log.warn("[Notification] Invalid channelId in policy {}: {}", policy.getId(), channelIdStr);
                    }
                }
            }
        }

        return R.ok(notification);
    }

    @Override
    public R listForCurrentUser(int page, int size, Integer readStatus, String type) {
        if (page < 1) page = 1;
        if (size < 1 || size > 100) size = 20;

        LambdaQueryWrapper<Notification> wrapper = new LambdaQueryWrapper<Notification>()
                .eq(Notification::getStatus, 0)
                .orderByDesc(Notification::getCreatedTime);

        // Filter by readStatus if provided
        if (readStatus != null) {
            wrapper.eq(Notification::getReadStatus, readStatus);
        }
        // Filter by type if provided
        if (StringUtils.hasText(type)) {
            wrapper.eq(Notification::getType, type);
        }

        Page<Notification> p = notificationMapper.selectPage(new Page<>(page, size), wrapper);
        return R.ok(Map.of(
                "records", p.getRecords(),
                "total", p.getTotal(),
                "page", p.getCurrent(),
                "size", p.getSize()));
    }

    @Override
    public R unreadCount() {
        long count = notificationMapper.selectCount(
                new LambdaQueryWrapper<Notification>()
                        .eq(Notification::getStatus, 0)
                        .eq(Notification::getReadStatus, 0));
        return R.ok(Map.of("count", count));
    }

    @Override
    public R markRead(Long id) {
        if (id == null) return R.err("通知 ID 不能为空");
        Notification notification = notificationMapper.selectById(id);
        if (notification == null) return R.err("通知不存在");

        notification.setReadStatus(1);
        notification.setReadAt(System.currentTimeMillis());
        notification.setUpdatedTime(System.currentTimeMillis());
        notificationMapper.updateById(notification);
        return R.ok("已标记已读");
    }

    @Override
    public R markAllRead() {
        long now = System.currentTimeMillis();
        notificationMapper.update(null,
                new LambdaUpdateWrapper<Notification>()
                        .eq(Notification::getStatus, 0)
                        .eq(Notification::getReadStatus, 0)
                        .set(Notification::getReadStatus, 1)
                        .set(Notification::getReadAt, now)
                        .set(Notification::getUpdatedTime, now));
        return R.ok("已全部标记已读");
    }

    // ==================== Channel Dispatch ====================

    private void dispatchToChannel(NotifyChannel channel, String title, String content, String severity) {
        String channelType = channel.getType();
        JSONObject config = StringUtils.hasText(channel.getConfigJson())
                ? JSON.parseObject(channel.getConfigJson()) : new JSONObject();

        try {
            switch (channelType) {
                case "telegram":
                    sendTelegram(config, title, content, severity);
                    break;
                case "webhook":
                    sendWebhook(config, title, content, severity);
                    break;
                case "email":
                    log.info("[Notification] Email channel (not yet implemented): to={}, title={}", config.getString("to"), title);
                    break;
                default:
                    log.warn("[Notification] Unknown channel type: {}", channelType);
            }
        } catch (Exception e) {
            log.error("[Notification] Failed to dispatch to channel {} ({}): {}", channel.getName(), channelType, e.getMessage());
        }
    }

    private void sendTelegram(JSONObject config, String title, String content, String severity) {
        String token = config.getString("token");
        String chatId = config.getString("chatId");
        if (!StringUtils.hasText(token) || !StringUtils.hasText(chatId)) {
            log.warn("[Notification] Telegram config missing token or chatId");
            return;
        }

        String text = String.format("[%s] %s\n%s", severity.toUpperCase(), title, content);
        String url = String.format("https://api.telegram.org/bot%s/sendMessage", token);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("chat_id", chatId);
        payload.put("text", text);
        payload.put("parse_mode", "HTML");

        httpPost(url, JSON.toJSONString(payload));
    }

    private void sendWebhook(JSONObject config, String title, String content, String severity) {
        String url = config.getString("url");
        if (!StringUtils.hasText(url)) {
            log.warn("[Notification] Webhook config missing url");
            return;
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("title", title);
        payload.put("text", content);
        payload.put("severity", severity);
        payload.put("timestamp", System.currentTimeMillis());

        httpPost(url, JSON.toJSONString(payload));
    }

    private void httpPost(String url, String jsonBody) {
        try {
            HttpPost request = new HttpPost(url);
            request.setConfig(RequestConfig.custom()
                    .setConnectTimeout(5000)
                    .setSocketTimeout(10000)
                    .build());
            request.setHeader("Content-Type", "application/json");
            request.setEntity(new StringEntity(jsonBody, StandardCharsets.UTF_8));

            try (CloseableHttpResponse response = SHARED_CLIENT.execute(request)) {
                int statusCode = response.getStatusLine().getStatusCode();
                EntityUtils.consumeQuietly(response.getEntity());
                if (statusCode < 200 || statusCode >= 300) {
                    log.warn("[Notification] HTTP POST to {} returned {}", url, statusCode);
                }
            }
        } catch (Exception e) {
            log.error("[Notification] HTTP POST to {} failed: {}", url, e.getMessage());
        }
    }
}
