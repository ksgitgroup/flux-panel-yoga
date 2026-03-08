package com.admin.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class XuiProtocolDirectoryDto {

    private Integer instanceCount;

    private Integer assetCount;

    private List<XuiProtocolSummaryViewDto> protocolSummaries;

    private List<XuiInboundDirectoryItemViewDto> items;
}
