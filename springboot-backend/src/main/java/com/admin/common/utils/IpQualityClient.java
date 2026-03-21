package com.admin.common.utils;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

/**
 * IP 质量检测客户端
 * 使用 ip-api.com 免费 API（无需 API Key，限 45 次/分钟）
 * 返回：国家、城市、ISP、ASN、是否代理、是否数据中心等
 */
@Slf4j
@Component
public class IpQualityClient {

    @Autowired
    private RestTemplate restTemplate;

    /**
     * 检测单个 IP 的质量信息
     * @param ip IPv4 地址
     * @return IpQualityResult 或 null（失败时）
     */
    public IpQualityResult check(String ip) {
        try {
            // ip-api.com 免费端点，fields 参数控制返回字段
            String url = "http://ip-api.com/json/" + ip + "?fields=status,message,country,countryCode,regionName,city,isp,org,as,asname,hosting,proxy,mobile,query";
            String body = restTemplate.getForObject(url, String.class);
            if (body == null) return null;
            JSONObject json = JSON.parseObject(body);
            if (!"success".equals(json.getString("status"))) {
                log.debug("ip-api.com check failed for {}: {}", ip, json.getString("message"));
                return null;
            }
            IpQualityResult result = new IpQualityResult();
            result.setIp(json.getString("query"));
            result.setCountry(json.getString("country"));
            result.setCountryCode(json.getString("countryCode"));
            result.setRegion(json.getString("regionName"));
            result.setCity(json.getString("city"));
            result.setIsp(json.getString("isp"));
            result.setOrg(json.getString("org"));
            result.setAsNumber(json.getString("as"));
            result.setAsName(json.getString("asname"));
            result.setHosting(json.getBooleanValue("hosting"));
            result.setProxy(json.getBooleanValue("proxy"));
            result.setMobile(json.getBooleanValue("mobile"));
            // 风险评分：hosting=数据中心(低风险)，proxy=代理(高风险)，mobile=移动(中性)
            int riskScore = 0;
            if (result.isProxy()) riskScore += 70;
            if (result.isHosting()) riskScore += 10;
            if (result.isMobile()) riskScore += 5;
            result.setRiskScore(riskScore);
            result.setRiskLevel(riskScore >= 50 ? "high" : riskScore >= 20 ? "medium" : "low");
            return result;
        } catch (Exception e) {
            log.warn("IP quality check failed for {}: {}", ip, e.getMessage());
            return null;
        }
    }

    @Data
    public static class IpQualityResult {
        private String ip;
        private String country;
        private String countryCode;
        private String region;
        private String city;
        private String isp;
        private String org;
        private String asNumber;
        private String asName;
        private boolean hosting;  // 数据中心 IP
        private boolean proxy;    // 代理 IP
        private boolean mobile;   // 移动网络 IP
        private int riskScore;    // 0-100
        private String riskLevel; // low / medium / high
    }
}
