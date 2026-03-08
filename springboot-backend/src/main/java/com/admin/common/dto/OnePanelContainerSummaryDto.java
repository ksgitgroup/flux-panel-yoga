package com.admin.common.dto;

import lombok.Data;

@Data
public class OnePanelContainerSummaryDto {

    private String containerId;

    private String name;

    private String image;

    private String composeProject;

    private String status;

    private Double cpuPercent;

    private Double memoryPercent;

    private String portSummary;
}
