package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

@Data
public class AssetHostDto {

    @NotBlank(message = "资产名称不能为空")
    private String name;

    private String label;

    private String primaryIp;

    private String environment;

    private String provider;

    private String region;

    private String remark;
}
