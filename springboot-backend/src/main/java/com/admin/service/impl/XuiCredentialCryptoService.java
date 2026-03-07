package com.admin.service.impl;

import com.admin.common.utils.AESCrypto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

@Slf4j
@Component
public class XuiCredentialCryptoService {

    @Value("${jwt-secret}")
    private String jwtSecret;

    private AESCrypto crypto;

    @PostConstruct
    public void init() {
        this.crypto = AESCrypto.create(jwtSecret + ":xui-instance");
        if (this.crypto == null) {
            throw new IllegalStateException("X-UI 凭据加密器初始化失败");
        }
    }

    public String encrypt(String plainText) {
        if (plainText == null || plainText.trim().isEmpty()) {
            throw new IllegalArgumentException("待加密凭据不能为空");
        }
        return crypto.encrypt(plainText.trim());
    }

    public String decrypt(String cipherText) {
        if (cipherText == null || cipherText.trim().isEmpty()) {
            throw new IllegalArgumentException("加密凭据不能为空");
        }
        return crypto.decryptString(cipherText);
    }
}
