package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("sys_role_permission")
@EqualsAndHashCode(callSuper = true)
public class IamRolePermission extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private Long roleId;

    private Long permissionId;
}
