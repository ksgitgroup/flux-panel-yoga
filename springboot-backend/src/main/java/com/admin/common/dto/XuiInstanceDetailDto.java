package com.admin.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class XuiInstanceDetailDto {

    private XuiInstanceViewDto instance;

    private List<XuiInboundSnapshotViewDto> inbounds;

    private List<XuiClientSnapshotViewDto> clients;
}
