package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;

@Data
public class XuiInstanceIdDto {

    @NotNull(message = "实例 ID 不能为空")
    private Long id;
}
