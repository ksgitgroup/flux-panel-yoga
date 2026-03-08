package com.admin.service;

import com.admin.common.lang.R;
import com.admin.entity.ExpiryReminderConfig;
import com.baomidou.mybatisplus.extension.service.IService;

public interface ExpiryReminderService extends IService<ExpiryReminderConfig> {

    R getConfig();

    R updateConfig(ExpiryReminderConfig config);

    R checkAndNotify();
}
