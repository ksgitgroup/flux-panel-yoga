package com.admin.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class AssetHostDetailDto {

    private AssetHostViewDto asset;

    private List<XuiInstanceViewDto> xuiInstances;

    private List<XuiProtocolSummaryViewDto> protocolSummaries;

    private List<AssetForwardLinkViewDto> forwards;
}
