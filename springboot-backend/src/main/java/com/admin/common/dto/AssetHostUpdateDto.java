package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

@Data
public class AssetHostUpdateDto {

    @NotNull(message = "资产 ID 不能为空")
    private Long id;

    @NotBlank(message = "资产名称不能为空")
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

    private String cpuName;

    private String arch;

    private String virtualization;

    private String kernelVersion;

    private String gpuName;

    private Integer swapTotalMb;

    private String remark;
}
