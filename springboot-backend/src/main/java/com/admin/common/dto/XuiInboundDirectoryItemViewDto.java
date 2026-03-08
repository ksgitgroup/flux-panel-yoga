package com.admin.common.dto;

import lombok.Data;

@Data
public class XuiInboundDirectoryItemViewDto {

    private Long id;

    private Long instanceId;

    private String instanceName;

    private String instanceProvider;

    private String instanceBaseUrl;

    private String instanceWebBasePath;

    private String instanceLastSyncStatus;

    private Long instanceLastSyncAt;

    private Long assetId;

    private String assetName;

    private String assetPrimaryIp;

    private String assetRegion;

    private String assetProvider;

    private String assetEnvironment;

    private String hostLabel;

    private Integer remoteInboundId;

    private String remark;

    private String tag;

    private String protocol;

    private String listen;

    private Integer port;

    private Integer enable;

    private Long expiryTime;

    private Long total;

    private Long up;

    private Long down;

    private Long allTime;

    private Integer clientCount;

    private Integer onlineClientCount;

    private String transportSummary;

    private Long lastSyncAt;

    private Integer status;
}
