package com.admin.common.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

@Data
public class AlertRuleDto {

    private Long id;

    @NotBlank(message = "规则名称不能为空")
    private String name;

    @NotBlank(message = "指标不能为空")
    private String metric;

    private String operator;

    @NotNull(message = "阈值不能为空")
    private Double threshold;

    private Integer durationSeconds;

    private String scopeType;

    private String scopeValue;

    private String notifyType;

    private String notifyTarget;

    private Integer cooldownMinutes;

    private Integer enabled;

    private String probeCondition;
}
