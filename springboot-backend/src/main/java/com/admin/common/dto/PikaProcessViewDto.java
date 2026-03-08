package com.admin.common.dto;

import lombok.Data;

@Data
public class PikaProcessViewDto {

    private Integer pid;

    private String name;

    private String username;

    private Double cpuPercent;

    private Double memPercent;

    private Boolean exeDeleted;

    private String cmdline;
}
