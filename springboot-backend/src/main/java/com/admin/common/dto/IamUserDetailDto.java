package com.admin.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class IamUserDetailDto {

    private IamUserViewDto user;

    private List<IamRoleViewDto> roles;

    /** 用户级资产ID列表 */
    private List<Long> assetIds;
}
