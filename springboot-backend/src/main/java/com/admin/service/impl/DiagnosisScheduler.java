package com.admin.service.impl;

import com.admin.entity.ViteConfig;
import com.admin.mapper.ViteConfigMapper;
import com.admin.service.DiagnosisService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

/**
 * 自动诊断定时调度器
 *
 * 每分钟检查一次配置，判断是否需要触发全量诊断。
 * 使用固定频率（每1分钟）而非动态 cron，以便不重启服务就能读取最新配置间隔。
 */
@Slf4j
@Component
public class DiagnosisScheduler {

    @Autowired
    private DiagnosisService diagnosisService;

    @Autowired
    private ViteConfigMapper viteConfigMapper;

    /** 上次诊断的时间戳 */
    private final AtomicLong lastRunTime = new AtomicLong(0);

    /**
     * 每 60 秒检查一次：
     * 1. 从配置表读取 auto_diagnosis_enabled 和 auto_diagnosis_interval（分钟）
     * 2. 如果启用且距上次运行已超过设定的间隔，则触发全量诊断
     */
    @Scheduled(fixedDelay = 60_000)
    public void checkAndRun() {
        try {
            String enabledVal = getConfigValue("auto_diagnosis_enabled");
            if (!"true".equalsIgnoreCase(enabledVal)) {
                return;
            }

            String intervalVal = getConfigValue("auto_diagnosis_interval");
            int intervalMinutes;
            try {
                intervalMinutes = Integer.parseInt(intervalVal);
            } catch (NumberFormatException e) {
                intervalMinutes = 30; // 默认30分钟
            }

            if (intervalMinutes <= 0) {
                return;
            }

            long intervalMs = (long) intervalMinutes * 60 * 1000;
            long now = System.currentTimeMillis();

            if (now - lastRunTime.get() >= intervalMs) {
                lastRunTime.set(now);
                log.info("[DiagnosisScheduler] 触发自动诊断（间隔: {} 分钟）", intervalMinutes);
                diagnosisService.runAllDiagnosis();
            }
        } catch (Exception e) {
            log.error("[DiagnosisScheduler] 调度检查异常: {}", e.getMessage(), e);
        }
    }

    private String getConfigValue(String key) {
        try {
            QueryWrapper<ViteConfig> qw = new QueryWrapper<ViteConfig>().eq("name", key);
            ViteConfig cfg = viteConfigMapper.selectOne(qw);
            return cfg != null ? cfg.getValue() : null;
        } catch (Exception e) {
            return null;
        }
    }
}
