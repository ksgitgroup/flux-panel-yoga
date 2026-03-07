package com.admin.service.impl;

import com.admin.service.XuiService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

@Slf4j
@Component
public class XuiSyncScheduler {

    @Resource
    private XuiService xuiService;

    @Scheduled(fixedDelay = 60_000)
    public void runAutoSync() {
        try {
            xuiService.autoSyncEligibleInstances();
        } catch (Exception e) {
            log.warn("[XuiSyncScheduler] 自动同步扫描失败: {}", e.getMessage());
        }
    }
}
