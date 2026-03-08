package com.admin.common.dto;

import lombok.Data;

@Data
public class OnePanelInstanceViewDto {

    private Long id;

    private String name;

    private Long assetId;

    private String assetName;

    private String assetPrimaryIp;

    private String assetEnvironment;

    private String assetRegion;

    private String panelUrl;

    private String instanceKey;

    private Integer reportEnabled;

    private String remark;

    private Long tokenIssuedAt;

    private Long lastReportAt;

    private String lastReportStatus;

    private String lastReportError;

    private String lastReportRemoteIp;

    private String exporterVersion;

    private String panelVersion;

    private String panelEdition;

    private Integer appCount;

    private Integer websiteCount;

    private Integer containerCount;

    private Integer cronjobCount;

    private Integer backupCount;
}
