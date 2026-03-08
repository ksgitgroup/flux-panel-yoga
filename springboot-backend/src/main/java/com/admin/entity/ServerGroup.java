package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("server_group")
@EqualsAndHashCode(callSuper = true)
public class ServerGroup extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String name;
    private String description;
    private String groupType;
    private String color;
    private String icon;
    private Long parentId;
    private Integer sortOrder;
}
