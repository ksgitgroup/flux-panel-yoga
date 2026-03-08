package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.MonitorInstanceDto;
import com.admin.common.dto.MonitorInstanceIdDto;
import com.admin.common.dto.MonitorInstanceUpdateDto;
import com.admin.common.dto.MonitorProvisionDto;
import com.admin.common.dto.MonitorRecordsDto;
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

    @LogAnnotation
    @RequireRole
    @PostMapping("/provision")
    public R provision(@Validated @RequestBody MonitorProvisionDto dto) {
        return monitorService.provisionAgent(dto);
    }

    @RequireRole
    @PostMapping("/dashboard")
    public R dashboard() {
        return monitorService.getDashboardNodes();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete-node")
    public R deleteNode(@Validated @RequestBody MonitorInstanceIdDto dto) {
        return monitorService.deleteNodeSnapshot(dto.getId());
    }

    @RequireRole
    @PostMapping("/records")
    public R records(@Validated @RequestBody MonitorRecordsDto dto) {
        return monitorService.getNodeRecords(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/terminal-access")
    public R terminalAccess(@RequestBody java.util.Map<String, Long> body) {
        return monitorService.getTerminalAccessUrl(body.get("nodeId"));
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/provision-dual")
    public R provisionDual(@RequestBody java.util.Map<String, Object> body) {
        Long komariInstanceId = body.get("komariInstanceId") != null ? ((Number) body.get("komariInstanceId")).longValue() : null;
        Long pikaInstanceId = body.get("pikaInstanceId") != null ? ((Number) body.get("pikaInstanceId")).longValue() : null;
        String name = body.get("name") != null ? body.get("name").toString() : null;
        return monitorService.provisionDualAgent(komariInstanceId, pikaInstanceId, name);
    }
}
