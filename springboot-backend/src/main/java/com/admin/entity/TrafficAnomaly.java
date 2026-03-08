package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("traffic_anomaly")
@EqualsAndHashCode(callSuper = true)
public class TrafficAnomaly extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String dimensionType;
    private Long dimensionId;
    private String dimensionName;
    private String anomalyType;
    private String severity;
    private String description;
    private Long currentValue;
    private Long baselineValue;
    private Double deviationRatio;
    private Integer acknowledged;
}
