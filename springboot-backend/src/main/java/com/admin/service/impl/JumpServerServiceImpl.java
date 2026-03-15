package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.AssetHost;
import com.admin.entity.ViteConfig;
import com.admin.mapper.AssetHostMapper;
import com.admin.service.JumpServerService;
import com.admin.service.ViteConfigService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.net.URLEncoder;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Slf4j
@Service
public class JumpServerServiceImpl implements JumpServerService {

    @Resource
    private ViteConfigService viteConfigService;

    @Resource
    private AssetHostMapper assetHostMapper;

    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    @Override
    public R getStatus() {
        String enabled = getConfig("jumpserver_enabled");
        String url = getConfig("jumpserver_url");
        String keyId = getConfig("jumpserver_access_key_id");
        String keySecret = getConfig("jumpserver_access_key_secret");

        Map<String, Object> status = new LinkedHashMap<>();
        status.put("enabled", "true".equals(enabled));
        status.put("configured", StringUtils.hasText(url) && StringUtils.hasText(keyId) && StringUtils.hasText(keySecret));
        status.put("url", url);
        return R.ok(status);
    }

    @Override
    public R createConnectionToken(Long assetId, String protocol, String account) {
        // 1. Check enabled
        if (!"true".equals(getConfig("jumpserver_enabled"))) {
            return R.err("JumpServer 集成未启用");
        }

        String baseUrl = getConfig("jumpserver_url");
        String keyId = getConfig("jumpserver_access_key_id");
        String keySecret = getConfig("jumpserver_access_key_secret");

        if (!StringUtils.hasText(baseUrl) || !StringUtils.hasText(keyId) || !StringUtils.hasText(keySecret)) {
            return R.err("JumpServer 配置不完整，请在系统配置中填写 URL 和 Access Key");
        }

        // 2. Get Flux asset
        AssetHost asset = assetHostMapper.selectById(assetId);
        if (asset == null) {
            return R.err("资产不存在");
        }

        if (!StringUtils.hasText(protocol)) protocol = "ssh";
        if (!StringUtils.hasText(account)) account = "root";

        String jsAssetId;
        try {
            // 3. Resolve JumpServer asset: prefer explicit binding, else lookup by IP
            if (StringUtils.hasText(asset.getJumpserverAssetId())) {
                jsAssetId = asset.getJumpserverAssetId();
            } else {
                String ip = asset.getPrimaryIp();
                if (!StringUtils.hasText(ip)) {
                    return R.err("该资产未配置 IP 且未绑定 JumpServer 资产，请在编辑资产中绑定或填写主 IP");
                }
                jsAssetId = findJumpServerAsset(baseUrl, keyId, keySecret, ip);
                if (jsAssetId == null) {
                    return R.err("在 JumpServer 中未找到 IP 为 " + ip + " 的资产，请先在 JumpServer 中注册或在编辑资产中绑定 JumpServer 资产");
                }
            }
        } catch (Exception e) {
            log.error("[JumpServer] 解析资产异常", e);
            return R.err("JumpServer 连接异常: " + e.getMessage());
        }

        try {

            // 4. Create ConnectionToken
            String tokenUrl = baseUrl.replaceAll("/+$", "") + "/api/v1/authentication/connection-token/";

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("asset", jsAssetId);
            body.put("account", account);
            body.put("protocol", protocol);
            body.put("connect_method", "web_cli");

            String jsonBody = objectMapper.writeValueAsString(body);

            HttpRequest request = buildSignedRequest(tokenUrl, keyId, keySecret, "POST", jsonBody);
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                JsonNode respJson = objectMapper.readTree(response.body());
                String tokenId = respJson.has("id") ? respJson.get("id").asText() : null;

                if (tokenId == null) {
                    return R.err("JumpServer 返回数据异常: " + response.body());
                }

                // Build Luna URL
                String lunaUrl = baseUrl.replaceAll("/+$", "") + "/luna/?token=" + tokenId;

                Map<String, String> result = new LinkedHashMap<>();
                result.put("url", lunaUrl);
                result.put("tokenId", tokenId);
                return R.ok(result);
            } else {
                log.warn("[JumpServer] 创建 ConnectionToken 失败: HTTP {} - {}", response.statusCode(), response.body());
                return R.err("JumpServer 请求失败 (HTTP " + response.statusCode() + "): " + truncate(response.body(), 200));
            }
        } catch (Exception e) {
            log.error("[JumpServer] 创建 ConnectionToken 异常", e);
            return R.err("JumpServer 连接异常: " + e.getMessage());
        }
    }

    @Override
    public R listHosts(String search) {
        if (!"true".equals(getConfig("jumpserver_enabled"))) {
            return R.err("JumpServer 集成未启用");
        }
        String baseUrl = getConfig("jumpserver_url");
        String keyId = getConfig("jumpserver_access_key_id");
        String keySecret = getConfig("jumpserver_access_key_secret");
        if (!StringUtils.hasText(baseUrl) || !StringUtils.hasText(keyId) || !StringUtils.hasText(keySecret)) {
            return R.err("JumpServer 配置不完整");
        }
        try {
            String path = "/api/v1/assets/hosts/?limit=100";
            if (StringUtils.hasText(search)) {
                path += "&search=" + URLEncoder.encode(search.trim(), StandardCharsets.UTF_8.name());
            }
            String url = baseUrl.replaceAll("/+$", "") + path;
            HttpRequest request = buildSignedRequest(url, keyId, keySecret, "GET", null);
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                return R.err("JumpServer 请求失败: " + response.statusCode());
            }
            JsonNode root = objectMapper.readTree(response.body());
            JsonNode results = root.has("results") ? root.get("results") : root;
            if (!results.isArray()) {
                return R.ok(Collections.emptyList());
            }
            List<Map<String, String>> list = new ArrayList<>();
            for (JsonNode item : results) {
                Map<String, String> row = new LinkedHashMap<>();
                row.put("id", item.has("id") ? item.get("id").asText() : "");
                row.put("name", item.has("name") ? item.get("name").asText() : "");
                row.put("address", item.has("address") ? item.get("address").asText() : "");
                list.add(row);
            }
            return R.ok(list);
        } catch (Exception e) {
            log.error("[JumpServer] listHosts 异常", e);
            return R.err("JumpServer 连接异常: " + e.getMessage());
        }
    }

    @Override
    public R matchByIp(Long assetId, boolean save) {
        if (!"true".equals(getConfig("jumpserver_enabled"))) {
            return R.err("JumpServer 集成未启用");
        }
        AssetHost asset = assetHostMapper.selectById(assetId);
        if (asset == null) {
            return R.err("资产不存在");
        }
        String ip = asset.getPrimaryIp();
        if (!StringUtils.hasText(ip)) {
            return R.err("该资产未配置主 IP");
        }
        String baseUrl = getConfig("jumpserver_url");
        String keyId = getConfig("jumpserver_access_key_id");
        String keySecret = getConfig("jumpserver_access_key_secret");
        if (!StringUtils.hasText(baseUrl) || !StringUtils.hasText(keyId) || !StringUtils.hasText(keySecret)) {
            return R.err("JumpServer 配置不完整");
        }
        try {
            Map<String, String> host = findJumpServerHostByIp(baseUrl, keyId, keySecret, ip);
            if (host == null) {
                return R.err("在 JumpServer 中未找到 IP 为 " + ip + " 的主机");
            }
            if (save) {
                asset.setJumpserverAssetId(host.get("id"));
                assetHostMapper.updateById(asset);
            }
            return R.ok(host);
        } catch (Exception e) {
            log.error("[JumpServer] matchByIp 异常", e);
            return R.err("JumpServer 连接异常: " + e.getMessage());
        }
    }

    // ========== Private helpers ==========

    private String findJumpServerAsset(String baseUrl, String keyId, String keySecret, String ip) throws Exception {
        String searchUrl = baseUrl.replaceAll("/+$", "") + "/api/v1/assets/hosts/?address=" + ip + "&limit=1";

        HttpRequest request = buildSignedRequest(searchUrl, keyId, keySecret, "GET", null);
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 200) {
            JsonNode respJson = objectMapper.readTree(response.body());
            JsonNode results = respJson.has("results") ? respJson.get("results") : respJson;
            if (results.isArray() && results.size() > 0) {
                return results.get(0).get("id").asText();
            }
        }
        return null;
    }

    /** 按 IP 查找 JumpServer 主机并返回 id/name/address，未找到返回 null */
    private Map<String, String> findJumpServerHostByIp(String baseUrl, String keyId, String keySecret, String ip) throws Exception {
        String searchUrl = baseUrl.replaceAll("/+$", "") + "/api/v1/assets/hosts/?address=" + ip + "&limit=1";
        HttpRequest request = buildSignedRequest(searchUrl, keyId, keySecret, "GET", null);
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() == 200) {
            JsonNode respJson = objectMapper.readTree(response.body());
            JsonNode results = respJson.has("results") ? respJson.get("results") : respJson;
            if (results.isArray() && results.size() > 0) {
                JsonNode first = results.get(0);
                Map<String, String> host = new LinkedHashMap<>();
                host.put("id", first.has("id") ? first.get("id").asText() : "");
                host.put("name", first.has("name") ? first.get("name").asText() : "");
                host.put("address", first.has("address") ? first.get("address").asText() : "");
                return host;
            }
        }
        return null;
    }

    /**
     * Build HMAC-SHA256 signed request for JumpServer Access Key authentication
     */
    private HttpRequest buildSignedRequest(String url, String keyId, String keySecret, String method, String body) throws Exception {
        String dateStr = DateTimeFormatter.ofPattern("EEE, dd MMM yyyy HH:mm:ss 'GMT'", Locale.US)
                .withZone(ZoneOffset.UTC)
                .format(Instant.now());

        URI uri = URI.create(url);
        String path = uri.getRawPath();
        if (uri.getRawQuery() != null) path += "?" + uri.getRawQuery();

        // Signing string: HTTP method + \n + path + \n + date
        String signingString = method.toUpperCase() + "\n" + path + "\n" + dateStr;

        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(keySecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String signature = Base64.getEncoder().encodeToString(mac.doFinal(signingString.getBytes(StandardCharsets.UTF_8)));

        String authorization = "Sign " + keyId + ":" + signature;

        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(uri)
                .header("Accept", "application/json")
                .header("Date", dateStr)
                .header("Authorization", authorization)
                .header("X-JMS-ORG", "00000000-0000-0000-0000-000000000002")
                .timeout(Duration.ofSeconds(15));

        if ("POST".equalsIgnoreCase(method) && body != null) {
            builder.POST(HttpRequest.BodyPublishers.ofString(body))
                    .header("Content-Type", "application/json");
        } else {
            builder.GET();
        }

        return builder.build();
    }

    private String getConfig(String key) {
        try {
            ViteConfig config = viteConfigService.getOne(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<ViteConfig>().eq("name", key));
            return config != null ? config.getValue() : "";
        } catch (Exception e) {
            return "";
        }
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() > maxLen ? s.substring(0, maxLen) + "..." : s;
    }
}
