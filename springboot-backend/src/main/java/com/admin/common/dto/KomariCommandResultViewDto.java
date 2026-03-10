package com.admin.common.dto;

import lombok.Data;

@Data
public class KomariCommandResultViewDto {

    private String clientUuid;

    private String result;

    private Integer exitCode;

    private Long finishedAt;
}
