package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

@Data
public class OnePanelInstanceDto {

    @NotBlank(message = "实例名称不能为空")
    private String name;

    private Long assetId;

    private String panelUrl;

    private Integer reportEnabled;

    private String remark;
}
