package com.admin.common.utils;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * GOST v3 REST API 客户端
 * <p>
 * 通过 GOST 节点的 Web API（apiUrl 字段）直接查询/管理配置，
 * 作为 WebSocket 通道的补充：WebSocket 用于实时下发，REST 用于状态查询和配置同步。
 * </p>
 * <p>
 * GOST v3 API 端点参考:
 * - GET  /api/config          → 完整配置
 * - GET  /api/config/services → 所有 service
 * - POST /api/config/services → 创建 service
 * - PUT  /api/config/services/{name} → 更新 service
 * - DELETE /api/config/services/{name} → 删除 service
 * - GET  /api/config/chains   → 所有 chain
 * </p>
 */
@Slf4j
@Component
public class GostApiClient {

    @Autowired
    private RestTemplate restTemplate;

    private static final int PING_TIMEOUT_MS = 5000;

    /**
     * 标准化 apiUrl：去掉末尾斜杠
     */
    private String normalizeUrl(String apiUrl) {
        if (apiUrl == null) return null;
        return apiUrl.replaceAll("/+$", "");
    }

    /**
     * 检查 GOST 节点 API 是否可达
     *
     * @param apiUrl GOST Web API 地址 (如 http://IP:18080)
     * @return true = 可达
     */
    public boolean ping(String apiUrl) {
        try {
            String url = normalizeUrl(apiUrl) + "/api/config";
            ResponseEntity<String> resp = restTemplate.getForEntity(url, String.class);
            return resp.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            log.debug("GOST ping failed for {}: {}", apiUrl, e.getMessage());
            return false;
        }
    }

    /**
     * 获取 GOST 节点状态摘要
     *
     * @return {reachable, serviceCount, chainCount} 或 {reachable: false}
     */
    public Map<String, Object> getStatus(String apiUrl) {
        Map<String, Object> result = new HashMap<>();
        try {
            String url = normalizeUrl(apiUrl) + "/api/config";
            ResponseEntity<String> resp = restTemplate.getForEntity(url, String.class);
            if (!resp.getStatusCode().is2xxSuccessful() || resp.getBody() == null) {
                result.put("reachable", false);
                return result;
            }
            JSONObject config = JSON.parseObject(resp.getBody());
            JSONArray services = config.getJSONArray("services");
            JSONArray chains = config.getJSONArray("chains");
            result.put("reachable", true);
            result.put("serviceCount", services != null ? services.size() : 0);
            result.put("chainCount", chains != null ? chains.size() : 0);
            return result;
        } catch (Exception e) {
            log.debug("GOST getStatus failed for {}: {}", apiUrl, e.getMessage());
            result.put("reachable", false);
            result.put("error", e.getMessage());
            return result;
        }
    }

    /**
     * 获取所有 services
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> listServices(String apiUrl) {
        try {
            String url = normalizeUrl(apiUrl) + "/api/config/services";
            ResponseEntity<String> resp = restTemplate.getForEntity(url, String.class);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                return JSON.parseObject(resp.getBody(), List.class);
            }
        } catch (Exception e) {
            log.warn("GOST listServices failed for {}: {}", apiUrl, e.getMessage());
        }
        return Collections.emptyList();
    }

    /**
     * 获取所有 chains
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> listChains(String apiUrl) {
        try {
            String url = normalizeUrl(apiUrl) + "/api/config/chains";
            ResponseEntity<String> resp = restTemplate.getForEntity(url, String.class);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                return JSON.parseObject(resp.getBody(), List.class);
            }
        } catch (Exception e) {
            log.warn("GOST listChains failed for {}: {}", apiUrl, e.getMessage());
        }
        return Collections.emptyList();
    }

    /**
     * 通过 REST API 创建 service
     *
     * @param apiUrl        GOST API 地址
     * @param serviceConfig service JSON 配置
     * @return true = 成功
     */
    public boolean createService(String apiUrl, Map<String, Object> serviceConfig) {
        try {
            String url = normalizeUrl(apiUrl) + "/api/config/services";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<String> entity = new HttpEntity<>(JSON.toJSONString(serviceConfig), headers);
            ResponseEntity<String> resp = restTemplate.postForEntity(url, entity, String.class);
            return resp.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            log.error("GOST createService failed for {}: {}", apiUrl, e.getMessage());
            return false;
        }
    }

    /**
     * 通过 REST API 删除 service
     *
     * @param apiUrl      GOST API 地址
     * @param serviceName service 名称
     * @return true = 成功
     */
    public boolean deleteService(String apiUrl, String serviceName) {
        try {
            String url = normalizeUrl(apiUrl) + "/api/config/services/" + serviceName;
            restTemplate.delete(url);
            return true;
        } catch (Exception e) {
            log.error("GOST deleteService failed for {}/{}: {}", apiUrl, serviceName, e.getMessage());
            return false;
        }
    }
}
