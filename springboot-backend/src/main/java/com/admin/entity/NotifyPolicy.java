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

    /** 按告警类别过滤（逗号分隔：infra,connectivity,resource），空=匹配全部 */
    private String categoryFilter;

    /** 按资产标签过滤（逗号分隔标签名），空=匹配全部 */
    private String tagFilter;

    /** 静默窗口，格式 "HH:mm-HH:mm"（如 "22:00-06:00"），空=不静默 */
    private String muteSchedule;
}
