package com.admin.common.dto;

import lombok.Data;

@Data
public class IamPermissionViewDto {

    private Long id;

    private String code;

    private String name;

    private String moduleKey;

    private String description;

    private Integer sortOrder;

    private Integer enabled;
}
