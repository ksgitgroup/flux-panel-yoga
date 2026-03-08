package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("monitor_alert_rule")
@EqualsAndHashCode(callSuper = true)
public class MonitorAlertRule extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String name;

    private Integer enabled;

    /** cpu, mem, disk, net_in, net_out, offline */
    private String metric;

    /** gt, lt, eq */
    private String operator;

    private Double threshold;

    private Integer durationSeconds;

    /** all, tag, node */
    private String scopeType;

    private String scopeValue;

    /** webhook, log */
    private String notifyType;

    private String notifyTarget;

    private Integer cooldownMinutes;

    private Long lastTriggeredAt;

    /** 探针条件: any, komari, pika, both */
    private String probeCondition;

    /** 严重等级: info, warning, critical */
    private String severity;

    /** 升级间隔（分钟）：若持续触发，经过此间隔后自动升级严重等级并重新通知 */
    private Integer escalateAfterMinutes;
}
