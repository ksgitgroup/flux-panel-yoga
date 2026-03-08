package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("asset_host")
@EqualsAndHashCode(callSuper = true)
public class AssetHost extends BaseEntity {

    private static final long serialVersionUID = 1L;

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

    private String monitorNodeUuid;

    private String pikaNodeId;

    // Probe-synced hardware detail fields
    private String cpuName;

    private String arch;

    private String virtualization;

    private String kernelVersion;

    private String gpuName;

    private Integer swapTotalMb;

    private String remark;

    /** 1Panel 面板地址 (e.g. https://ip:port) */
    private String panelUrl;
}
