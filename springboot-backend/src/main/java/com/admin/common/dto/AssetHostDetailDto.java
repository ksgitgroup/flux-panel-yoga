package com.admin.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class AssetHostDetailDto {

    private AssetHostViewDto asset;

    private List<XuiInstanceViewDto> xuiInstances;

    private List<XuiProtocolSummaryViewDto> protocolSummaries;

    private List<AssetForwardLinkViewDto> forwards;

    private List<MonitorNodeSnapshotViewDto> monitorNodes;

    private OnePanelInstanceViewDto onePanelInstance;

    /** 该资产关联的隧道（作为入口或出口） */
    private List<AssetTunnelLinkViewDto> tunnels;
}
