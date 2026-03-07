package com.admin.common.dto;

import lombok.Data;

@Data
public class MonitorInstanceViewDto {

    private Long id;

    private String name;

    private String type;

    private String baseUrl;

    private String apiKey;

    private Integer syncEnabled;

    private Integer syncIntervalMinutes;

    private Integer allowInsecureTls;

    private String remark;

    private Long lastSyncAt;

    private String lastSyncStatus;

    private String lastSyncError;

    private Integer nodeCount;

    private Integer onlineNodeCount;

    private Long createdTime;

    private Long updatedTime;
}
