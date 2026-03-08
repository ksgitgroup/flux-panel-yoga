package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;
import java.util.List;

@Data
public class IamUserRoleAssignDto {

    @NotNull(message = "用户ID不能为空")
    private Long userId;

    private List<Long> roleIds;
}
