package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;

@Data
public class AssetHostIdDto {

    @NotNull(message = "资产 ID 不能为空")
    private Long id;
}
