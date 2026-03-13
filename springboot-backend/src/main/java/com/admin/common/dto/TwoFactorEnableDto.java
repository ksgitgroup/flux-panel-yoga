package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Pattern;

@Data
public class TwoFactorEnableDto {

    /** SSO 用户无密码，该字段可选 */
    private String currentPassword;

    @NotBlank(message = "二步验证码不能为空")
    @Pattern(regexp = "^\\d{6}$", message = "二步验证码必须是6位数字")
    private String oneTimeCode;
}
