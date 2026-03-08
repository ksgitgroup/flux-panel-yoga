package com.admin.service.impl;

import com.admin.common.lang.R;
import com.admin.entity.AuditLog;
import com.admin.mapper.AuditLogMapper;
import com.admin.service.AuditLogService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class AuditLogServiceImpl extends ServiceImpl<AuditLogMapper, AuditLog> implements AuditLogService {

    @Override
    public void log(String username, String action, String module, Long targetId, String targetName, String detail, String ip, String result) {
        AuditLog auditLog = new AuditLog();
        auditLog.setUsername(username);
        auditLog.setAction(action);
        auditLog.setModule(module);
        auditLog.setTargetId(targetId);
        auditLog.setTargetName(targetName);
        auditLog.setDetail(detail);
        auditLog.setIp(ip);
        auditLog.setResult(result);
        auditLog.setCreatedTime(System.currentTimeMillis());
        auditLog.setStatus(0);
        try {
            this.save(auditLog);
        } catch (Exception e) {
            log.error("[AuditLog] Failed to save audit log: {}", e.getMessage());
        }
    }

    @Override
    public R listLogs(int page, int size, String module, String action, Long startTime, Long endTime) {
        if (page < 1) page = 1;
        if (size < 1 || size > 100) size = 20;

        LambdaQueryWrapper<AuditLog> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(module)) {
            wrapper.eq(AuditLog::getModule, module);
        }
        if (StringUtils.hasText(action)) {
            wrapper.eq(AuditLog::getAction, action);
        }
        if (startTime != null) {
            wrapper.ge(AuditLog::getCreatedTime, startTime);
        }
        if (endTime != null) {
            wrapper.le(AuditLog::getCreatedTime, endTime);
        }
        wrapper.orderByDesc(AuditLog::getCreatedTime);

        Page<AuditLog> pageResult = this.page(new Page<>(page, size), wrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("records", pageResult.getRecords());
        result.put("total", pageResult.getTotal());
        result.put("page", pageResult.getCurrent());
        result.put("size", pageResult.getSize());
        return R.ok(result);
    }

    @Override
    public R getStats() {
        long now = System.currentTimeMillis();
        long todayStart = now - (now % 86400000L);
        long weekStart = now - 7 * 86400000L;

        long todayCount = this.count(new LambdaQueryWrapper<AuditLog>()
                .ge(AuditLog::getCreatedTime, todayStart));
        long weekCount = this.count(new LambdaQueryWrapper<AuditLog>()
                .ge(AuditLog::getCreatedTime, weekStart));

        // Module distribution for the past week
        List<AuditLog> weekLogs = this.list(new LambdaQueryWrapper<AuditLog>()
                .ge(AuditLog::getCreatedTime, weekStart)
                .select(AuditLog::getModule));
        Map<String, Long> moduleCounts = weekLogs.stream()
                .filter(l -> l.getModule() != null)
                .collect(Collectors.groupingBy(AuditLog::getModule, Collectors.counting()));
        List<Map<String, Object>> moduleDistribution = moduleCounts.entrySet().stream()
                .map(e -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("module", e.getKey());
                    m.put("count", e.getValue());
                    return m;
                })
                .sorted((a, b) -> Long.compare((long) b.get("count"), (long) a.get("count")))
                .collect(Collectors.toList());

        Map<String, Object> stats = new HashMap<>();
        stats.put("todayCount", todayCount);
        stats.put("weekCount", weekCount);
        stats.put("moduleDistribution", moduleDistribution);
        return R.ok(stats);
    }

    @Override
    public R clearOldLogs(int days) {
        if (days < 1) {
            return R.err("天数必须大于0");
        }
        long cutoff = System.currentTimeMillis() - (long) days * 86400000L;
        int deleted = this.baseMapper.delete(new LambdaQueryWrapper<AuditLog>()
                .lt(AuditLog::getCreatedTime, cutoff));
        log.info("[AuditLog] Cleared {} logs older than {} days", deleted, days);
        return R.ok(deleted);
    }
}
