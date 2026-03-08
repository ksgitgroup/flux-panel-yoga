package com.admin.common.dto;

import lombok.Data;

@Data
public class OnePanelCronjobSummaryDto {

    private Long cronjobId;

    private String name;

    private String type;

    private String status;

    private String schedule;

    private String lastRecordStatus;

    private Long lastRecordAt;
}
