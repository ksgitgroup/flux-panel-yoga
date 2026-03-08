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
}
