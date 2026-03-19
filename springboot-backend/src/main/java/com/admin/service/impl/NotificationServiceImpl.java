package com.admin.service.impl;

import com.admin.common.auth.AuthContext;
import com.admin.common.auth.AuthPrincipal;
import com.admin.common.lang.R;
import com.admin.entity.IamUser;
import com.admin.entity.Notification;
import com.admin.entity.NotifyChannel;
import com.admin.entity.NotifyPolicy;
import com.admin.mapper.IamUserMapper;
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
import java.time.LocalTime;
import java.util.*;

@Slf4j
@Service
public class NotificationServiceImpl extends ServiceImpl<NotificationMapper, Notification> implements NotificationService {

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
    @Resource
    private IamUserMapper iamUserMapper;

    // ==================== Send (fan-out per user) ====================

    @Override
    public R send(String title, String content, String type, String severity, String sourceModule, Long sourceId) {
        long now = System.currentTimeMillis();
        String sev = severity != null ? severity : "info";

        List<IamUser> eligibleUsers = iamUserMapper.selectList(
                new LambdaQueryWrapper<IamUser>()
                        .eq(IamUser::getEnabled, 1)
                        .eq(IamUser::getStatus, 0));

        // Broadcast row for legacy users (userId=NULL)
        Notification broadcast = buildNotification(null, title, content, type, sev, sourceModule, sourceId, now);
        notificationMapper.insert(broadcast);

        // Per-user rows for IAM users (each gets independent read/snooze state)
        for (IamUser user : eligibleUsers) {
            Notification n = buildNotification(user.getId(), title, content, type, sev, sourceModule, sourceId, now);
            notificationMapper.insert(n);
        }
        if (!eligibleUsers.isEmpty()) {
            log.info("[Notification] Fan-out {} notifications to {} IAM users: {}", type, eligibleUsers.size(), title);
        }

        dispatchToExternalChannels(title, content, type, sev, null, null);

        return R.ok("sent");
    }

    @Override
    public R send(String title, String content, String type, String severity,
                  String sourceModule, Long sourceId, String category, String tags) {
        long now = System.currentTimeMillis();
        String sev = severity != null ? severity : "info";

        List<IamUser> eligibleUsers = iamUserMapper.selectList(
                new LambdaQueryWrapper<IamUser>()
                        .eq(IamUser::getEnabled, 1)
                        .eq(IamUser::getStatus, 0));

        Notification broadcast = buildNotification(null, title, content, type, sev, sourceModule, sourceId, now);
        notificationMapper.insert(broadcast);

        for (IamUser user : eligibleUsers) {
            Notification n = buildNotification(user.getId(), title, content, type, sev, sourceModule, sourceId, now);
            notificationMapper.insert(n);
        }
        if (!eligibleUsers.isEmpty()) {
            log.info("[Notification] Fan-out {} notifications to {} IAM users: {}", type, eligibleUsers.size(), title);
        }

        dispatchToExternalChannels(title, content, type, sev, category, tags);

        return R.ok("sent");
    }

    private Notification buildNotification(Long userId, String title, String content, String type,
                                           String severity, String sourceModule, Long sourceId, long now) {
        Notification n = new Notification();
        n.setUserId(userId);
        n.setTitle(title);
        n.setContent(content);
        n.setType(type);
        n.setSeverity(severity);
        n.setSourceModule(sourceModule);
        n.setSourceId(sourceId);
        n.setReadStatus(0);
        n.setCreatedTime(now);
        n.setUpdatedTime(now);
        n.setStatus(0);
        return n;
    }

    /** 渠道级限流计数器：channelId → 窗口内已发数量 */
    private final Map<Long, long[]> channelRateWindow = new java.util.concurrent.ConcurrentHashMap<>();

    private void dispatchToExternalChannels(String title, String content, String type, String severity,
                                               String category, String tags) {
        List<NotifyPolicy> policies = notifyPolicyMapper.selectList(
                new LambdaQueryWrapper<NotifyPolicy>()
                        .eq(NotifyPolicy::getEnabled, 1)
                        .eq(NotifyPolicy::getStatus, 0));

        boolean isRecovery = "alert_recovery".equals(type);

        for (NotifyPolicy policy : policies) {
            if (StringUtils.hasText(policy.getEventTypes()) && !policy.getEventTypes().contains(type)) continue;
            if (StringUtils.hasText(policy.getSeverityFilter()) && !policy.getSeverityFilter().contains(severity)) continue;

            // 恢复通知过滤：策略可选择不外发恢复通知
            if (isRecovery && policy.getIncludeRecovery() != null && policy.getIncludeRecovery() == 0) {
                continue;
            }

            // 告警类别过滤
            if (StringUtils.hasText(policy.getCategoryFilter()) &&
                    (category == null || !policy.getCategoryFilter().contains(category))) {
                continue;
            }

            // 标签过滤（交集匹配）
            if (StringUtils.hasText(policy.getTagFilter()) && !matchesTags(policy.getTagFilter(), tags)) {
                continue;
            }

            // 静默窗口检查
            if (StringUtils.hasText(policy.getMuteSchedule()) && isInMuteWindow(policy.getMuteSchedule())) {
                log.debug("[Notification] Policy {} in mute window, skipping external dispatch: {}", policy.getName(), title);
                continue;
            }

            if (StringUtils.hasText(policy.getChannelIds())) {
                for (String channelIdStr : policy.getChannelIds().split(",")) {
                    try {
                        Long channelId = Long.parseLong(channelIdStr.trim());
                        NotifyChannel channel = notifyChannelMapper.selectById(channelId);
                        if (channel == null || channel.getEnabled() == null || channel.getEnabled() != 1) continue;

                        // 渠道限流检查
                        if (isRateLimited(channel)) {
                            log.info("[Notification] Channel {} rate-limited, skipping: {}", channel.getName(), title);
                            continue;
                        }

                        dispatchToChannel(channel, title, content, severity);
                        recordChannelSend(channelId);
                    } catch (NumberFormatException e) {
                        log.warn("[Notification] Invalid channelId in policy {}: {}", policy.getId(), channelIdStr);
                    }
                }
            }
        }
    }

