package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.lang.R;
import com.admin.entity.BackupSchedule;
import com.admin.service.BackupService;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.Map;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/backup")
public class BackupController extends BaseController {

    @Resource
    private BackupService backupService;

    @RequireRole
    @PostMapping("/list")
    public R list(@RequestBody(required = false) Map<String, Object> body) {
        String type = null;
        int page = 1;
        int size = 20;
        if (body != null) {
            if (body.get("type") != null) type = (String) body.get("type");
            if (body.get("page") != null) page = ((Number) body.get("page")).intValue();
            if (body.get("size") != null) size = ((Number) body.get("size")).intValue();
        }
        return backupService.listRecords(type, page, size);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/export/gost")
    public R exportGost(@RequestBody Map<String, Long> body) {
        return backupService.exportGostConfig(body.get("nodeId"));
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/export/xui")
    public R exportXui(@RequestBody Map<String, Long> body) {
        return backupService.exportXuiConfig(body.get("instanceId"));
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/database")
    public R backupDatabase() {
        return backupService.backupDatabase();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@RequestBody Map<String, Long> body) {
        return backupService.deleteRecord(body.get("id"));
    }

    @RequireRole
    @PostMapping("/schedule/list")
    public R scheduleList() {
        return backupService.listSchedules();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/schedule/create")
    public R scheduleCreate(@RequestBody BackupSchedule schedule) {
        return backupService.createSchedule(schedule);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/schedule/update")
    public R scheduleUpdate(@RequestBody BackupSchedule schedule) {
        return backupService.updateSchedule(schedule);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/schedule/delete")
    public R scheduleDelete(@RequestBody Map<String, Long> body) {
        return backupService.deleteSchedule(body.get("id"));
    }
}
