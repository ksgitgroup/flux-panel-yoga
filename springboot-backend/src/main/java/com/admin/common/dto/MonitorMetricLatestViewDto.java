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

    private Long swapUsed;

    private Long swapTotal;

    private Double gpuUsage;

    private Double temperature;

    private Double load1;

    private Double load5;

    private Double load15;

    private Long uptime;

    private Integer connections;

    private Integer connectionsUdp;

    private Integer processCount;

    private Long sampledAt;
}
