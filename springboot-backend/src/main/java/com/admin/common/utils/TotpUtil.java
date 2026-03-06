package com.admin.common.utils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;

/**
 * 轻量级 TOTP 工具，避免引入额外依赖。
 */
public final class TotpUtil {

    private static final String BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final int SECRET_BYTES = 20;
    private static final int DIGITS = 6;
    private static final int PERIOD_SECONDS = 30;

    private TotpUtil() {
    }

    public static String generateSecret() {
        byte[] random = new byte[SECRET_BYTES];
        new SecureRandom().nextBytes(random);
        return encodeBase32(random);
    }

    public static boolean verifyCode(String secret, String code) {
        if (secret == null || secret.trim().isEmpty() || code == null || !code.matches("^\\d{6}$")) {
            return false;
        }

        long currentWindow = System.currentTimeMillis() / 1000 / PERIOD_SECONDS;
        for (long offset = -1; offset <= 1; offset++) {
            if (generateCode(secret, currentWindow + offset).equals(code)) {
                return true;
            }
        }
        return false;
    }

    public static String buildOtpAuthUri(String issuer, String accountName, String secret) {
        String normalizedIssuer = safe(issuer, "flux-panel");
        String normalizedAccountName = safe(accountName, "user");
        String label = urlEncode(normalizedIssuer + ":" + normalizedAccountName);
        return "otpauth://totp/" + label
                + "?secret=" + secret
                + "&issuer=" + urlEncode(normalizedIssuer)
                + "&algorithm=SHA1&digits=" + DIGITS
                + "&period=" + PERIOD_SECONDS;
    }

    private static String generateCode(String base32Secret, long counter) {
        try {
            byte[] key = decodeBase32(base32Secret);
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(key, "HmacSHA1"));
            byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(counter).array());
            int offset = hash[hash.length - 1] & 0x0F;
            int binary = ((hash[offset] & 0x7F) << 24)
                    | ((hash[offset + 1] & 0xFF) << 16)
                    | ((hash[offset + 2] & 0xFF) << 8)
                    | (hash[offset + 3] & 0xFF);
            int otp = binary % (int) Math.pow(10, DIGITS);
            return String.format("%0" + DIGITS + "d", otp);
        } catch (Exception e) {
            throw new RuntimeException("生成 TOTP 验证码失败", e);
        }
    }

    private static String encodeBase32(byte[] data) {
        StringBuilder result = new StringBuilder();
        int current = 0;
        int bits = 0;
        for (byte value : data) {
            current = (current << 8) | (value & 0xFF);
            bits += 8;
            while (bits >= 5) {
                result.append(BASE32_ALPHABET.charAt((current >> (bits - 5)) & 0x1F));
                bits -= 5;
            }
        }
        if (bits > 0) {
            result.append(BASE32_ALPHABET.charAt((current << (5 - bits)) & 0x1F));
        }
        return result.toString();
    }

    private static byte[] decodeBase32(String encoded) {
        String normalized = encoded.replace("=", "").replace(" ", "").toUpperCase();
        List<Byte> bytes = new ArrayList<>();
        int current = 0;
        int bits = 0;
        for (char c : normalized.toCharArray()) {
            int value = BASE32_ALPHABET.indexOf(c);
            if (value < 0) {
                continue;
            }
            current = (current << 5) | value;
            bits += 5;
            if (bits >= 8) {
                bytes.add((byte) ((current >> (bits - 8)) & 0xFF));
                bits -= 8;
            }
        }
        byte[] result = new byte[bytes.size()];
        for (int i = 0; i < bytes.size(); i++) {
            result[i] = bytes.get(i);
        }
        return result;
    }

    private static String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String safe(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }
}
