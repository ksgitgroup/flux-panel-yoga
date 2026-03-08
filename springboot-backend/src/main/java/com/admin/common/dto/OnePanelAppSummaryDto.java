package com.admin.common.dto;

import lombok.Data;

@Data
public class OnePanelAppSummaryDto {

    private String appKey;

    private String name;

    private String version;

    private String status;

    private String accessUrl;

    private String portSummary;

    private Boolean upgradeAvailable;

    private Long updatedAt;
}
