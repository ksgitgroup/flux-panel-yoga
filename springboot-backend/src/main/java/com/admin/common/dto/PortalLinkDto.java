package com.admin.common.dto;

import lombok.Data;

@Data
public class PortalLinkDto {

    private String id;

    private String groupName;

    private String title;

    private String href;

    private String description;

    private String abbr;

    private String environment;

    private String target;

    private Integer sortOrder;

    private Boolean enabled;
}
