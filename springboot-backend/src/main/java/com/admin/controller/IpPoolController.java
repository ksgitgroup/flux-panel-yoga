package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.lang.R;
import com.admin.entity.IpPool;
import com.admin.service.IpPoolService;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.Map;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/ip-pool")
public class IpPoolController extends BaseController {

    @Resource
    private IpPoolService ipPoolService;

    @RequireRole
    @PostMapping("/list")
    public R list(@RequestBody(required = false) Map<String, Object> body) {
        int page = 1, size = 50;
        String keyword = null, ipType = null, healthStatus = null, countryCode = null;
        if (body != null) {
            if (body.get("page") != null) page = ((Number) body.get("page")).intValue();
            if (body.get("size") != null) size = ((Number) body.get("size")).intValue();
            keyword = (String) body.get("keyword");
            ipType = (String) body.get("ipType");
            healthStatus = (String) body.get("healthStatus");
            countryCode = (String) body.get("countryCode");
        }
        return ipPoolService.list(page, size, keyword, ipType, healthStatus, countryCode);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/create")
    public R create(@RequestBody IpPool entity) {
        return ipPoolService.create(entity);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/update")
    public R update(@RequestBody IpPool entity) {
        return ipPoolService.update(entity);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Long> body) {
        return ipPoolService.delete(body.get("id"));
    }

    @RequireRole
    @PostMapping("/health-check")
    public R healthCheck(@RequestBody Map<String, Long> body) {
        return ipPoolService.healthCheck(body.get("id"));
    }

    @RequireRole
    @PostMapping("/batch-health-check")
    public R batchHealthCheck() {
        return ipPoolService.batchHealthCheck();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/bind")
    public R bind(@RequestBody Map<String, Long> body) {
        return ipPoolService.bindToShop(body.get("ipPoolId"), body.get("shopId"));
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/unbind")
    public R unbind(@RequestBody Map<String, Long> body) {
        return ipPoolService.unbind(body.get("id"));
    }

    @RequireRole
    @PostMapping("/export-proxy")
    public R exportProxy(@RequestBody Map<String, Object> body) {
        Long id = body.get("id") != null ? ((Number) body.get("id")).longValue() : null;
        String browserType = (String) body.get("browserType");
        if (id == null) return R.err("缺少 id");
        return ipPoolService.exportProxyConfig(id, browserType);
    }

    @RequireRole
    @PostMapping("/stats")
    public R stats() {
        return ipPoolService.stats();
    }
}
