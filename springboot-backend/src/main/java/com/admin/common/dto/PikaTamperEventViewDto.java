package com.admin.common.dto;

import lombok.Data;

@Data
public class PikaTamperEventViewDto {

    private String path;

    private String operation;

    private String details;

    private Long timestamp;
}
