package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("xui_instance")
@EqualsAndHashCode(callSuper = true)
public class XuiInstance extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String name;

    private String baseUrl;

    private String webBasePath;

    private String username;

    private String encryptedPassword;

    private String encryptedLoginSecret;

    private String hostLabel;

    private String managementMode;

    private Integer syncEnabled;

    private Integer syncIntervalMinutes;

    private Integer allowInsecureTls;

    private String remark;

    private String trafficToken;

    private Long lastSyncAt;

    private String lastSyncStatus;

    private String lastSyncTrigger;

    private String lastSyncError;

    private Long lastTestAt;

    private String lastTestStatus;

    private String lastTestError;

    private Long lastTrafficPushAt;
}
