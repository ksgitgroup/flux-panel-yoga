package com.admin.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class IamRoleDetailDto {

    private IamRoleViewDto role;

    private List<Long> permissionIds;

    private List<IamPermissionViewDto> permissions;

    private List<Long> assetIds;

    private List<Long> userIds;
}
