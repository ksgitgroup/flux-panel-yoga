package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("server_group_member")
@EqualsAndHashCode(callSuper = true)
public class ServerGroupMember extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private Long groupId;
    private Long assetId;
    private String roleInGroup;
    private Integer sortOrder;
}
