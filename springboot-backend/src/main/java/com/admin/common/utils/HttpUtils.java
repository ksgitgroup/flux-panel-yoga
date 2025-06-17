package com.admin.common.utils;

import com.admin.common.dto.GostDto;
import com.admin.common.task.SaveConfigAsync;
import com.admin.config.RestTemplateConfig;
import com.alibaba.fastjson.JSONObject;
import lombok.SneakyThrows;
import org.apache.http.HttpResponse;
import org.apache.http.NameValuePair;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.entity.UrlEncodedFormEntity;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.client.utils.URIBuilder;
import org.apache.http.entity.ContentType;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.message.BasicNameValuePair;
import org.apache.http.util.EntityUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.http.*;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResponseErrorHandler;
import org.springframework.web.client.RestTemplate;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * HTTP请求工具类
 * 支持GET和POST请求，支持表单和JSON格式的请求体
 */
@Component
public class HttpUtils implements ApplicationContextAware {

    private static final Logger logger = LoggerFactory.getLogger(HttpUtils.class);

    // 10秒超时配置
    private static final int TIMEOUT_SECONDS = 10;
    private static final int TIMEOUT_MILLISECONDS = TIMEOUT_SECONDS * 1000;

    private static ApplicationContext applicationContext;

    @Override
    public void setApplicationContext(ApplicationContext context) {
        HttpUtils.applicationContext = context;
    }

