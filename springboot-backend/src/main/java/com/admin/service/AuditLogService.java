package com.admin.service;

import com.admin.common.lang.R;
import com.admin.entity.AuditLog;
import com.baomidou.mybatisplus.extension.service.IService;

public interface AuditLogService extends IService<AuditLog> {

    void log(String username, String action, String module, Long targetId, String targetName, String detail, String ip, String result);

    R listLogs(int page, int size, String module, String action, Long startTime, Long endTime);

    R getStats();

    R clearOldLogs(int days);
}
