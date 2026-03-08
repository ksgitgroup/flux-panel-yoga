package com.admin.service.impl;

import com.admin.service.TrafficAnalysisService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;

@Slf4j
@Component
public class TrafficStatsScheduler {

    @Resource
    private TrafficAnalysisService trafficAnalysisService;

    @Scheduled(cron = "0 5 * * * ?")
    public void aggregate() {
        try {
            trafficAnalysisService.aggregateHourlyStats();
        } catch (Exception e) {
            log.warn("[TrafficStatsScheduler] Hourly aggregation failed: {}", e.getMessage());
        }
    }
}
