package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.Max;
import javax.validation.constraints.Min;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

@Data
public class XuiInstanceUpdateDto {

    @NotNull(message = "实例 ID 不能为空")
    private Long id;

    @NotBlank(message = "实例名称不能为空")
    private String name;

    @NotBlank(message = "实例地址不能为空")
    private String baseUrl;

    private String webBasePath;

    @NotBlank(message = "登录用户名不能为空")
    private String username;

    private String password;

    private String loginSecret;

    private String hostLabel;

    private String managementMode;

    @NotNull(message = "请设置是否自动同步")
    private Integer syncEnabled;

    @NotNull(message = "同步间隔不能为空")
    @Min(value = 1, message = "同步间隔不能小于 1 分钟")
    @Max(value = 1440, message = "同步间隔不能超过 1440 分钟")
    private Integer syncIntervalMinutes;

    @NotNull(message = "请设置 TLS 验证策略")
    private Integer allowInsecureTls;

    private String remark;
}
