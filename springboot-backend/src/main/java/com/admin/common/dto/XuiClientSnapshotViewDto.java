package com.admin.common.dto;

import lombok.Data;

@Data
public class XuiClientSnapshotViewDto {

    private Long id;

    private Long instanceId;

    private Integer remoteInboundId;

    private Integer remoteClientId;

    private String remoteClientKey;

    private String email;

    private Integer enable;

    private Long expiryTime;

    private Long total;

    private Long up;

    private Long down;

    private Long allTime;

    private Integer online;

    private Long lastOnlineAt;

    private String comment;

    private String subId;

    private Integer limitIp;

    private Integer resetDays;

    private Long lastSyncAt;

    private Integer status;
}
