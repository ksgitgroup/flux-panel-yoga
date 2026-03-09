package com.admin.service;

import java.util.Map;

public interface RuntimeConfigService {

    String getValue(String key, String defaultValue);

    boolean isEnabled(String key, boolean defaultValue);

    boolean isManagedByEnvironment(String key);

    Map<String, String> applyEffectiveValues(Map<String, String> configMap);

    void ensureWritable(String key);

    boolean isSecretKey(String key);
}
