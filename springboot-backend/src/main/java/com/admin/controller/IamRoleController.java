package com.admin.controller;

import com.admin.common.annotation.RequireRole;
import com.admin.common.aop.LogAnnotation;
import com.admin.common.dto.IamRoleDto;
import com.admin.common.dto.IamRoleIdDto;
import com.admin.common.dto.IamRolePermissionAssignDto;
import com.admin.common.dto.IamRoleUpdateDto;
import com.admin.common.lang.R;
import com.admin.service.IamRoleService;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;

@RestController
@CrossOrigin
@RequestMapping("/api/v1/iam/role")
public class IamRoleController extends BaseController {

    @Resource
    private IamRoleService iamRoleService;

    @LogAnnotation
    @RequireRole
    @PostMapping("/list")
    public R list() {
        return iamRoleService.getAllRoles();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/detail")
    public R detail(@Validated @RequestBody IamRoleIdDto dto) {
        return iamRoleService.getRoleDetail(dto.getId());
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/create")
    public R create(@Validated @RequestBody IamRoleDto dto) {
        return iamRoleService.createRole(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/update")
    public R update(@Validated @RequestBody IamRoleUpdateDto dto) {
        return iamRoleService.updateRole(dto);
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/delete")
    public R delete(@Validated @RequestBody IamRoleIdDto dto) {
        return iamRoleService.deleteRole(dto.getId());
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/permissions")
    public R permissions() {
        return iamRoleService.getAllPermissions();
    }

    @LogAnnotation
    @RequireRole
    @PostMapping("/assign-permissions")
    public R assignPermissions(@Validated @RequestBody IamRolePermissionAssignDto dto) {
        return iamRoleService.assignPermissions(dto);
    }
}
