package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("monitor_alert_rule_group")
@EqualsAndHashCode(callSuper = true)
public class MonitorAlertRuleGroup extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String name;
    private String description;
    private Integer enabled;

    /** 是否为系统默认组（自动创建的不可删除） */
    private Integer isDefault;
}
