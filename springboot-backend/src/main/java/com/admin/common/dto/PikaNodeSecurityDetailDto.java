package com.admin.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class PikaNodeSecurityDetailDto {

    private Boolean tamperEnabled;

    private List<String> tamperProtectedPaths;

    private String tamperApplyStatus;

    private String tamperApplyMessage;

    private Integer publicListeningPortCount;

    private Integer suspiciousProcessCount;

    private Long auditStartTime;

    private Long auditEndTime;

    private List<String> auditWarnings;

    private List<PikaListeningPortViewDto> publicListeningPorts;

    private List<PikaProcessViewDto> suspiciousProcesses;

    private List<PikaTamperEventViewDto> recentTamperEvents;

    private List<PikaTamperAlertViewDto> recentTamperAlerts;

    private List<PikaAuditRunViewDto> recentAuditRuns;
}
