package com.admin.common.dto;

import lombok.Data;

@Data
public class XuiProtocolSummaryViewDto {

    private String protocol;

    private Integer inboundCount;

    private Integer activeInboundCount;

    private Integer enabledInboundCount;

    private Integer disabledInboundCount;

    private Integer deletedInboundCount;

    private Integer clientCount;

    private Integer onlineClientCount;

    private Long up;

    private Long down;

    private Long allTime;

    private String portSummary;

    private String transportSummary;
}
