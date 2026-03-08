package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("sys_permission")
@EqualsAndHashCode(callSuper = true)
public class IamPermission extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String code;

    private String name;

    private String moduleKey;

    private String description;

    private Integer sortOrder;

    private Integer enabled;
}
