package com.admin.service;

import com.admin.common.dto.*;
import com.admin.common.lang.R;
import com.admin.entity.User;
import com.baomidou.mybatisplus.extension.service.IService;

/**
 * <p>
 *  服务类
 * </p>
 *
 * @author QAQ
 * @since 2025-06-03
 */
public interface UserService extends IService<User> {

    R login(LoginDto loginDto);

    R completeTwoFactorLogin(TwoFactorLoginDto twoFactorLoginDto);

    R createUser(UserDto userDto);

    R getAllUsers();

    R updateUser(UserUpdateDto userUpdateDto);

    R deleteUser(Long id);

    R getUserPackageInfo();

    R updatePassword(ChangePasswordDto changePasswordDto);

    R getTwoFactorStatus();

    R prepareTwoFactorSetup();

    R enableTwoFactor(TwoFactorEnableDto twoFactorEnableDto);

    R disableTwoFactor(TwoFactorDisableDto twoFactorDisableDto);

    R reset(ResetFlowDto resetFlowDto);
}
