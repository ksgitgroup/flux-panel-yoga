package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("xui_inbound_snapshot")
@EqualsAndHashCode(callSuper = true)
public class XuiInboundSnapshot extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private Long instanceId;

    private Integer remoteInboundId;

    private String remark;

    private String tag;

    private String protocol;

    private String listen;

    private Integer port;

    private Integer enable;

    private Long expiryTime;

    private Long total;

    private Long up;

    private Long down;

    private Long allTime;

    private Integer clientCount;

    private Integer onlineClientCount;

    private String transportSummary;

    private String settingsDigest;

    private String streamSettingsDigest;

    private String sniffingDigest;

    private Long lastSyncAt;
}
