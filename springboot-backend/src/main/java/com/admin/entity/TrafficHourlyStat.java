package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("traffic_hourly_stats")
@EqualsAndHashCode(callSuper = true)
public class TrafficHourlyStat extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String dimensionType;
    private Long dimensionId;
    private String dimensionName;
    private String hourKey;
    private Long uploadBytes;
    private Long downloadBytes;
    private Long totalBytes;
    private Long peakRateBps;
}
