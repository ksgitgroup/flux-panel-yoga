package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.AlertRuleDto;
import com.admin.common.lang.R;
import com.admin.service.AlertService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/alert")
public class AlertController extends BaseController {

    @Autowired
    private AlertService alertService;

    @RequireRole
    @PostMapping("/rules")
    public R listRules() {
        return alertService.listRules();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/rule/create")
    public R createRule(@Validated @RequestBody AlertRuleDto dto) {
        return alertService.createRule(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/rule/update")
    public R updateRule(@Validated @RequestBody AlertRuleDto dto) {
        return alertService.updateRule(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/rule/delete")
    public R deleteRule(@RequestBody java.util.Map<String, Long> body) {
        return alertService.deleteRule(body.get("id"));
    }

    @RequireRole
    @PostMapping("/rule/toggle")
    public R toggleRule(@RequestBody java.util.Map<String, Long> body) {
        return alertService.toggleRule(body.get("id"));
    }

    @RequireRole
    @PostMapping("/logs")
    public R listLogs(@RequestBody(required = false) java.util.Map<String, Integer> body) {
        int page = body != null && body.get("page") != null ? body.get("page") : 1;
        int size = body != null && body.get("size") != null ? body.get("size") : 20;
        return alertService.listLogs(page, size);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/logs/clear")
    public R clearLogs() {
        return alertService.clearLogs();
    }

    // ==================== Rule Groups ====================

    @RequireRole
    @PostMapping("/groups")
    public R listGroups() {
        return alertService.listGroups();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/group/create")
    public R createGroup(@RequestBody java.util.Map<String, String> body) {
        return alertService.createGroup(body.get("name"), body.get("description"));
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/group/update")
    public R updateGroup(@RequestBody java.util.Map<String, Object> body) {
        Long id = body.get("id") != null ? ((Number) body.get("id")).longValue() : null;
        return alertService.updateGroup(id, (String) body.get("name"), (String) body.get("description"));
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/group/delete")
    public R deleteGroup(@RequestBody java.util.Map<String, Long> body) {
        return alertService.deleteGroup(body.get("id"));
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/group/batch-update")
    public R batchUpdateRules(@RequestBody java.util.Map<String, Object> body) {
        return alertService.batchUpdateGroupRules(body);
    }
}
