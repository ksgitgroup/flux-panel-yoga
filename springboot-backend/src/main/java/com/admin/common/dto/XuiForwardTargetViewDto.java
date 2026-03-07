package com.admin.common.dto;

import lombok.Data;

@Data
public class XuiForwardTargetViewDto {

    private Long assetId;

    private String assetName;

    private String assetLabel;

    private Long instanceId;

    private String instanceName;

    private Long inboundSnapshotId;

    private String protocol;

    private String remark;

    private String tag;

    private Integer port;

    private String transportSummary;

    private Integer clientCount;

    private Integer onlineClientCount;

    private String remoteHost;

    private String remoteAddress;

    private String sourceLabel;
}
