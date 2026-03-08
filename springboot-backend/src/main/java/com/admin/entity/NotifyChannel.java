package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("notify_channel")
@EqualsAndHashCode(callSuper = true)
public class NotifyChannel extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String name;
    private String type;
    private String configJson;
    private Integer enabled;
    private String testStatus;
    private Long lastTestAt;
}
