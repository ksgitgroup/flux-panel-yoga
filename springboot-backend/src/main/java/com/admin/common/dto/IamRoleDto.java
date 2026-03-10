package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import java.util.List;

@Data
public class IamRoleDto {

    @NotBlank(message = "角色编码不能为空")
    private String code;

    @NotBlank(message = "角色名称不能为空")
    private String name;

    private String description;

    private String roleScope;

    private Integer sortOrder;

    private Integer enabled;

    private List<Long> permissionIds;

    private String assetScope;

    private List<Long> assetIds;
}
