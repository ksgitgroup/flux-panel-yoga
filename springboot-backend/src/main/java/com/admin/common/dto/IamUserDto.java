package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.Email;
import javax.validation.constraints.NotBlank;
import java.util.List;

@Data
public class IamUserDto {

    @NotBlank(message = "姓名不能为空")
    private String displayName;

    @Email(message = "邮箱格式不正确")
    @NotBlank(message = "企业邮箱不能为空")
    private String email;

    @NotBlank(message = "认证来源不能为空")
    private String authSource;

    private String localUsername;

    private String password;

    private String mobile;

    private String jobTitle;

    private String dingtalkUserId;

    private String dingtalkUnionId;

    private String departmentPath;

    private Integer orgActive;

    private Integer enabled;

    private String remark;

    private List<Long> roleIds;

    private String assetScope;

    private List<Long> assetIds;
}
