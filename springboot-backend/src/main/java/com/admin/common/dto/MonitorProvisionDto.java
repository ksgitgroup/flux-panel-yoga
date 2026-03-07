package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;

@Data
public class MonitorProvisionDto {

    @NotNull(message = "探针实例 ID 不能为空")
    private Long instanceId;

    private String name;
}
