package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("onepanel_snapshot_latest")
@EqualsAndHashCode(callSuper = true)
public class OnePanelSnapshotLatest extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private Long instanceId;

    private Long assetId;

    private Long reportTime;

    private String remoteIp;

    private String exporterVersion;

    private String panelVersion;

    private String panelEdition;

    private String payloadJson;
}
