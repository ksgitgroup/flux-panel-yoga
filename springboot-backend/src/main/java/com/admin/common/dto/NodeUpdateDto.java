package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

@Data
public class NodeUpdateDto {

    @NotNull(message = "节点ID不能为空")
    private Long id;

    @NotBlank(message = "节点名称不能为空")
    private String name;

    @NotBlank(message = "节点IP不能为空")
    private String ip;
} 