package com.admin.service.impl;

import com.admin.service.MonitorService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

@Slf4j
@Component
public class MonitorSyncScheduler {

    @Resource
    private MonitorService monitorService;

    @Scheduled(fixedDelay = 60_000)
    public void runAutoSync() {
        try {
            monitorService.autoSyncEligibleInstances();
        } catch (Exception e) {
            log.warn("[MonitorSyncScheduler] Auto sync failed: {}", e.getMessage());
        }
    }
}
