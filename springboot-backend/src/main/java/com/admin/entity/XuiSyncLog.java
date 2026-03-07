package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("xui_sync_log")
@EqualsAndHashCode(callSuper = true)
public class XuiSyncLog extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private Long instanceId;

    private String syncType;

    private Integer success;

    private String message;

    private String detailText;

    private Long startedAt;

    private Long finishedAt;

    private Long durationMs;
}
