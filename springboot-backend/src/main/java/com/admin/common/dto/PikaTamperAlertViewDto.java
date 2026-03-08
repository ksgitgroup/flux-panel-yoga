package com.admin.common.dto;

import lombok.Data;

@Data
public class PikaTamperAlertViewDto {

    private String path;

    private String details;

    private Boolean restored;

    private Long timestamp;
}
