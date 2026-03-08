package com.admin.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class IamUserDetailDto {

    private IamUserViewDto user;

    private List<IamRoleViewDto> roles;
}
