package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.NotifyChannel;
import com.admin.mapper.NotifyChannelMapper;
import com.admin.service.NotifyChannelService;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class NotifyChannelServiceImpl extends ServiceImpl<NotifyChannelMapper, NotifyChannel> implements NotifyChannelService {

    @Resource
    private NotifyChannelMapper notifyChannelMapper;

    @Override
    public R listChannels() {
        List<NotifyChannel> channels = notifyChannelMapper.selectList(
                new LambdaQueryWrapper<NotifyChannel>()
                        .eq(NotifyChannel::getStatus, 0)
                        .orderByDesc(NotifyChannel::getCreatedTime));
        return R.ok(channels);
    }

    @Override
    public R createChannel(NotifyChannel channel) {
        long now = System.currentTimeMillis();
        channel.setCreatedTime(now);
        channel.setUpdatedTime(now);
        channel.setStatus(0);
        if (channel.getEnabled() == null) channel.setEnabled(1);
        notifyChannelMapper.insert(channel);
        return R.ok(channel);
    }

    @Override
    public R updateChannel(NotifyChannel channel) {
        if (channel.getId() == null) return R.err("渠道 ID 不能为空");
        NotifyChannel existing = notifyChannelMapper.selectById(channel.getId());
        if (existing == null) return R.err("渠道不存在");

        channel.setUpdatedTime(System.currentTimeMillis());
        notifyChannelMapper.updateById(channel);
        return R.ok(channel);
    }

    @Override
    public R deleteChannel(Long id) {
        if (id == null) return R.err("渠道 ID 不能为空");
        NotifyChannel existing = notifyChannelMapper.selectById(id);
        if (existing == null) return R.err("渠道不存在");
        notifyChannelMapper.deleteById(id);
        return R.ok("已删除");
    }

    @Override
    public R testChannel(Long id) {
        if (id == null) return R.err("渠道 ID 不能为空");
        NotifyChannel channel = notifyChannelMapper.selectById(id);
        if (channel == null) return R.err("渠道不存在");

        String channelType = channel.getType();
        JSONObject config = StringUtils.hasText(channel.getConfigJson())
                ? JSON.parseObject(channel.getConfigJson()) : new JSONObject();

        String testResult;
        try {
            switch (channelType) {
                case "telegram":
                    testResult = testTelegram(config);
                    break;
                case "webhook":
                    testResult = testWebhook(config);
                    break;
                case "email":
                    log.info("[NotifyChannel] Email test: to={} (SMTP not yet configured)", config.getString("to"));
                    testResult = "skipped";
                    break;
                default:
                    testResult = "unknown_type";
            }
        } catch (Exception e) {
            log.error("[NotifyChannel] Test failed for channel {}: {}", channel.getName(), e.getMessage());
            testResult = "failed";
        }

        // Update test status
        long now = System.currentTimeMillis();
        channel.setTestStatus(testResult);
        channel.setLastTestAt(now);
        channel.setUpdatedTime(now);
        notifyChannelMapper.updateById(channel);

        return R.ok(Map.of("testStatus", testResult, "lastTestAt", now));
    }

    // ==================== Test Methods ====================

    private String testTelegram(JSONObject config) {
        String token = config.getString("token");
        String chatId = config.getString("chatId");
        if (!StringUtils.hasText(token) || !StringUtils.hasText(chatId)) {
            return "failed: missing token or chatId";
        }

        String url = String.format("https://api.telegram.org/bot%s/sendMessage", token);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("chat_id", chatId);
        payload.put("text", "Flux Panel 通知测试");

        return httpPostTest(url, JSON.toJSONString(payload));
    }

    private String testWebhook(JSONObject config) {
        String url = config.getString("url");
        if (!StringUtils.hasText(url)) {
            return "failed: missing url";
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("text", "Flux Panel 通知测试");
        payload.put("timestamp", System.currentTimeMillis());

        return httpPostTest(url, JSON.toJSONString(payload));
    }

    private String httpPostTest(String url, String jsonBody) {
        try (CloseableHttpClient client = HttpClients.createDefault()) {
            HttpPost request = new HttpPost(url);
            request.setConfig(RequestConfig.custom()
                    .setConnectTimeout(5000)
                    .setSocketTimeout(10000)
                    .build());
            request.setHeader("Content-Type", "application/json");
            request.setEntity(new StringEntity(jsonBody, StandardCharsets.UTF_8));

            try (CloseableHttpResponse response = client.execute(request)) {
                int statusCode = response.getStatusLine().getStatusCode();
                EntityUtils.consumeQuietly(response.getEntity());
                if (statusCode >= 200 && statusCode < 300) {
                    return "success";
                } else {
                    return "failed: HTTP " + statusCode;
                }
            }
        } catch (Exception e) {
            log.error("[NotifyChannel] HTTP POST test to {} failed: {}", url, e.getMessage());
            return "failed: " + e.getMessage();
        }
    }
}
