package com.admin.common.dto;

import lombok.Data;

@Data
public class OnePanelSystemSummaryDto {

    private String hostName;

    private String os;

    private String kernelVersion;

    private String architecture;

    private Boolean dockerRunning;

    private Boolean openrestyRunning;

    private Integer installedAppCount;

    private Integer websiteCount;

    private Integer containerCount;

    private Integer cronjobCount;

    private Integer backupRecordCount;
}
