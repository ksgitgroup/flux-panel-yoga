package com.admin.common.dto;

import lombok.Data;

@Data
public class MonitorNodeSnapshotViewDto {

    private Long id;

    private Long instanceId;

    private String instanceName;

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

    private Integer online;

    private Long lastActiveAt;

    private Long lastSyncAt;

    private MonitorMetricLatestViewDto latestMetric;
}