    /**
     * 获取SaveConfigAsync Bean
     */
    private static SaveConfigAsync getSaveConfigAsync() {
        try {
            return applicationContext.getBean(SaveConfigAsync.class);
        } catch (Exception e) {
            logger.warn("无法获取SaveConfigAsync Bean: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 从URL中提取IP和端口
     */
    private static String extractIpAndPortFromUrl(String url) {
        try {
            URI uri = URI.create(url);
            String host = uri.getHost();
            int port = uri.getPort();
            if (port == -1) {
                port = uri.getScheme().equals("https") ? 443 : 80;
            }
            return host + ":" + port;
        } catch (Exception e) {
            logger.warn("无法从URL提取IP和端口: {}", url);
            return "";
        }
    }

    /**
     * 异步保存配置
     */
    private static void asyncSaveConfig(String url, String secret) {
        try {
            SaveConfigAsync saveConfigAsync = getSaveConfigAsync();
            if (saveConfigAsync != null) {
                String ipAndPort = extractIpAndPortFromUrl(url);
                saveConfigAsync.run(ipAndPort, secret);
            }
        } catch (Exception e) {
            logger.warn("异步保存配置失败: {}", e.getMessage());
        }
    }

    /**
     * 自定义错误处理器，不抛出异常但记录错误信息
     */
    private static class NoOpResponseErrorHandler implements ResponseErrorHandler {
        @Override
        public boolean hasError(ClientHttpResponse response) throws IOException {
            HttpStatus statusCode = response.getStatusCode();
            return statusCode.series() == HttpStatus.Series.CLIENT_ERROR || 
                   statusCode.series() == HttpStatus.Series.SERVER_ERROR;
        }

        @Override
        public void handleError(ClientHttpResponse response) throws IOException {
            HttpStatus statusCode = response.getStatusCode();
            String statusText = response.getStatusText();
            String responseBody = "";
            
            try {
                // 使用Spring的StreamUtils来读取响应体
                responseBody = new String(
                    StreamUtils.copyToByteArray(response.getBody()), 
                    StandardCharsets.UTF_8
                );
            } catch (Exception e) {
                responseBody = "无法读取响应体: " + e.getMessage();
            }
            
            logger.error("HTTP请求错误 - 状态码: {} {}, 响应体: {}", 
                        statusCode.value(), statusText, responseBody);
        }
    }

    /**
     * 创建带超时配置的RestTemplate
     */
    private static RestTemplate createRestTemplateWithTimeout() {
        // 创建基础的RequestFactory
        org.springframework.http.client.SimpleClientHttpRequestFactory factory =
                new org.springframework.http.client.SimpleClientHttpRequestFactory();

        // 设置连接超时和读取超时
        factory.setConnectTimeout(TIMEOUT_MILLISECONDS);
        factory.setReadTimeout(TIMEOUT_MILLISECONDS);

        // 创建RestTemplate
        RestTemplate restTemplate = new RestTemplate(factory);
        restTemplate.setErrorHandler(new NoOpResponseErrorHandler());

        return restTemplate;
    }

    @SneakyThrows
    public static GostDto post(String url, Object requestBody, String secret) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(Collections.singletonList(MediaType.APPLICATION_JSON));
        String auth = secret + ":" + secret;
        String encodedAuth = Base64.getEncoder().encodeToString(auth.getBytes(StandardCharsets.UTF_8));
        headers.set("Authorization", "Basic " + encodedAuth);
        HttpEntity<Object> entity = new HttpEntity<>(requestBody, headers);
        RestTemplate restTemplate = createRestTemplateWithTimeout();
        try {
            ResponseEntity<GostDto> response = restTemplate.postForEntity(url, entity, GostDto.class);
            GostDto body = response.getBody();
            if (body.getMsg() != null && body.getMsg().contains("exists")) {
                body.setMsg("OK");
            }

            if (!url.contains("/api/config?format=json")) {
                asyncSaveConfig(url, secret);
            }

            return body;
        } catch (Exception e) {
            e.printStackTrace();
            GostDto gostDto = new GostDto();
            gostDto.setCode(500);
            gostDto.setMsg("请求失败");
            return gostDto;
        }
    }

    @SneakyThrows
    public static GostDto put(String url, Object requestBody, String secret) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(Collections.singletonList(MediaType.APPLICATION_JSON));
        String auth = secret + ":" + secret;
        String encodedAuth = Base64.getEncoder().encodeToString(auth.getBytes(StandardCharsets.UTF_8));
        headers.set("Authorization", "Basic " + encodedAuth);
        HttpEntity<Object> entity = new HttpEntity<>(requestBody, headers);
        RestTemplate restTemplate = createRestTemplateWithTimeout();
        try {
            ResponseEntity<GostDto> response = restTemplate.exchange(
                    url,
                    HttpMethod.PUT,
                    entity,
                    GostDto.class
            );
            GostDto body = response.getBody();
            asyncSaveConfig(url, secret);
            return body;
        } catch (Exception e) {
            GostDto gostDto = new GostDto();
            gostDto.setCode(500);
            gostDto.setMsg("请求失败");
            return gostDto;
        }
    }

    @SneakyThrows
    public static GostDto delete(String url, String secret) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(Collections.singletonList(MediaType.APPLICATION_JSON));

        // Basic Auth
        String auth = secret + ":" + secret;
        String encodedAuth = Base64.getEncoder().encodeToString(auth.getBytes(StandardCharsets.UTF_8));
        headers.set("Authorization", "Basic " + encodedAuth);

        HttpEntity<Void> entity = new HttpEntity<>(headers);
        RestTemplate restTemplate = createRestTemplateWithTimeout();

        try {
            ResponseEntity<GostDto> response = restTemplate.exchange(
                    url,
                    HttpMethod.DELETE,
                    entity,
                    GostDto.class
            );
            GostDto body = response.getBody();
            if (body != null && body.getMsg() != null && body.getMsg().contains("not found")) {
                body.setMsg("OK");
            }
            asyncSaveConfig(url, secret);
            return body;
        } catch (Exception e) {
            e.printStackTrace();
            GostDto gostDto = new GostDto();
            gostDto.setCode(500);
            gostDto.setMsg("请求失败");
            return gostDto;
        }
    }

    @SneakyThrows
    public static GostDto delete(String url, JSONObject data, String secret) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(Collections.singletonList(MediaType.APPLICATION_JSON));

        // Basic Auth
        String auth = secret + ":" + secret;
        String encodedAuth = Base64.getEncoder().encodeToString(auth.getBytes(StandardCharsets.UTF_8));
        headers.set("Authorization", "Basic " + encodedAuth);

        HttpEntity<JSONObject> entity = new HttpEntity<>(data, headers);
        RestTemplate restTemplate = createRestTemplateWithTimeout();

        try {
            ResponseEntity<GostDto> response = restTemplate.exchange(
                    url,
                    HttpMethod.DELETE,
                    entity,
                    GostDto.class
            );
            GostDto body = response.getBody();
            if (body != null && body.getMsg() != null && body.getMsg().contains("not found")) {
                body.setMsg("OK");
            }
            asyncSaveConfig(url, secret);
            return body;
        } catch (Exception e) {
            e.printStackTrace();
            GostDto gostDto = new GostDto();
            gostDto.setCode(500);
            gostDto.setMsg("请求失败");
            return gostDto;
        }
    }
} 