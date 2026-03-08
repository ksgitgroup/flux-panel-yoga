package com.admin.common.dto;

import lombok.Data;

@Data
public class MonitorProviderSummaryViewDto {

    private String type;

    private Integer totalNodes;

    private Integer onlineNodes;

    private PikaSecuritySummaryViewDto pikaSecurity;

    private KomariOperationsSummaryViewDto komariOperations;
}
