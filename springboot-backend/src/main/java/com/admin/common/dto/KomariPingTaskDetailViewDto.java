package com.admin.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class KomariPingTaskDetailViewDto {

    private Long taskId;

    private String name;

    private String target;

    private String type;

    private Integer interval;

    private Integer clientCount;

    private Integer recordCount;

    private Integer lossCount;

    private Double lossPercent;

    private Integer minLatency;

    private Integer maxLatency;

    private Double avgLatency;

    private Long lastRecordAt;

    private List<KomariPingRecordViewDto> records;
}
