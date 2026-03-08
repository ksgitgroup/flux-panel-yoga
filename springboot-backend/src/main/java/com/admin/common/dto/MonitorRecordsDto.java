package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;

@Data
public class MonitorRecordsDto {

    @NotNull(message = "节点 ID 不能为空")
    private Long nodeId;

    /** Time range: 1h, 3h, 6h, 12h, 24h, 3d, 7d */
    private String range;

    /** Metric type: cpu, ram, disk, network, all (default: all) */
    private String type;
}
