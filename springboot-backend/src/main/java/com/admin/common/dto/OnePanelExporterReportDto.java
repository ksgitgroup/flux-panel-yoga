package com.admin.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class OnePanelExporterReportDto {

    private Integer schemaVersion;

    private String instanceKey;

    private Long assetId;

    private String exporterVersion;

    private Long reportTime;

    private String panelVersion;

    private String panelEdition;

    private String panelBaseUrl;

    private OnePanelSystemSummaryDto system;

    private OnePanelAuditSummaryDto audit;

    private List<OnePanelAppSummaryDto> apps;

    private List<OnePanelWebsiteSummaryDto> websites;

    private List<OnePanelContainerSummaryDto> containers;

    private List<OnePanelCronjobSummaryDto> cronjobs;

    private List<OnePanelBackupSummaryDto> backups;
}
