package com.admin.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class MonitorInstanceDetailDto {

    private MonitorInstanceViewDto instance;

    private List<MonitorNodeSnapshotViewDto> nodes;

    private MonitorProviderSummaryViewDto providerSummary;

    private String providerSummaryError;
}
