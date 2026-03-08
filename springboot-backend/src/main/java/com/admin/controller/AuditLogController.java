package com.admin.controller;

import com.admin.common.lang.R;
import com.admin.entity.ExpiryReminderConfig;
import com.admin.service.AuditLogService;
import com.admin.service.ExpiryReminderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/audit")
public class AuditLogController {

    @Autowired
    private AuditLogService auditLogService;

    @Autowired
    private ExpiryReminderService expiryReminderService;

    @PostMapping("/logs")
    public R listLogs(@RequestBody Map<String, Object> params) {
        int page = params.containsKey("page") ? ((Number) params.get("page")).intValue() : 1;
        int size = params.containsKey("size") ? ((Number) params.get("size")).intValue() : 20;
        String module = (String) params.get("module");
        String action = (String) params.get("action");
        Long startTime = params.containsKey("startTime") ? ((Number) params.get("startTime")).longValue() : null;
        Long endTime = params.containsKey("endTime") ? ((Number) params.get("endTime")).longValue() : null;
        return auditLogService.listLogs(page, size, module, action, startTime, endTime);
    }

    @PostMapping("/stats")
    public R getStats() {
        return auditLogService.getStats();
    }

    @PostMapping("/clear")
    public R clearOldLogs(@RequestBody Map<String, Object> params) {
        int days = params.containsKey("days") ? ((Number) params.get("days")).intValue() : 90;
        return auditLogService.clearOldLogs(days);
    }

    @GetMapping("/expiry/config")
    public R getExpiryConfig() {
        return expiryReminderService.getConfig();
    }

    @PostMapping("/expiry/config/update")
    public R updateExpiryConfig(@RequestBody ExpiryReminderConfig config) {
        return expiryReminderService.updateConfig(config);
    }

    @PostMapping("/expiry/check-now")
    public R checkExpiryNow() {
        return expiryReminderService.checkAndNotify();
    }
}
