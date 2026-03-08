package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("sys_user_role")
@EqualsAndHashCode(callSuper = true)
public class IamUserRole extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private Long userId;

    private Long roleId;
}
