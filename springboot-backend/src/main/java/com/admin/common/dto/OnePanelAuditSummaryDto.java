package com.admin.common.dto;

import lombok.Data;

@Data
public class OnePanelAuditSummaryDto {

    private Integer loginFailedCount24h;

    private Integer operationCount24h;

    private Integer riskyOperationCount24h;

    private Long lastLoginAt;

    private Long lastOperationAt;
}
