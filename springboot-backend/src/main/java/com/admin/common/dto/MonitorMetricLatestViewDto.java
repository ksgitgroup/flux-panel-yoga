package com.admin.common.dto;

import lombok.Data;

@Data
public class MonitorMetricLatestViewDto {

    private Double cpuUsage;

    private Long memUsed;

    private Long memTotal;

    private Long diskUsed;

    private Long diskTotal;

    private Long netIn;

    private Long netOut;

    private Long netTotalUp;

    private Long netTotalDown;

    private Double load1;

    private Long uptime;

    private Integer connections;

    private Integer processCount;

    private Long sampledAt;
}
