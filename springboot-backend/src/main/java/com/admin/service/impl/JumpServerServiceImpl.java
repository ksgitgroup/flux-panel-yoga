package com.admin.service.impl;

import com.admin.common.auth.AuthContext;
import com.admin.common.auth.AuthPrincipal;
import com.admin.common.lang.R;
import com.admin.entity.AssetHost;
import com.admin.entity.IamUser;
import com.admin.mapper.AssetHostMapper;
import com.admin.mapper.IamUserMapper;
import com.admin.service.JumpServerService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

@Slf4j
@Service
public class JumpServerServiceImpl implements JumpServerService {

    @Resource
    private AssetHostMapper assetHostMapper;

    @Resource
    private IamUserMapper iamUserMapper;

    @Resource
    private JumpServerCredentialCryptoService credentialCryptoService;

    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();

    @Override
    public R getStatus() {
        UserJumpServerConfig cfg = loadCurrentUserConfig(false);
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("enabled", cfg != null && cfg.isConfigured());
        status.put("configured", cfg != null && cfg.isConfigured());
        status.put("url", cfg != null ? cfg.getBaseUrl() : "");
        return R.ok(status);
    }

    @Override
    public R getCurrentUserConfig() {
        UserJumpServerConfig cfg = loadCurrentUserConfig(false);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("url", cfg != null ? cfg.getBaseUrl() : "");
        data.put("configured", cfg != null && cfg.isConfigured());
        return R.ok(data);
    }

    @Override
    public R updateCurrentUserConfig(String url, String accessKeyId, String accessKeySecret) {
        AuthPrincipal principal = AuthContext.getCurrentPrincipal();
        if (principal == null || principal.getPrincipalId() == null) {
            return R.err(401, "未登录");
        }
        Long userId = principal.getPrincipalId();
        IamUser user = iamUserMapper.selectById(userId);
        if (user == null) {
            return R.err("当前用户不存在");
        }
        String trimmedUrl = url != null ? url.trim() : "";
        if (StringUtils.hasText(trimmedUrl) && !trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
            return R.err("JumpServer 地址必须以 http:// 或 https:// 开头");
        }
        user.setJumpserverUrl(StringUtils.hasText(trimmedUrl) ? trimmedUrl : null);
        user.setJumpserverAccessKeyId(StringUtils.hasText(accessKeyId) ? accessKeyId.trim() : null);
        if (StringUtils.hasText(accessKeySecret)) {
            try {
                String encrypted = credentialCryptoService.encrypt(accessKeySecret);
                user.setJumpserverAccessKeySecret(encrypted);
            } catch (Exception e) {
                log.error("[JumpServer] 加密 Access Key Secret 失败", e);
                return R.err("保存 JumpServer 凭据失败: " + e.getMessage());
            }
        }
        long now = System.currentTimeMillis();
        user.setUpdatedTime(now);
        iamUserMapper.updateById(user);
        return R.ok();
    }

