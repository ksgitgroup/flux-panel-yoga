package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;
import java.util.List;

@Data
public class IamRolePermissionAssignDto {

    @NotNull(message = "角色ID不能为空")
    private Long roleId;

    private List<Long> permissionIds;
}
