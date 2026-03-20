package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.lang.R;
import com.admin.entity.ShopAccount;
import com.admin.service.ShopAccountService;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.Map;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/shop-account")
public class ShopAccountController extends BaseController {

    @Resource
    private ShopAccountService shopAccountService;

    @RequireRole
    @PostMapping("/list")
    public R list(@RequestBody(required = false) Map<String, Object> body) {
        int page = 1, size = 50;
        String keyword = null, platform = null, accountStatus = null, browserType = null;
        if (body != null) {
            if (body.get("page") != null) page = ((Number) body.get("page")).intValue();
            if (body.get("size") != null) size = ((Number) body.get("size")).intValue();
            keyword = (String) body.get("keyword");
            platform = (String) body.get("platform");
            accountStatus = (String) body.get("accountStatus");
            browserType = (String) body.get("browserType");
        }
        return shopAccountService.list(page, size, keyword, platform, accountStatus, browserType);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/create")
    public R create(@RequestBody ShopAccount entity) {
        return shopAccountService.create(entity);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/update")
    public R update(@RequestBody ShopAccount entity) {
        return shopAccountService.update(entity);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Long> body) {
        return shopAccountService.delete(body.get("id"));
    }

    @RequireRole
    @PostMapping("/detail")
    public R detail(@RequestBody Map<String, Long> body) {
        return shopAccountService.detail(body.get("id"));
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/bind-ip")
    public R bindIp(@RequestBody Map<String, Long> body) {
        return shopAccountService.bindIp(body.get("shopId"), body.get("ipPoolId"));
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/unbind-ip")
    public R unbindIp(@RequestBody Map<String, Long> body) {
        return shopAccountService.unbindIp(body.get("shopId"));
    }

    @RequireRole
    @PostMapping("/export-profile")
    public R exportProfile(@RequestBody Map<String, Long> body) {
        return shopAccountService.exportBrowserProfile(body.get("shopId"));
    }

    @RequireRole
    @PostMapping("/stats")
    public R stats() {
        return shopAccountService.stats();
    }
}
