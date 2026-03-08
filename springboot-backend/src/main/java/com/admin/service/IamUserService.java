package com.admin.service;

import com.admin.common.dto.IamUserDto;
import com.admin.common.dto.IamUserRoleAssignDto;
import com.admin.common.dto.IamUserUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.IamUser;
import com.baomidou.mybatisplus.extension.service.IService;

public interface IamUserService extends IService<IamUser> {

    R getAllUsers();

    R getUserDetail(Long id);

    R createUser(IamUserDto dto);

    R updateUser(IamUserUpdateDto dto);

    R deleteUser(Long id);

    R assignRoles(IamUserRoleAssignDto dto);
}
