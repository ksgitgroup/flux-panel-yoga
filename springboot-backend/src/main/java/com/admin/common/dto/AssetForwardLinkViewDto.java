package com.admin.common.dto;

import lombok.Data;

@Data
public class AssetForwardLinkViewDto {

    private Long id;

    private String name;

    private Integer tunnelId;

    private String tunnelName;

    private Integer status;

    private String remoteAddr;

    private String remoteSourceType;

    private String remoteSourceLabel;

    private String remoteSourceProtocol;

    private Long createdTime;

    private Long updatedTime;
}
