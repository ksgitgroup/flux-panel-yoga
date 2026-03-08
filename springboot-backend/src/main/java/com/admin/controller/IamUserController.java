package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.IamUserDto;
import com.admin.common.dto.IamUserIdDto;
import com.admin.common.dto.IamUserRoleAssignDto;
import com.admin.common.dto.IamUserUpdateDto;
import com.admin.common.lang.R;
import com.admin.service.IamUserService;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/iam/user")
public class IamUserController extends BaseController {

    @Resource
    private IamUserService iamUserService;

    @LogAnnotation
    @RequireRole
    @PostMapping("/list")
    public R list() {
        return iamUserService.getAllUsers();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/detail")
    public R detail(@Validated @RequestBody IamUserIdDto dto) {
        return iamUserService.getUserDetail(dto.getId());
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/create")
    public R create(@Validated @RequestBody IamUserDto dto) {
        return iamUserService.createUser(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/update")
    public R update(@Validated @RequestBody IamUserUpdateDto dto) {
        return iamUserService.updateUser(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@Validated @RequestBody IamUserIdDto dto) {
        return iamUserService.deleteUser(dto.getId());
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/assign-roles")
    public R assignRoles(@Validated @RequestBody IamUserRoleAssignDto dto) {
        return iamUserService.assignRoles(dto);
    }
}
