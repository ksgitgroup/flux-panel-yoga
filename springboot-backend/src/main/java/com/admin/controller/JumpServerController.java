package com.admin.controller;

import com.admin.common.lang.R;
import com.admin.service.JumpServerService;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/jumpserver")
public class JumpServerController {

    @Resource
    private JumpServerService jumpServerService;

    /** 获取 JumpServer 集成状态 */
    @PostMapping("/status")
    public R getStatus() {
        return jumpServerService.getStatus();
    }

    /** 创建 ConnectionToken 并返回跳转 URL */
    @PostMapping("/connect")
    public R connect(@RequestBody Map<String, Object> params) {
        Long assetId = params.get("assetId") != null ? Long.valueOf(params.get("assetId").toString()) : null;
        String protocol = params.get("protocol") != null ? params.get("protocol").toString() : "ssh";
        String account = params.get("account") != null ? params.get("account").toString() : "root";

        if (assetId == null) {
            return R.err("assetId 不能为空");
        }

        return jumpServerService.createConnectionToken(assetId, protocol, account);
    }
}
