package com.admin.common.dto;

import lombok.Data;

@Data
public class KomariPingTaskViewDto {

    private Long taskId;

    private String name;

    private String target;

    private String type;

    private Integer interval;

    private Integer clientCount;
}
