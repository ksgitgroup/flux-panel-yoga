package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("monitor_instance")
@EqualsAndHashCode(callSuper = true)
public class MonitorInstance extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String name;

    private String type;

    private String baseUrl;

    private String apiKey;

    private String username;

    private Integer syncEnabled;

    private Integer syncIntervalMinutes;

    private Integer allowInsecureTls;

    private String remark;

    private Long lastSyncAt;

    private String lastSyncStatus;

    private String lastSyncError;

    private Integer nodeCount;

    private Integer onlineNodeCount;
}
