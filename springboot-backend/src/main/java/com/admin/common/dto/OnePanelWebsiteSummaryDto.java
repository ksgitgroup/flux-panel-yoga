package com.admin.common.dto;

import lombok.Data;

@Data
public class OnePanelWebsiteSummaryDto {

    private Long websiteId;

    private String name;

    private String primaryDomain;

    private String status;

    private Boolean httpsEnabled;

    private Long certExpireAt;

    private Integer proxyCount;

    private String runtimeName;
}
