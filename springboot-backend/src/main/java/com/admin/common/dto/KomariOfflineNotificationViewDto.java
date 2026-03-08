package com.admin.common.dto;

import lombok.Data;

@Data
public class KomariOfflineNotificationViewDto {

    private Boolean enabled;

    private Integer gracePeriod;
}
