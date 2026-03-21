package com.admin.common.utils;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.*;

/**
 * AdsPower Local API 客户端（服务端代理模式）
 * <p>
 * 当 AdsPower 运行在远程服务器上时，由后端代理调用。
 * 当运行在用户本地时，前端直接调用 localhost:50325，不经过此客户端。
 * </p>
 * <p>
 * AdsPower API 文档: https://localapi-doc-en.adspower.com/
 * 默认地址: http://localhost:50325
 * 限速: 2-10 次/秒（取决于 Profile 数量）
 * </p>
 */
@Slf4j
@Component
public class AdsPowerClient {

    @Autowired
    private RestTemplate restTemplate;

    /**
     * 检查 AdsPower 是否可达
     */
    public boolean ping(String apiBase) {
        try {
            String url = normalize(apiBase) + "/status";
            ResponseEntity<String> resp = restTemplate.getForEntity(url, String.class);
            return resp.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            log.debug("AdsPower ping failed for {}: {}", apiBase, e.getMessage());
            return false;
        }
    }

    /**
     * 查询 Profile 列表
     * @param apiBase AdsPower API 地址
     * @param page 页码（从 1 开始）
     * @param pageSize 每页数量
     * @return Profile 列表 或 空列表
     */
    public List<Map<String, Object>> listProfiles(String apiBase, int page, int pageSize) {
        try {
            String url = normalize(apiBase) + "/api/v1/user/list?page=" + page + "&page_size=" + pageSize;
            ResponseEntity<String> resp = restTemplate.getForEntity(url, String.class);
            if (!resp.getStatusCode().is2xxSuccessful() || resp.getBody() == null) return Collections.emptyList();
            JSONObject json = JSON.parseObject(resp.getBody());
            if (json.getIntValue("code") != 0) return Collections.emptyList();
            JSONObject data = json.getJSONObject("data");
            if (data == null) return Collections.emptyList();
            JSONArray list = data.getJSONArray("list");
            if (list == null) return Collections.emptyList();
            List<Map<String, Object>> result = new ArrayList<>();
            for (int i = 0; i < list.size(); i++) {
                result.add(list.getJSONObject(i).getInnerMap());
            }
            return result;
        } catch (Exception e) {
            log.warn("AdsPower listProfiles failed: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 创建新 Profile 并配置代理
     * @param apiBase AdsPower API 地址
     * @param profileName Profile 名称
     * @param proxyConfig 代理配置
     * @return 创建的 Profile ID 或 null
     */
    public String createProfile(String apiBase, String profileName, ProxyConfig proxyConfig) {
        try {
            String url = normalize(apiBase) + "/api/v1/user/create";
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("name", profileName);
            body.put("group_id", "0"); // 未分组
            body.put("user_proxy_config", buildProxyConfigMap(proxyConfig));
            body.put("fingerprint_config", Map.of("automatic_timezone", "1", "language", List.of("en-US", "en")));

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<String> entity = new HttpEntity<>(JSON.toJSONString(body), headers);
            ResponseEntity<String> resp = restTemplate.postForEntity(url, entity, String.class);

            if (resp.getBody() == null) return null;
            JSONObject json = JSON.parseObject(resp.getBody());
            if (json.getIntValue("code") != 0) {
                log.warn("AdsPower createProfile failed: {}", json.getString("msg"));
                return null;
            }
            return json.getJSONObject("data").getString("id");
        } catch (Exception e) {
            log.error("AdsPower createProfile failed: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 更新已有 Profile 的代理配置
     * @param apiBase AdsPower API 地址
     * @param profileId Profile ID
     * @param proxyConfig 新的代理配置
     * @return 是否成功
     */
    public boolean updateProfileProxy(String apiBase, String profileId, ProxyConfig proxyConfig) {
        try {
            String url = normalize(apiBase) + "/api/v1/user/update";
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("user_id", profileId);
            body.put("user_proxy_config", buildProxyConfigMap(proxyConfig));

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<String> entity = new HttpEntity<>(JSON.toJSONString(body), headers);
            ResponseEntity<String> resp = restTemplate.postForEntity(url, entity, String.class);

            if (resp.getBody() == null) return false;
            JSONObject json = JSON.parseObject(resp.getBody());
            return json.getIntValue("code") == 0;
        } catch (Exception e) {
            log.error("AdsPower updateProfileProxy failed: {}", e.getMessage());
            return false;
        }
    }

    private Map<String, Object> buildProxyConfigMap(ProxyConfig cfg) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("proxy_soft", "other");
        map.put("proxy_type", cfg.getProxyType());
        map.put("proxy_host", cfg.getHost());
        map.put("proxy_port", String.valueOf(cfg.getPort()));
        if (cfg.getUsername() != null) map.put("proxy_user", cfg.getUsername());
        if (cfg.getPassword() != null) map.put("proxy_password", cfg.getPassword());
        return map;
    }

    private String normalize(String apiBase) {
        if (apiBase == null) return "http://localhost:50325";
        return apiBase.replaceAll("/+$", "");
    }

    @Data
    public static class ProxyConfig {
        /** socks5 / http / https */
        private String proxyType = "socks5";
        /** 代理服务器地址 */
        private String host;
        /** 代理端口 */
        private int port;
        /** 认证用户名（可选） */
        private String username;
        /** 认证密码（可选） */
        private String password;
    }
}
