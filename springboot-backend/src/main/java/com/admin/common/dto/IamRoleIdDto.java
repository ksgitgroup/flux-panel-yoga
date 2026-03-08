package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;

@Data
public class IamRoleIdDto {

    @NotNull(message = "角色ID不能为空")
    private Long id;
}
