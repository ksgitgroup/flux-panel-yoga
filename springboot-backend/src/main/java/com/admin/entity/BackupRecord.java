package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("backup_record")
@EqualsAndHashCode(callSuper = true)
public class BackupRecord extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String name;
    private String type;
    private Long sourceId;
    private String sourceName;
    private String filePath;
    private Long fileSize;
    private String backupData;
    private String triggerType;
    private String backupStatus;
    private String errorMsg;
    private String remark;
}
