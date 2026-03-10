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

    /** Base URL of the probe instance (e.g. https://komari.example.com). */
    private String instanceBaseUrl;

    // ---- Asset enrichment fields ----
    private String provider;
    private String label;
    private Integer bandwidthMbps;
    private Integer sshPort;
    private String panelUrl;
    private String remark;
    private Long purchaseDate;
    private String monthlyCost;
    private String purpose;

    /** Peer probe node ID (same server, different probe type). Null if no peer. */
    private Long peerNodeId;

    /** Peer probe type (komari/pika). Null if no peer. */
    private String peerInstanceType;

    // ---- Offline diagnostics ----
    /** 首次上线时间 */
    private Long firstSeenAt;

    /** 连接状态: online / offline / never_connected / degraded */
    private String connectionStatus;

    /** 离线时长 (毫秒), 仅离线时有值 */
    private Long offlineDuration;

    /** 离线原因推断: probe_unreachable / server_down / probe_removed / never_connected */
    private String offlineReason;
}
