package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.lang.R;
import com.admin.service.IpQualityService;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.List;
import java.util.Map;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/ip-quality")
public class IpQualityController extends BaseController {

    @Resource
    private IpQualityService ipQualityService;

    @LogAnnotation
    @RequireRole
    @PostMapping("/check")
    public R check(@RequestBody Map<String, Object> body) {
        String ip = (String) body.get("ip");
        Long assetId = body.get("assetId") != null ? ((Number) body.get("assetId")).longValue() : null;
        return ipQualityService.checkSingleIp(ip, assetId);
    }

    @LogAnnotation
    @SuppressWarnings("unchecked")
    @RequireRole
    @PostMapping("/batch-check")
    public R batchCheck(@RequestBody Map<String, Object> body) {
        List<Number> raw = (List<Number>) body.get("assetIds");
        List<Long> assetIds = raw != null ? raw.stream().map(Number::longValue).toList() : null;
        return ipQualityService.batchCheck(assetIds);
    }

    @RequireRole
    @PostMapping("/list")
    public R list(@RequestBody(required = false) Map<String, Object> body) {
        int page = 1;
        int size = 20;
        String ip = null;
        String overallStatus = null;
        if (body != null) {
            if (body.get("page") != null) page = ((Number) body.get("page")).intValue();
            if (body.get("size") != null) size = ((Number) body.get("size")).intValue();
            if (body.get("ip") != null) ip = (String) body.get("ip");
            if (body.get("overallStatus") != null) overallStatus = (String) body.get("overallStatus");
        }
        return ipQualityService.listRecords(page, size, ip, overallStatus);
    }

    @RequireRole
    @PostMapping("/latest-by-asset")
    public R latestByAsset() {
        return ipQualityService.getLatestByAsset();
    }

    @RequireRole
    @PostMapping("/latency-matrix")
    public R latencyMatrix() {
        return ipQualityService.getLatencyMatrix();
    }
}
