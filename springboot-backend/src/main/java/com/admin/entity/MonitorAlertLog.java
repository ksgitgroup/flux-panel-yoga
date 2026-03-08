package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("monitor_alert_log")
@EqualsAndHashCode(callSuper = true)
public class MonitorAlertLog extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private Long ruleId;

    private String ruleName;

    private Long nodeId;

    private String nodeName;

    private String metric;

    private Double currentValue;

    private Double threshold;

    private String message;

    /** pending, sent, failed */
    private String notifyStatus;
}
