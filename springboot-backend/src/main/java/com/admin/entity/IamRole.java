package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("sys_role")
@EqualsAndHashCode(callSuper = true)
public class IamRole extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String code;

    private String name;

    private String description;

    private String roleScope;

    private Integer builtin;

    private Integer sortOrder;

    private Integer enabled;

    /** 资产范围: ALL=全部资产, SELECTED=指定资产 */
    private String assetScope;
}
