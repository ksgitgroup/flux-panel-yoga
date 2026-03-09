package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.lang.R;
import com.admin.service.TrafficAnalysisService;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.Map;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/traffic-analysis")
public class TrafficAnalysisController extends BaseController {

    @Resource
    private TrafficAnalysisService trafficAnalysisService;

    @RequireRole
    @PostMapping("/overview")
    public R overview() {
        return trafficAnalysisService.getOverview();
    }

    @RequireRole
    @PostMapping("/trend")
    public R trend(@RequestBody(required = false) Map<String, Object> body) {
        String dimensionType = null;
        Long dimensionId = null;
        String range = "24h";
        if (body != null) {
            if (body.get("dimensionType") != null) dimensionType = (String) body.get("dimensionType");
            if (body.get("dimensionId") != null) dimensionId = ((Number) body.get("dimensionId")).longValue();
            if (body.get("range") != null) range = (String) body.get("range");
        }
        return trafficAnalysisService.getTrend(dimensionType, dimensionId, range);
    }

    @RequireRole
    @PostMapping("/top-users")
    public R topUsers(@RequestBody(required = false) Map<String, Object> body) {
        String range = "24h";
        int limit = 10;
        if (body != null) {
            if (body.get("range") != null) range = (String) body.get("range");
            if (body.get("limit") != null) limit = ((Number) body.get("limit")).intValue();
        }
        return trafficAnalysisService.getTopUsers(range, limit);
    }

    @RequireRole
    @PostMapping("/top-forwards")
    public R topForwards(@RequestBody(required = false) Map<String, Object> body) {
        String range = "24h";
        int limit = 10;
        if (body != null) {
            if (body.get("range") != null) range = (String) body.get("range");
            if (body.get("limit") != null) limit = ((Number) body.get("limit")).intValue();
        }
        return trafficAnalysisService.getTopForwards(range, limit);
    }

    @RequireRole
    @PostMapping("/peak-hours")
    public R peakHours(@RequestBody(required = false) Map<String, Object> body) {
        String range = "7d";
        if (body != null && body.get("range") != null) range = (String) body.get("range");
        return trafficAnalysisService.getPeakHours(range);
    }

    @RequireRole
    @PostMapping("/protocol-distribution")
    public R protocolDistribution(@RequestBody(required = false) Map<String, Object> body) {
        String range = "7d";
        if (body != null && body.get("range") != null) range = (String) body.get("range");
        return trafficAnalysisService.getProtocolDistribution(range);
    }

    @RequireRole
    @PostMapping("/anomalies")
    public R anomalies(@RequestBody(required = false) Map<String, Object> body) {
        int page = 1;
        int size = 20;
        Integer acknowledged = null;
        if (body != null) {
            if (body.get("page") != null) page = ((Number) body.get("page")).intValue();
            if (body.get("size") != null) size = ((Number) body.get("size")).intValue();
            if (body.get("acknowledged") != null) acknowledged = ((Number) body.get("acknowledged")).intValue();
        }
        return trafficAnalysisService.listAnomalies(page, size, acknowledged);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/anomalies/acknowledge")
    public R acknowledgeAnomaly(@RequestBody Map<String, Long> body) {
        return trafficAnalysisService.acknowledgeAnomaly(body.get("id"));
    }
}
