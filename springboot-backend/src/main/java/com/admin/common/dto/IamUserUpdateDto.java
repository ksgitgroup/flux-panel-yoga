package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.Email;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.util.List;

@Data
public class IamUserUpdateDto {

    @NotNull(message = "用户ID不能为空")
    private Long id;

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

    /** 用户资产范围: null=继承角色, ALL=全部, SELECTED=指定, NONE=无 */
    private String assetScope;

    private List<Long> assetIds;
}
