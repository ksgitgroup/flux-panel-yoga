package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("sys_session")
@EqualsAndHashCode(callSuper = true)
public class IamSession extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private Long userId;

    private String authSource;

    private String loginChannel;

    private String displayName;

    private String email;

    private String ipAddress;

    private String userAgent;

    private Long expiresAt;

    private Long lastSeenAt;

    private Long revokedAt;

    private String revokeReason;
}
