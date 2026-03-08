package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("backup_schedule")
@EqualsAndHashCode(callSuper = true)
public class BackupSchedule extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String name;
    private String type;
    private Long sourceId;
    private String cronExpr;
    private Integer retentionCount;
    private Integer enabled;
    private Long lastRunAt;
    private String lastRunStatus;
}
