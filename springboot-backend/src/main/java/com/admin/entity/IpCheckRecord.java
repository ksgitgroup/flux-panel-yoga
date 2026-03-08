package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ip_check_record")
@EqualsAndHashCode(callSuper = true)
public class IpCheckRecord extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String ip;
    private Long assetId;
    private String assetName;
    private String checkType;
    private String blacklistResult;
    private Integer blacklistScore;
    private String geoInfo;
    private String portCheck;
    private String overallStatus;
}
