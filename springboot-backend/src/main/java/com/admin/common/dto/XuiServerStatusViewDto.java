package com.admin.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class XuiServerStatusViewDto {

    private Double cpuUsage;

    private Integer cpuCores;

    private Integer logicalProcessors;

    private Integer cpuSpeedMhz;

    private Long memoryUsed;

    private Long memoryTotal;

    private Long swapUsed;

    private Long swapTotal;

    private Long diskUsed;

    private Long diskTotal;

    private String xrayState;

    private String xrayErrorMessage;

    private String xrayVersion;

    private Long uptime;

    private List<Double> loads;

    private Integer tcpCount;

    private Integer udpCount;

    private Long netIoUp;

    private Long netIoDown;

    private Long netTrafficSent;

    private Long netTrafficReceived;

    private String publicIpv4;

    private String publicIpv6;

    private Integer appThreads;

    private Long appMemory;

    private Long appUptime;
}
