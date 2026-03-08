package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("onepanel_instance")
@EqualsAndHashCode(callSuper = true)
public class OnePanelInstance extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String name;

    private Long assetId;

    private String panelUrl;

    private String instanceKey;

    private String exporterTokenHash;

    private Integer reportEnabled;

    private String remark;

    private Long tokenIssuedAt;

    private Long lastReportAt;

    private String lastReportStatus;

    private String lastReportError;

    private String lastReportRemoteIp;

    private String exporterVersion;

    private String panelVersion;

    private String panelEdition;

    private Integer appCount;

    private Integer websiteCount;

    private Integer containerCount;

    private Integer cronjobCount;

    private Integer backupCount;
}
