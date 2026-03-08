package com.admin.common.dto;

import lombok.Data;

@Data
public class PikaAuditRunViewDto {

    private Long startTime;

    private Long endTime;

    private Integer passCount;

    private Integer failCount;

    private Integer warnCount;

    private Integer totalCount;

    private String system;
}
