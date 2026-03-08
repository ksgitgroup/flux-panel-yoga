package com.admin.common.dto;

import lombok.Data;

@Data
public class MonitorNodeSnapshotViewDto {

    private Long id;

    private Long instanceId;

    private String instanceName;

    private String instanceType;

    private String remoteNodeUuid;

    private Long assetId;

    private String assetName;

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

    private MonitorMetricLatestViewDto latestMetric;
}
