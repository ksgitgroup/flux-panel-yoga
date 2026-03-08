package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("expiry_reminder_config")
@EqualsAndHashCode(callSuper = true)
public class ExpiryReminderConfig extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private Integer enabled;
    private String remindDaysBefore;
    private String notifyChannel;
    private String notifyTarget;
    private Long lastCheckAt;
}
