package com.admin.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class PikaSecuritySummaryViewDto {

    private Integer totalMonitors;

    private Integer enabledMonitors;

    private Integer publicMonitors;

    private Integer alertRecordCount;

    private Integer tamperProtectedNodes;

    private Integer tamperEventCount;

    private Integer tamperAlertCount;

    private Integer auditCoverageNodes;

    private Integer publicListeningPortCount;

    private Integer suspiciousProcessCount;

    private List<MonitorProviderHighlightViewDto> highlights;

    private String loginError;
}
