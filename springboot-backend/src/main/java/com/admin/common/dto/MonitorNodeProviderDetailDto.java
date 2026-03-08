package com.admin.common.dto;

import lombok.Data;

@Data
public class MonitorNodeProviderDetailDto {

    private Long nodeId;

    private String nodeName;

    private String instanceType;

    private PikaNodeSecurityDetailDto pikaSecurity;

    private KomariNodeOperationsDetailDto komariOperations;

    private String error;
}