    @Override
    public R createConnectionToken(Long assetId, String protocol, String account) {
        UserJumpServerConfig cfg = loadCurrentUserConfig(true);
        if (cfg == null || !cfg.isConfigured()) {
            return R.err("当前用户未配置 JumpServer 凭据，请先在个人中心中配置 JumpServer 地址和 Access Key");
        }

        AssetHost asset = assetHostMapper.selectById(assetId);
        if (asset == null) {
            return R.err("资产不存在");
        }

        if (!StringUtils.hasText(protocol)) protocol = "ssh";
        if (!StringUtils.hasText(account)) account = "root";

        String jsAssetId;
        try {
            if (StringUtils.hasText(asset.getJumpserverAssetId())) {
                jsAssetId = asset.getJumpserverAssetId();
            } else {
                String ip = asset.getPrimaryIp();
                if (!StringUtils.hasText(ip)) {
                    return R.err("该资产未配置 IP 且未绑定 JumpServer 资产，请在编辑资产中绑定或填写主 IP");
                }
                jsAssetId = findJumpServerAsset(cfg.getBaseUrl(), cfg.getAccessKeyId(), cfg.getAccessKeySecret(), ip);
                if (jsAssetId == null) {
                    return R.err("在 JumpServer 中未找到 IP 为 " + ip + " 的资产，请先在 JumpServer 中注册或在编辑资产中绑定 JumpServer 资产");
                }
            }
        } catch (Exception e) {
            log.error("[JumpServer] 解析资产异常", e);
            return R.err("JumpServer 连接异常: " + e.getMessage());
        }

        try {
            String tokenUrl = cfg.getBaseUrl().replaceAll("/+$", "") + "/api/v1/authentication/connection-token/";

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("asset", jsAssetId);
            body.put("account", account);
            body.put("protocol", protocol);
            body.put("connect_method", "web_cli");

            String jsonBody = objectMapper.writeValueAsString(body);

            HttpRequest request = buildSignedRequest(tokenUrl, cfg.getAccessKeyId(), cfg.getAccessKeySecret(), "POST", jsonBody);
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                JsonNode respJson = objectMapper.readTree(response.body());
                String tokenId = respJson.has("id") ? respJson.get("id").asText() : null;

                if (tokenId == null) {
                    return R.err("JumpServer 返回数据异常: " + response.body());
                }

                String lunaUrl = cfg.getBaseUrl().replaceAll("/+$", "") + "/luna/?token=" + tokenId;

                Map<String, String> result = new LinkedHashMap<>();
                result.put("url", lunaUrl);
                result.put("tokenId", tokenId);
                result.put("jsAssetId", jsAssetId);
                return R.ok(result);
            } else {
                log.warn("[JumpServer] 创建 ConnectionToken 失败: HTTP {} - {}", response.statusCode(), response.body());
                Map<String, String> errData = new LinkedHashMap<>();
                errData.put("jsAssetId", jsAssetId);
                R errR = R.err("JumpServer API 请求失败 (HTTP " + response.statusCode() + ")");
                errR.setData(errData);
                return errR;
            }
        } catch (Exception e) {
            log.error("[JumpServer] 创建 ConnectionToken 异常 (可能跨网络不通): {}", e.getMessage());
            Map<String, String> errData = new LinkedHashMap<>();
            errData.put("jsAssetId", jsAssetId);
            R errR = R.err("JumpServer 连接超时（后端可能无法访问 JumpServer 网络）");
            errR.setData(errData);
            return errR;
        }
    }

    @Override
    public R listHosts(String search) {
        UserJumpServerConfig cfg = loadCurrentUserConfig(true);
        if (cfg == null || !cfg.isConfigured()) {
            return R.err("当前用户未配置 JumpServer 凭据，请先在个人中心中配置 JumpServer 地址和 Access Key");
        }
        try {
            String path = "/api/v1/assets/hosts/?limit=100";
            if (StringUtils.hasText(search)) {
                path += "&search=" + URLEncoder.encode(search.trim(), StandardCharsets.UTF_8.name());
            }
            String url = cfg.getBaseUrl().replaceAll("/+$", "") + path;
            HttpRequest request = buildSignedRequest(url, cfg.getAccessKeyId(), cfg.getAccessKeySecret(), "GET", null);
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                return R.err("JumpServer 请求失败: " + response.statusCode());
            }
            JsonNode root = objectMapper.readTree(response.body());
            JsonNode results = root.has("results") ? root.get("results") : root;
            if (!results.isArray()) {
                return R.ok(java.util.Collections.emptyList());
            }
            java.util.List<Map<String, String>> list = new java.util.ArrayList<>();
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
        UserJumpServerConfig cfg = loadCurrentUserConfig(true);
        if (cfg == null || !cfg.isConfigured()) {
            return R.err("当前用户未配置 JumpServer 凭据，请先在个人中心中配置 JumpServer 地址和 Access Key");
        }
        AssetHost asset = assetHostMapper.selectById(assetId);
        if (asset == null) {
            return R.err("资产不存在");
        }
        String ip = asset.getPrimaryIp();
        if (!StringUtils.hasText(ip)) {
            return R.err("该资产未配置主 IP");
        }
        try {
            Map<String, String> host = findJumpServerHostByIp(cfg.getBaseUrl(), cfg.getAccessKeyId(), cfg.getAccessKeySecret(), ip);
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

    private UserJumpServerConfig loadCurrentUserConfig(boolean requireConfigured) {
        AuthPrincipal principal = AuthContext.getCurrentPrincipal();
        if (principal == null || principal.getPrincipalId() == null) {
            if (requireConfigured) {
                throw new IllegalStateException("未登录或会话已失效");
            }
            return null;
        }
        Long userId = principal.getPrincipalId();
        IamUser user = iamUserMapper.selectById(userId);
        if (user == null) {
            if (requireConfigured) {
                throw new IllegalStateException("当前用户不存在");
            }
            return null;
        }
        String baseUrl = user.getJumpserverUrl();
        String keyId = user.getJumpserverAccessKeyId();
        String encryptedSecret = user.getJumpserverAccessKeySecret();
        if (!StringUtils.hasText(baseUrl) || !StringUtils.hasText(keyId) || !StringUtils.hasText(encryptedSecret)) {
            if (requireConfigured) {
                return new UserJumpServerConfig(null, null, null, false);
            }
            return new UserJumpServerConfig(baseUrl, null, null, false);
        }
        try {
            String secret = credentialCryptoService.decrypt(encryptedSecret);
            return new UserJumpServerConfig(baseUrl, keyId, secret, true);
        } catch (Exception e) {
            log.error("[JumpServer] 解密用户 JumpServer Secret 失败", e);
            if (requireConfigured) {
                throw new IllegalStateException("JumpServer 凭据已损坏，请重新在个人中心中保存配置");
            }
            return new UserJumpServerConfig(baseUrl, null, null, false);
        }
    }

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

    private HttpRequest buildSignedRequest(String url, String keyId, String keySecret, String method, String body) throws Exception {
        String dateStr = DateTimeFormatter.ofPattern("EEE, dd MMM yyyy HH:mm:ss 'GMT'", Locale.US)
                .withZone(ZoneOffset.UTC)
                .format(Instant.now());

        URI uri = URI.create(url);
        String path = uri.getRawPath();
        if (uri.getRawQuery() != null) path += "?" + uri.getRawQuery();

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
                .timeout(Duration.ofSeconds(5));

        if ("POST".equalsIgnoreCase(method) && body != null) {
            builder.POST(HttpRequest.BodyPublishers.ofString(body))
                    .header("Content-Type", "application/json");
        } else {
            builder.GET();
        }

        return builder.build();
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() > maxLen ? s.substring(0, maxLen) + "..." : s;
    }

    private static class UserJumpServerConfig {
        private final String baseUrl;
        private final String accessKeyId;
        private final String accessKeySecret;
        private final boolean configured;

        UserJumpServerConfig(String baseUrl, String accessKeyId, String accessKeySecret, boolean configured) {
            this.baseUrl = baseUrl;
            this.accessKeyId = accessKeyId;
            this.accessKeySecret = accessKeySecret;
            this.configured = configured;
        }

        public String getBaseUrl() {
            return baseUrl;
        }

        public String getAccessKeyId() {
            return accessKeyId;
        }

        public String getAccessKeySecret() {
            return accessKeySecret;
        }

        public boolean isConfigured() {
            return configured;
        }
    }
}
