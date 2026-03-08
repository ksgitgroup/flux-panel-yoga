package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("latency_matrix")
@EqualsAndHashCode(callSuper = true)
public class LatencyMatrix extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String fromRegion;
    private Long fromAssetId;
    private String toIp;
    private Long toAssetId;
    private Double latencyMs;
    private Double packetLoss;
    private Double jitterMs;
    private String testMethod;
}