    private boolean isRateLimited(NotifyChannel channel) {
        Integer limit = channel.getRateLimitPerMinute();
        if (limit == null || limit <= 0) return false;
        long now = System.currentTimeMillis();
        long[] window = channelRateWindow.get(channel.getId());
        if (window == null) return false;
        // window[0] = 窗口开始时间, window[1] = 窗口内计数
        if (now - window[0] > 60_000) return false; // 窗口已过期
        return window[1] >= limit;
    }

    private void recordChannelSend(Long channelId) {
        long now = System.currentTimeMillis();
        channelRateWindow.compute(channelId, (k, window) -> {
            if (window == null || now - window[0] > 60_000) {
                return new long[]{now, 1};
            }
            window[1]++;
            return window;
        });
    }

    /** 标签交集匹配：策略 tagFilter 和事件 tags 有任一共同标签则匹配 */
    private boolean matchesTags(String policyTagFilter, String eventTags) {
        if (eventTags == null || eventTags.isEmpty()) return false;
        Set<String> policyTags = new HashSet<>(Arrays.asList(policyTagFilter.split(",")));
        for (String tag : eventTags.split(",")) {
            if (policyTags.contains(tag.trim())) return true;
        }
        return false;
    }

    /** 判断当前时刻是否在静默窗口内，格式 "HH:mm-HH:mm"，支持跨午夜 */
    private boolean isInMuteWindow(String muteSchedule) {
        try {
            String[] parts = muteSchedule.split("-");
            if (parts.length != 2) return false;
            LocalTime start = LocalTime.parse(parts[0].trim());
            LocalTime end = LocalTime.parse(parts[1].trim());
            LocalTime now = LocalTime.now();
            if (start.isBefore(end)) {
                // 同日窗口：如 09:00-18:00
                return !now.isBefore(start) && now.isBefore(end);
            } else {
                // 跨午夜窗口：如 22:00-06:00
                return !now.isBefore(start) || now.isBefore(end);
            }
        } catch (Exception e) {
            log.warn("[Notification] Invalid muteSchedule format: {}", muteSchedule);
            return false;
        }
    }

    // ==================== Query (per-user) ====================

