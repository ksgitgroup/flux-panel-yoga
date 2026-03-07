package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("asset_host")
@EqualsAndHashCode(callSuper = true)
public class AssetHost extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String name;

    private String label;

    private String primaryIp;

    private String environment;

    private String provider;

    private String region;

    private String remark;
}
