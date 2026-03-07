package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("monitor_metric_latest")
@EqualsAndHashCode(callSuper = true)
public class MonitorMetricLatest extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private Long nodeSnapshotId;

    private Long instanceId;

    private String remoteNodeUuid;

    private Double cpuUsage;

    private Long memUsed;

    private Long memTotal;

    private Long diskUsed;

    private Long diskTotal;

    private Long netIn;

    private Long netOut;

    private Long netTotalUp;

    private Long netTotalDown;

    private Double load1;

    private Long uptime;

    private Integer connections;

    private Integer processCount;

    private Long sampledAt;
}
