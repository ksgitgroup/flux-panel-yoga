package com.admin.common.dto;

import lombok.Data;

@Data
public class OnePanelInstanceDetailDto {

    private OnePanelInstanceViewDto instance;

    private OnePanelExporterReportDto latestReport;

    private Long latestReportTime;

    private String latestReportRemoteIp;
}
