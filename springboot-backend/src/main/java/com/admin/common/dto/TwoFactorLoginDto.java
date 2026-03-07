package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

@Data
public class TwoFactorLoginDto {

    @NotBlank(message = "二步验证挑战不能为空")
    private String challengeToken;

    @NotBlank(message = "二步验证码不能为空")
    private String twoFactorCode;
}
