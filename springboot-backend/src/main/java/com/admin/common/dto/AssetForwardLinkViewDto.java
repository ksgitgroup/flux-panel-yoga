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

    /** 匹配方式: "bound"=手动绑定(remoteSourceAssetId), "ip_match"=IP自动匹配(remoteAddr包含本机IP) */
    private String matchType;
}
