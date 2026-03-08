package com.admin.service;

import com.admin.common.dto.IamRoleDto;
import com.admin.common.dto.IamRolePermissionAssignDto;
import com.admin.common.dto.IamRoleUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.IamRole;
import com.baomidou.mybatisplus.extension.service.IService;

public interface IamRoleService extends IService<IamRole> {

    R getAllRoles();

    R getRoleDetail(Long id);

    R createRole(IamRoleDto dto);

    R updateRole(IamRoleUpdateDto dto);

    R deleteRole(Long id);

    R getAllPermissions();

    R assignPermissions(IamRolePermissionAssignDto dto);
}
