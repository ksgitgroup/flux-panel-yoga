package com.admin.common.dto;

import lombok.Data;

@Data
public class MonitorProviderHighlightViewDto {

    private String title;

    private String category;

    private String detail;

    private String severity;

    private Integer count;

    private Long timestamp;
}
