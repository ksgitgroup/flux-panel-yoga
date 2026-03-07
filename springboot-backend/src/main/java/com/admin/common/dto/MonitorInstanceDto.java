package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

@Data
public class MonitorInstanceDto {

    @NotBlank(message = "实例名称不能为空")
    private String name;

    @NotBlank(message = "探针类型不能为空")
    private String type;

    @NotBlank(message = "服务端地址不能为空")
    private String baseUrl;

    private String apiKey;

    private Integer syncEnabled;

    private Integer syncIntervalMinutes;

    private Integer allowInsecureTls;

    private String remark;
}