    /**
     * Resolve current user's ID for notification scoping.
     * IAM users → sys_user.id (per-user rows); legacy users → null (see broadcast rows).
     */
    private Long requireCurrentUserId() {
        try {
            AuthPrincipal principal = AuthContext.getCurrentPrincipal();
            if (principal != null && AuthPrincipal.TYPE_IAM.equals(principal.getPrincipalType())) {
                return principal.getPrincipalId();
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public R listForCurrentUser(int page, int size, Integer readStatus, String type) {
        if (page < 1) page = 1;
        if (size < 1 || size > 100) size = 20;
        Long userId = requireCurrentUserId();

        LambdaQueryWrapper<Notification> wrapper = newUserScopedWrapper(userId)
                .orderByDesc(Notification::getCreatedTime);

        if (readStatus != null) {
            wrapper.eq(Notification::getReadStatus, readStatus);
        }
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
        long now = System.currentTimeMillis();
        Long userId = requireCurrentUserId();

        LambdaQueryWrapper<Notification> base = newUserScopedWrapper(userId)
                .eq(Notification::getReadStatus, 0)
                .and(w -> w.isNull(Notification::getSnoozedUntil).or().le(Notification::getSnoozedUntil, now));
        long count = notificationMapper.selectCount(base);

        long criticalCount = notificationMapper.selectCount(newUserScopedWrapper(userId)
                .eq(Notification::getReadStatus, 0)
                .eq(Notification::getSeverity, "critical")
                .and(w -> w.isNull(Notification::getSnoozedUntil).or().le(Notification::getSnoozedUntil, now)));
        long warningCount = notificationMapper.selectCount(newUserScopedWrapper(userId)
                .eq(Notification::getReadStatus, 0)
                .eq(Notification::getSeverity, "warning")
                .and(w -> w.isNull(Notification::getSnoozedUntil).or().le(Notification::getSnoozedUntil, now)));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("count", count);
        result.put("critical", criticalCount);
        result.put("warning", warningCount);
        return R.ok(result);
    }

    @Override
    public R markRead(Long id) {
        if (id == null) return R.err("通知 ID 不能为空");
        Long userId = requireCurrentUserId();

        Notification notification = notificationMapper.selectById(id);
        if (notification == null) return R.err("通知不存在");
        if (userId != null && notification.getUserId() != null && !notification.getUserId().equals(userId)) {
            return R.err("无权操作此通知");
        }

        notification.setReadStatus(1);
        notification.setReadAt(System.currentTimeMillis());
        notification.setUpdatedTime(System.currentTimeMillis());
        notificationMapper.updateById(notification);
        return R.ok("已标记已读");
    }

    @Override
    public R markAllRead() {
        long now = System.currentTimeMillis();
        Long userId = requireCurrentUserId();

        LambdaUpdateWrapper<Notification> wrapper = new LambdaUpdateWrapper<Notification>()
                .eq(Notification::getStatus, 0)
                .eq(Notification::getReadStatus, 0)
                .set(Notification::getReadStatus, 1)
                .set(Notification::getReadAt, now)
                .set(Notification::getUpdatedTime, now);
        if (userId != null) {
            wrapper.eq(Notification::getUserId, userId);
        }
        notificationMapper.update(null, wrapper);
        return R.ok("已全部标记已读");
    }

    @Override
    public R snooze(Long id, int days) {
        if (id == null) return R.err("通知 ID 不能为空");
        Long userId = requireCurrentUserId();

        Notification notification = notificationMapper.selectById(id);
        if (notification == null) return R.err("通知不存在");
        if (userId != null && notification.getUserId() != null && !notification.getUserId().equals(userId)) {
            return R.err("无权操作此通知");
        }

        long now = System.currentTimeMillis();
        if (days <= 0) {
            notification.setReadStatus(1);
            notification.setReadAt(now);
            notification.setSnoozedUntil(null);
        } else {
            notification.setSnoozedUntil(now + (long) days * 24 * 60 * 60 * 1000);
        }
        notification.setUpdatedTime(now);
        notificationMapper.updateById(notification);
        return R.ok("操作成功");
    }

    @Override
    public R activeCritical() {
        long now = System.currentTimeMillis();
        Long userId = requireCurrentUserId();

        LambdaQueryWrapper<Notification> wrapper = newUserScopedWrapper(userId)
                .eq(Notification::getReadStatus, 0)
                .in(Notification::getSeverity, "critical", "warning")
                .and(w -> w.isNull(Notification::getSnoozedUntil).or().le(Notification::getSnoozedUntil, now))
                .orderByDesc(Notification::getCreatedTime)
                .last("LIMIT 10");
        List<Notification> list = notificationMapper.selectList(wrapper);
        return R.ok(list);
    }

    /**
     * Build a base wrapper scoped to the current user's notifications.
     * IAM users (userId != null): only see their own per-user rows.
     * Legacy users (userId == null): only see broadcast rows (userId IS NULL).
     */
    private LambdaQueryWrapper<Notification> newUserScopedWrapper(Long userId) {
        LambdaQueryWrapper<Notification> w = new LambdaQueryWrapper<Notification>()
                .eq(Notification::getStatus, 0);
        if (userId != null) {
            w.eq(Notification::getUserId, userId);
        } else {
            w.isNull(Notification::getUserId);
        }
        return w;
    }

    // ==================== External Channel Dispatch ====================

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
                case "wechat":
                    sendWechat(config, title, content, severity);
                    break;
                case "dingtalk":
                    sendDingtalk(config, title, content, severity);
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

    private void sendWechat(JSONObject config, String title, String content, String severity) {
        String webhookUrl = config.getString("webhookUrl");
        if (!StringUtils.hasText(webhookUrl)) {
            log.warn("[Notification] WeChat config missing webhookUrl");
            return;
        }
        String severityTag = "info".equals(severity) ? "提示" : "warning".equals(severity) ? "警告" : "critical".equals(severity) ? "严重" : severity;
        String markdown = String.format("**[%s] %s**\n%s", severityTag, title, content);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("msgtype", "markdown");
        body.put("markdown", Map.of("content", markdown));
        httpPost(webhookUrl, JSON.toJSONString(body));
    }

    private void sendDingtalk(JSONObject config, String title, String content, String severity) {
        String webhookUrl = config.getString("webhookUrl");
        if (!StringUtils.hasText(webhookUrl)) {
            log.warn("[Notification] DingTalk config missing webhookUrl");
            return;
        }
        String severityTag = "info".equals(severity) ? "提示" : "warning".equals(severity) ? "警告" : "critical".equals(severity) ? "严重" : severity;
        String markdown = String.format("**[%s] %s**\n\n%s", severityTag, title, content);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("msgtype", "markdown");
        body.put("markdown", Map.of("title", String.format("[%s] %s", severityTag, title), "text", markdown));
        httpPost(webhookUrl, JSON.toJSONString(body));
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
