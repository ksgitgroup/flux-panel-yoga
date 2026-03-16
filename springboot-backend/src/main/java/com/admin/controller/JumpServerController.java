package com.admin.controller;

import com.admin.common.annotation.RequireRole;
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
    @RequireRole
    @PostMapping("/status")
    public R getStatus() {
        return jumpServerService.getStatus();
    }

    /** 获取当前登录用户的 JumpServer 配置（个人中心使用） */
    @RequireRole
    @PostMapping("/me/config")
    public R getMyConfig() {
        return jumpServerService.getCurrentUserConfig();
    }

    /** 更新当前登录用户的 JumpServer 配置（个人中心使用） */
    @RequireRole
    @PostMapping("/me/update-config")
    public R updateMyConfig(@RequestBody Map<String, Object> params) {
        String url = params.get("url") != null ? params.get("url").toString() : null;
        String accessKeyId = params.get("accessKeyId") != null ? params.get("accessKeyId").toString() : null;
        String accessKeySecret = params.get("accessKeySecret") != null ? params.get("accessKeySecret").toString() : null;
        return jumpServerService.updateCurrentUserConfig(url, accessKeyId, accessKeySecret);
    }

    /** 创建 ConnectionToken 并返回跳转 URL */
    @RequireRole
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

    /** 拉取 JumpServer 主机列表（编辑资产绑定用），search 可选 */
    @RequireRole
    @PostMapping("/hosts")
    public R listHosts(@RequestBody(required = false) Map<String, Object> params) {
        String search = params != null && params.get("search") != null ? params.get("search").toString() : null;
        return jumpServerService.listHosts(search);
    }

    /** 按当前资产主 IP 在 JumpServer 中匹配主机；save=true 时写回资产的 jumpserver_asset_id */
    @RequireRole
    @PostMapping("/match-by-ip")
    public R matchByIp(@RequestBody Map<String, Object> params) {
        Long assetId = params.get("assetId") != null ? Long.valueOf(params.get("assetId").toString()) : null;
        boolean save = params.get("save") != null && Boolean.parseBoolean(params.get("save").toString());
        if (assetId == null) {
            return R.err("assetId 不能为空");
        }
        return jumpServerService.matchByIp(assetId, save);
    }
}
