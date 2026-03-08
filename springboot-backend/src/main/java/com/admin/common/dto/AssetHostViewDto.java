package com.admin.common.dto;

import lombok.Data;

@Data
public class AssetHostViewDto {

    private Long id;

    private String name;

    private String label;

    private String primaryIp;

    private String ipv6;

    private String environment;

    private String provider;

    private String region;

    private String role;

    private String os;

    private Integer cpuCores;

    private Integer memTotalMb;

    private Integer diskTotalGb;

    private Integer bandwidthMbps;

    private Integer monthlyTrafficGb;

    private Integer sshPort;

    private Long purchaseDate;

    private Long expireDate;

    private String monthlyCost;

    private String currency;

    private String tags;

    private Long gostNodeId;

    private String gostNodeName;

    private String monitorNodeUuid;

    private String pikaNodeId;

    private String cpuName;

    private String arch;

    private String virtualization;

    private String kernelVersion;

    private String gpuName;

    private Integer swapTotalMb;

    private String remark;

    private Integer totalXuiInstances;

    private Integer totalProtocols;

    private Integer totalInbounds;

    private Integer totalClients;

    private Integer onlineClients;

    private Integer totalForwards;

    private Long lastObservedAt;

    private Integer monitorOnline;

    private Double monitorCpuUsage;

    private Long monitorMemUsed;

    private Long monitorMemTotal;

    private Long monitorNetIn;

    private Long monitorNetOut;

    /** 数据来源: "local" / "komari" / "pika" / "dual" */
    private String probeSource;

    /** 最近一次探针同步时间 */
    private Long monitorLastSyncAt;

    /** 探针流量配额 (bytes) */
    private Long probeTrafficLimit;

    /** 探针已用流量 (bytes) */
    private Long probeTrafficUsed;

    /** 探针到期时间 (ms) */
    private Long probeExpiredAt;

    /** 探针标签 (逗号分隔或JSON数组) */
    private String probeTags;
}
