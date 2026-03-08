package com.admin.common.dto;

import lombok.Data;

@Data
public class IamRoleViewDto {

    private Long id;

    private String code;

    private String name;

    private String description;

    private String roleScope;

    private Integer builtin;

    private Integer sortOrder;

    private Integer enabled;

    private Integer userCount;

    private Integer permissionCount;

    private Long createdTime;

    private Long updatedTime;
}
