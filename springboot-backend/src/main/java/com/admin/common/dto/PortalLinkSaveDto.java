package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;
import java.util.List;

@Data
public class PortalLinkSaveDto {

    @NotNull(message = "导航配置不能为空")
    private List<PortalLinkDto> items;
}
