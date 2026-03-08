package com.admin.common.dto;

import lombok.Data;

@Data
public class OnePanelBackupSummaryDto {

    private String backupType;

    private String sourceName;

    private String lastRecordStatus;

    private Long lastBackupAt;

    private Integer snapshotCount;

    private Long latestSnapshotAt;
}
