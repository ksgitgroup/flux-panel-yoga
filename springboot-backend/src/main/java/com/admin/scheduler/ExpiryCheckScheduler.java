package com.admin.scheduler;

import com.admin.service.ExpiryReminderService;
import com.admin.service.NotificationService;
import com.admin.service.impl.AlertAggregationService;
import com.admin.common.lang.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class ExpiryCheckScheduler {

    @Resource
    private ExpiryReminderService expiryReminderService;

    @Resource
    private NotificationService notificationService;

    @Resource
    private AlertAggregationService alertAggregationService;

    @Scheduled(cron = "0 0 9 * * ?")
    public void dailyExpiryCheck() {
        log.info("[ExpiryScheduler] Running daily expiry check...");
        try {
            R result = expiryReminderService.checkAndNotify();
            if (result.getCode() == 0 && result.getData() instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> data = (Map<String, Object>) result.getData();
                int notifiedCount = data.get("notifiedCount") != null ? ((Number) data.get("notifiedCount")).intValue() : 0;
                if (notifiedCount > 0) {
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> details = (List<Map<String, Object>>) data.get("details");
                    StringBuilder content = new StringBuilder();
                    for (Map<String, Object> item : details) {
                        content.append(item.get("message")).append("\n");
                    }
                    notificationService.send(
                            "服务器到期提醒",
                            content.toString().trim(),
                            "expiry_reminder",
                            notifiedCount > 3 ? "warning" : "info",
                            "expiry_scheduler",
                            null);
                }
                log.info("[ExpiryScheduler] Expiry check completed, {} assets notified", notifiedCount);
            }
        } catch (Exception e) {
            log.error("[ExpiryScheduler] Expiry check failed: {}", e.getMessage(), e);
        }

        // Send daily alert summary after expiry check
        try {
            alertAggregationService.sendDailySummary();
        } catch (Exception e) {
            log.error("[ExpiryScheduler] Daily alert summary failed: {}", e.getMessage(), e);
        }
    }
}
