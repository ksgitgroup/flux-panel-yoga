package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("sys_user")
@EqualsAndHashCode(callSuper = true)
public class IamUser extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String displayName;

    private String email;

    private String authSource;

    private String localUsername;

    private String encryptedPassword;

    private String mobile;

    private String jobTitle;

    private String dingtalkUserId;

    private String dingtalkUnionId;

    private String departmentPath;

    private Integer orgActive;

    private Integer enabled;

    private Long lastOrgSyncAt;

    private Long lastLoginAt;

    private String remark;

    /** 用户资产范围: NULL=继承角色, ALL=全部, SELECTED=指定, NONE=无 */
    private String assetScope;
}
