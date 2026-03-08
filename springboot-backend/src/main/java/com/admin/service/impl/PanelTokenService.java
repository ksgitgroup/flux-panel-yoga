package com.admin.service.impl;

import com.admin.common.auth.AuthPrincipal;
import com.alibaba.fastjson2.JSON;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class PanelTokenService {

    public static final String TOKEN_TYPE_IAM = "iam";
    private static final String TOKEN_TYPE_STATE = "iam_state";
    private static final String ALGORITHM = "HmacSHA256";
    private static final long STATE_EXPIRE_MILLIS = 10 * 60 * 1000L;

    @Value("${jwt-secret}")
    private String secretKey;

    private static String SECRET_KEY;

    @PostConstruct
    public void init() {
        SECRET_KEY = this.secretKey;
    }

    public String generateIamToken(AuthPrincipal principal, Long expiresAtMillis) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sub", principal.getPrincipalId());
        payload.put("sid", principal.getSessionId());
        payload.put("name", principal.getDisplayName());
        payload.put("email", principal.getEmail());
        payload.put("role_id", principal.getLegacyRoleId() == null ? 1 : principal.getLegacyRoleId());
        payload.put("admin", principal.isAdmin());
        payload.put("principal_type", principal.getPrincipalType());
        payload.put("auth_source", principal.getAuthSource());
        payload.put("permissions", principal.safePermissions());
        payload.put("role_codes", principal.safeRoleCodes());
        payload.put("token_type", TOKEN_TYPE_IAM);
        payload.put("iat", System.currentTimeMillis() / 1000);
        payload.put("exp", expiresAtMillis / 1000);
        return signPayload(payload);
    }

    public String generateStateToken(String channel) {
        long now = System.currentTimeMillis();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("token_type", TOKEN_TYPE_STATE);
        payload.put("channel", channel);
        payload.put("iat", now / 1000);
        payload.put("exp", (now + STATE_EXPIRE_MILLIS) / 1000);
        return signPayload(payload);
    }

    public Map<String, Object> validateIamToken(String token) {
        Map<String, Object> payload = validateSignedToken(token);
        if (payload == null || !TOKEN_TYPE_IAM.equals(String.valueOf(payload.get("token_type")))) {
            return null;
        }
        return payload;
    }

    public Map<String, Object> validateStateToken(String token) {
        Map<String, Object> payload = validateSignedToken(token);
        if (payload == null || !TOKEN_TYPE_STATE.equals(String.valueOf(payload.get("token_type")))) {
            return null;
        }
        return payload;
    }

    public Map<String, Object> peekPayload(String token) {
        try {
            if (token == null || token.isBlank()) {
                return null;
            }
            String[] parts = token.split("\\.");
            if (parts.length != 3) {
                return null;
            }
            String decodedPayload = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
            return JSON.parseObject(decodedPayload, Map.class);
        } catch (Exception ignored) {
            return null;
        }
    }

    private Map<String, Object> validateSignedToken(String token) {
        try {
            if (token == null || token.isBlank()) {
                return null;
            }
            String[] parts = token.split("\\.");
            if (parts.length != 3) {
                return null;
            }

            String expectedSignature = calculateSignature(parts[0], parts[1]);
            if (!expectedSignature.equals(parts[2])) {
                return null;
            }

            String decodedPayload = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
            Map<String, Object> payload = JSON.parseObject(decodedPayload, Map.class);
            long exp = Long.parseLong(String.valueOf(payload.get("exp")));
            long now = System.currentTimeMillis() / 1000;
            return exp > now ? payload : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private String signPayload(Map<String, Object> payload) {
        try {
            Map<String, Object> header = new HashMap<>();
            header.put("alg", ALGORITHM);
            header.put("typ", "JWT");
            String encodedHeader = Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(JSON.toJSONString(header).getBytes(StandardCharsets.UTF_8));
            String encodedPayload = Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(JSON.toJSONString(payload).getBytes(StandardCharsets.UTF_8));
            String signature = calculateSignature(encodedHeader, encodedPayload);
            return encodedHeader + "." + encodedPayload + "." + signature;
        } catch (Exception e) {
            throw new IllegalStateException("生成 IAM Token 失败", e);
        }
    }

    private String calculateSignature(String encodedHeader, String encodedPayload) throws Exception {
        String content = encodedHeader + "." + encodedPayload;
        Mac hmac = Mac.getInstance(ALGORITHM);
        SecretKeySpec secretKeySpec = new SecretKeySpec(SECRET_KEY.getBytes(StandardCharsets.UTF_8), ALGORITHM);
        hmac.init(secretKeySpec);
        byte[] signatureBytes = hmac.doFinal(content.getBytes(StandardCharsets.UTF_8));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(signatureBytes);
    }
}
