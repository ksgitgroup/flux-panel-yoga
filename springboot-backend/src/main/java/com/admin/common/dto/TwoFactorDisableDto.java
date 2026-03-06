package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Pattern;

@Data
public class TwoFactorDisableDto {

    @NotBlank(message = "当前密码不能为空")
    private String currentPassword;

    @NotBlank(message = "二步验证码不能为空")
    @Pattern(regexp = "^\\d{6}$", message = "二步验证码必须是6位数字")
    private String oneTimeCode;
}
