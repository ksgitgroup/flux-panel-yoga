package com.admin.common.dto;

import lombok.Data;

@Data
public class PikaListeningPortViewDto {

    private String protocol;

    private String address;

    private Integer port;

    private String processName;

    private Integer processPid;

    private Boolean isPublic;
}
