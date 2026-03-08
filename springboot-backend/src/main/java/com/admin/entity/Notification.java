package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("notification")
@EqualsAndHashCode(callSuper = true)
public class Notification extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private Long userId;
    private String title;
    private String content;
    private String type;
    private String severity;
    private String sourceModule;
    private Long sourceId;
    private Integer readStatus;
    private Long readAt;
}
