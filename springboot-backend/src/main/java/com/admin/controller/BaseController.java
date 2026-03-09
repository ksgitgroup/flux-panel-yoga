package com.admin.controller;

import com.admin.service.*;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.Map;

public class BaseController {

    /**
     * 安全地从参数 Map 中提取 Long 值，避免 NPE
     */
    protected Long requireLong(Map<String, Object> params, String key) {
        Object val = params == null ? null : params.get(key);
        if (val == null) throw new IllegalArgumentException("参数 " + key + " 不能为空");
        return Long.valueOf(val.toString());
    }

    /**
     * 安全地从参数 Map 中提取 Integer 值
     */
    protected Integer requireInt(Map<String, Object> params, String key) {
        Object val = params == null ? null : params.get(key);
        if (val == null) throw new IllegalArgumentException("参数 " + key + " 不能为空");
        return Integer.valueOf(val.toString());
    }

    /**
     * 安全地从参数 Map 中提取 String 值
     */
    protected String requireString(Map<String, Object> params, String key) {
        Object val = params == null ? null : params.get(key);
        if (val == null) throw new IllegalArgumentException("参数 " + key + " 不能为空");
        return val.toString();
    }

    @Autowired
    UserService userService;

    @Autowired
    NodeService nodeService;

    @Autowired
    UserTunnelService userTunnelService;

    @Autowired
    TunnelService tunnelService;

    @Autowired
    ForwardService forwardService;

    @Autowired
    ViteConfigService viteConfigService;

}
