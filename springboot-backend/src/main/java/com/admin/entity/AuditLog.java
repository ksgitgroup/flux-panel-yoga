package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("audit_log")
@EqualsAndHashCode(callSuper = true)
public class AuditLog extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String username;
    private String action;
    private String module;
    private Long targetId;
    private String targetName;
    private String detail;
    private String ip;
    private String userAgent;
    private String result;
    private String errorMsg;
}
