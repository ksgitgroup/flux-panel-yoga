package com.admin.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class IamUserViewDto {

    private Long id;

    private String displayName;

    private String email;

    private String authSource;

    private String localUsername;

    private String mobile;

    private String jobTitle;

    private String dingtalkUserId;

    private String departmentPath;

    private Integer orgActive;

    private Integer enabled;

    private Long lastOrgSyncAt;

    private Long lastLoginAt;

    private String remark;

    private List<Long> roleIds;

    private List<String> roleNames;

    /** 用户资产范围: null=继承角色 */
    private String assetScope;

    private Integer assetCount;

    private Long createdTime;

    private Long updatedTime;
}
