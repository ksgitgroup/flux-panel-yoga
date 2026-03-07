package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("xui_traffic_delta_event")
@EqualsAndHashCode(callSuper = true)
public class XuiTrafficDeltaEvent extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private Long instanceId;

    private String sourceToken;

    private String requestBody;

    private String receivedIp;
}
