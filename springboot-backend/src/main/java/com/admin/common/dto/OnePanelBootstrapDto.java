package com.admin.common.dto;

import lombok.Data;

@Data
public class OnePanelBootstrapDto {

    private OnePanelInstanceViewDto instance;

    private String nodeToken;

    private String envTemplate;

    private String installSnippet;
}
