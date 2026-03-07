package com.admin.common.dto;

import lombok.Data;

@Data
public class XuiSyncResultDto {

    private Long instanceId;

    private String instanceName;

    private String trigger;

    private Integer remoteInboundCount;

    private Integer remoteClientCount;

    private String apiFlavor;

    private String resolvedBasePath;

    private Integer createdInboundCount;

    private Integer updatedInboundCount;

    private Integer deletedInboundCount;

    private Integer createdClientCount;

    private Integer updatedClientCount;

    private Integer deletedClientCount;

    private Long finishedAt;

    private String message;
}
