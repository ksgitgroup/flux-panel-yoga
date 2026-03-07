package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("xui_client_snapshot")
@EqualsAndHashCode(callSuper = true)
public class XuiClientSnapshot extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private Long instanceId;

    private Integer remoteInboundId;

    private Integer remoteClientId;

    private String remoteClientKey;

    private String email;

    private Integer enable;

    private Long expiryTime;

    private Long total;

    private Long up;

    private Long down;

    private Long allTime;

    private Integer online;

    private Long lastOnlineAt;

    private String comment;

    private String subId;

    private Integer limitIp;

    private Integer resetDays;

    private Long lastSyncAt;
}
