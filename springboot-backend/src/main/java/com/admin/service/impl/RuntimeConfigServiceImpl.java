package com.admin.service.impl;

import com.admin.entity.ViteConfig;
import com.admin.mapper.ViteConfigMapper;
import com.admin.service.RuntimeConfigService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

@Service
public class RuntimeConfigServiceImpl implements RuntimeConfigService {

    private static final String MASKED_SECRET_VALUE = "******";

    private static final Map<String, String> ENV_MAPPINGS;
    private static final Set<String> SECRET_KEYS;

    static {
        Map<String, String> mappings = new LinkedHashMap<>();
        mappings.put("iam_auth_mode", "IAM_AUTH_MODE");
        mappings.put("iam_local_admin_enabled", "IAM_LOCAL_ADMIN_ENABLED");
        mappings.put("dingtalk_oauth_enabled", "DINGTALK_OAUTH_ENABLED");
        mappings.put("dingtalk_client_id", "DINGTALK_CLIENT_ID");
        mappings.put("dingtalk_client_secret", "DINGTALK_CLIENT_SECRET");
        mappings.put("dingtalk_corp_id", "DINGTALK_CORP_ID");
        mappings.put("dingtalk_redirect_uri", "DINGTALK_REDIRECT_URI");
        mappings.put("dingtalk_allowed_org_ids", "DINGTALK_ALLOWED_ORG_IDS");
        mappings.put("dingtalk_required_email_domain", "DINGTALK_REQUIRED_EMAIL_DOMAIN");
        ENV_MAPPINGS = Collections.unmodifiableMap(mappings);

        Set<String> secretKeys = new LinkedHashSet<>();
        secretKeys.add("dingtalk_client_secret");
        secretKeys.add("jumpserver_access_key_secret");
        SECRET_KEYS = Collections.unmodifiableSet(secretKeys);
    }

    private final Environment environment;
    private final ViteConfigMapper viteConfigMapper;

    public RuntimeConfigServiceImpl(Environment environment, ViteConfigMapper viteConfigMapper) {
        this.environment = environment;
        this.viteConfigMapper = viteConfigMapper;
    }

    @Override
    public String getValue(String key, String defaultValue) {
        String envOverride = getEnvironmentOverride(key);
        if (envOverride != null) {
            return envOverride;
        }
        String databaseValue = getDatabaseValue(key);
        return StringUtils.hasText(databaseValue) ? databaseValue : defaultValue;
    }

    @Override
    public boolean isEnabled(String key, boolean defaultValue) {
        String value = getValue(key, String.valueOf(defaultValue));
        return "1".equals(value) || "true".equalsIgnoreCase(value) || "yes".equalsIgnoreCase(value);
    }

    @Override
    public boolean isManagedByEnvironment(String key) {
        return getEnvironmentOverride(key) != null;
    }

    @Override
    public Map<String, String> applyEffectiveValues(Map<String, String> configMap) {
        Map<String, String> effectiveMap = new LinkedHashMap<>(configMap);

        for (Map.Entry<String, String> entry : ENV_MAPPINGS.entrySet()) {
            String key = entry.getKey();
            String envOverride = getEnvironmentOverride(key);

            if (envOverride != null) {
                effectiveMap.put(key, SECRET_KEYS.contains(key) ? MASKED_SECRET_VALUE : envOverride);
                continue;
            }

            if (SECRET_KEYS.contains(key) && StringUtils.hasText(effectiveMap.get(key))) {
                effectiveMap.put(key, MASKED_SECRET_VALUE);
            }
        }

        // Mask secret keys that are not in ENV_MAPPINGS but still sensitive
        for (String secretKey : SECRET_KEYS) {
            if (!ENV_MAPPINGS.containsKey(secretKey) && StringUtils.hasText(effectiveMap.get(secretKey))) {
                effectiveMap.put(secretKey, MASKED_SECRET_VALUE);
            }
        }

        return effectiveMap;
    }

    @Override
    public void ensureWritable(String key) {
        String envName = ENV_MAPPINGS.get(key);
        if (StringUtils.hasText(envName) && isManagedByEnvironment(key)) {
            throw new IllegalStateException("配置 " + key + " 由环境变量 " + envName + " 接管，请修改部署环境变量");
        }
    }

    @Override
    public boolean isSecretKey(String key) {
        return SECRET_KEYS.contains(key);
    }

    private String getEnvironmentOverride(String key) {
        String envName = ENV_MAPPINGS.get(key);
        if (!StringUtils.hasText(envName)) {
            return null;
        }
        String value = environment.getProperty(envName);
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private String getDatabaseValue(String key) {
        ViteConfig config = viteConfigMapper.selectOne(new QueryWrapper<ViteConfig>()
                .eq("name", key)
                .last("limit 1"));
        if (config == null || !StringUtils.hasText(config.getValue())) {
            return null;
        }
        return config.getValue().trim();
    }
}
