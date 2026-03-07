package com.admin.common.dto;

import lombok.Data;

@Data
public class XuiInstanceViewDto {

    private Long id;

    private String name;

    private String baseUrl;

    private String webBasePath;

    private String username;

    private String hostLabel;

    private String managementMode;

    private Integer syncEnabled;

    private Integer syncIntervalMinutes;

    private Integer allowInsecureTls;

    private String remark;

    private Boolean passwordConfigured;

    private String trafficCallbackPath;

    private Long lastSyncAt;

    private String lastSyncStatus;

    private String lastSyncTrigger;

    private String lastSyncError;

    private Long lastTestAt;

    private String lastTestStatus;

    private String lastTestError;

    private Long lastTrafficPushAt;

    private Long inboundCount;

    private Long clientCount;
}
