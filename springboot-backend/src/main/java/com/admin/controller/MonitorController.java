package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.MonitorInstanceDto;
import com.admin.common.dto.MonitorInstanceIdDto;
import com.admin.common.dto.MonitorInstanceUpdateDto;
import com.admin.common.lang.R;
import com.admin.service.MonitorService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/monitor")
public class MonitorController extends BaseController {

    @Autowired
    private MonitorService monitorService;

    @LogAnnotation
    @RequireRole
    @PostMapping("/list")
    public R list() {
        return monitorService.getAllInstances();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/detail")
    public R detail(@Validated @RequestBody MonitorInstanceIdDto dto) {
        return monitorService.getInstanceDetail(dto.getId());
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/create")
    public R create(@Validated @RequestBody MonitorInstanceDto dto) {
        return monitorService.createInstance(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/update")
    public R update(@Validated @RequestBody MonitorInstanceUpdateDto dto) {
        return monitorService.updateInstance(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@Validated @RequestBody MonitorInstanceIdDto dto) {
        return monitorService.deleteInstance(dto.getId());
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/test")
    public R test(@Validated @RequestBody MonitorInstanceIdDto dto) {
        return monitorService.testConnection(dto.getId());
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/sync")
    public R sync(@Validated @RequestBody MonitorInstanceIdDto dto) {
        return monitorService.syncInstance(dto.getId());
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/unbound-nodes")
    public R unboundNodes() {
        return monitorService.getAllUnboundNodes();
    }
}
