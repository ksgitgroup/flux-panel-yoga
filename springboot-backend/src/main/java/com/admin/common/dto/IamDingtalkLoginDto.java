package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

@Data
public class IamDingtalkLoginDto {

    @NotBlank(message = "authCode 不能为空")
    private String authCode;

    @NotBlank(message = "state 不能为空")
    private String state;
}
