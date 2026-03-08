package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.util.List;

@Data
public class IamRoleUpdateDto {

    @NotNull(message = "角色ID不能为空")
    private Long id;

    @NotBlank(message = "角色编码不能为空")
    private String code;

    @NotBlank(message = "角色名称不能为空")
    private String name;

    private String description;

    private String roleScope;

    private Integer sortOrder;

    private Integer enabled;

    private List<Long> permissionIds;
}
