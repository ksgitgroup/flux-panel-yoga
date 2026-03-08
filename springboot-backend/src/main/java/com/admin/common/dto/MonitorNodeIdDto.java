package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;

@Data
public class MonitorNodeIdDto {

    @NotNull(message = "节点 ID 不能为空")
    private Long id;
}
