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

    private Integer online;

    private Long lastActiveAt;

    private Long lastSyncAt;
}
