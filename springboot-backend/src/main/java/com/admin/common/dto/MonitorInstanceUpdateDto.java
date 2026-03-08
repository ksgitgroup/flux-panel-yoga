package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

@Data
public class MonitorInstanceUpdateDto {

    @NotNull(message = "实例 ID 不能为空")
    private Long id;

    @NotBlank(message = "实例名称不能为空")
    private String name;

    @NotBlank(message = "探针类型不能为空")
    private String type;

    @NotBlank(message = "服务端地址不能为空")
    private String baseUrl;

    private String apiKey;

    private String username;

    private Integer syncEnabled;

    private Integer syncIntervalMinutes;

    private Integer allowInsecureTls;

    private String remark;
}
