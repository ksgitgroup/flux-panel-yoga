package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("sys_role_asset")
@EqualsAndHashCode(callSuper = true)
public class IamRoleAsset extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private Long roleId;

    private Long assetId;
}
