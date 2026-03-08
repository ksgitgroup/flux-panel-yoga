package com.admin.service;

import com.admin.common.lang.R;
import com.admin.entity.BackupRecord;
import com.admin.entity.BackupSchedule;
import com.baomidou.mybatisplus.extension.service.IService;

public interface BackupService extends IService<BackupRecord> {

    R listRecords(String type, int page, int size);

    R exportGostConfig(Long nodeId);

    R exportXuiConfig(Long instanceId);

    R backupDatabase();

    R deleteRecord(Long id);

    R listSchedules();

    R createSchedule(BackupSchedule schedule);

    R updateSchedule(BackupSchedule schedule);

    R deleteSchedule(Long id);
}
