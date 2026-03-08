package com.admin.common.dto;

import lombok.Data;

@Data
public class KomariLoadNotificationViewDto {

    private String name;

    private String metric;

    private Double threshold;

    private Double ratio;

    private Integer interval;
}
