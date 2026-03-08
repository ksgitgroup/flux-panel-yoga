package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

@Data
public class OnePanelInstanceUpdateDto {

    @NotNull(message = "实例 ID 不能为空")
    private Long id;

    @NotBlank(message = "实例名称不能为空")
    private String name;

    private Long assetId;

    private String panelUrl;

    private Integer reportEnabled;

    private String remark;
}
