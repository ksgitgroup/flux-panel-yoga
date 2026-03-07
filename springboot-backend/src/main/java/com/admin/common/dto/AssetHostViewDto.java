package com.admin.common.dto;

import lombok.Data;

@Data
public class AssetHostViewDto {

    private Long id;

    private String name;

    private String label;

    private String primaryIp;

    private String environment;

    private String provider;

    private String region;

    private String remark;

    private Integer totalXuiInstances;

    private Integer totalProtocols;

    private Integer totalInbounds;

    private Integer totalClients;

    private Integer onlineClients;

    private Integer totalForwards;

    private Long lastObservedAt;
}
