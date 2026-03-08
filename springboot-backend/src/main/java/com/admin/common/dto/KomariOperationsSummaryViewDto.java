package com.admin.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class KomariOperationsSummaryViewDto {

    private Integer publicNodeCount;

    private Integer publicBoundNodeCount;

    private Integer hiddenBoundNodeCount;

    private Integer pingTaskCount;

    private Integer loadNotificationCount;

    private Integer offlineNotificationCount;

    private List<MonitorProviderHighlightViewDto> highlights;
}
