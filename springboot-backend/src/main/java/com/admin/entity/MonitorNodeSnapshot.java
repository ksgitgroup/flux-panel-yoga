package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("monitor_node_snapshot")
@EqualsAndHashCode(callSuper = true)
public class MonitorNodeSnapshot extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private Long instanceId;

    private String remoteNodeUuid;

    private Long assetId;

    private String name;

    private String ip;

    private String ipv6;

    private String os;

    private String cpuName;

    private Integer cpuCores;

    private Long memTotal;

    private Long diskTotal;

    private String region;

    private String version;

    private String virtualization;

    private String arch;

    private String kernelVersion;

    private String gpuName;

    private Long swapTotal;

    private Integer hidden;

    private String tags;

    private String nodeGroup;

    private Integer weight;

    private Double price;

    private Integer billingCycle;

    private String currency;

    private Long expiredAt;

    private Long trafficLimit;

    private String trafficLimitType;

    private Long trafficUsed;

    private Integer trafficResetDay;

    private Integer online;

    private Long lastActiveAt;

    private Long lastSyncAt;

    /** 0=normal, 1=user-unlinked from asset (skip auto-create/link on sync) */
    private Integer assetUnlinked;
}
