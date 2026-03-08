package com.admin.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class KomariNodeOperationsDetailDto {

    private Boolean publicVisible;

    private String publicNodeName;

    private String publicNodeRegion;

    private String publicNodeOs;

    private List<KomariPingTaskViewDto> pingTasks;

    private List<KomariLoadNotificationViewDto> loadNotifications;

    private List<KomariOfflineNotificationViewDto> offlineNotifications;
}
