package com.admin.common.dto;

import lombok.Data;

@Data
public class PikaSshLoginEventViewDto {

    private String user;

    private String ip;

    private String method;

    private Boolean success;

    private Long timestamp;
}
