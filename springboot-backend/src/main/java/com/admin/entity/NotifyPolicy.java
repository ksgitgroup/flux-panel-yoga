package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("notify_policy")
@EqualsAndHashCode(callSuper = true)
public class NotifyPolicy extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String name;
    private String description;
    private String eventTypes;
    private String severityFilter;
    private String channelIds;
    private String recipientUserIds;
    private Integer enabled;
    private Integer cooldownMinutes;

    /** 是否包含恢复通知的外发（站内通知照常记录），默认 1=包含 */
    private Integer includeRecovery;
}
