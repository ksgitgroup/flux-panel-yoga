package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;

@Data
public class KomariPingTaskDetailQueryDto {

    @NotNull(message = "节点 ID 不能为空")
    private Long nodeId;

    @NotNull(message = "任务 ID 不能为空")
    private Long taskId;

    private Integer hours;
}
