package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("sys_login_audit")
@EqualsAndHashCode(callSuper = true)
public class IamLoginAudit extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private Long userId;

    private String authSource;

    private String loginChannel;

    private String principalName;

    private String principalEmail;

    private String dingtalkUnionId;

    private String remoteIp;

    private String userAgent;

    private Integer success;

    private String resultCode;

    private String resultMessage;
}
