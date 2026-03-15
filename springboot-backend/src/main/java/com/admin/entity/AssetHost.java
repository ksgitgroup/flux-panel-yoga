package com.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
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

    private String ipv6;

    private String environment;

    private String provider;

    private String region;

    private String role;

    private String os;

    /** 操作系统类别: Windows/Ubuntu/Debian/CentOS/Alpine/Fedora/Arch/MacOS/Other */
    private String osCategory;

    private Integer cpuCores;

    private Integer memTotalMb;

    private Integer diskTotalGb;

    private Integer bandwidthMbps;

    private Integer monthlyTrafficGb;

    private Integer sshPort;

    private Long purchaseDate;

    private Long expireDate;

    private String monthlyCost;

    private String currency;

    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private String tags;

    private Long gostNodeId;

    private String monitorNodeUuid;

    private String pikaNodeId;

    // Probe-synced hardware detail fields
    private String cpuName;

    private String arch;

    private String virtualization;

    private String kernelVersion;

    private String gpuName;

    private Integer swapTotalMb;

    /** 核心用途 (简短描述服务器主要功能) */
    private String purpose;

    private String remark;

    /** 1Panel 面板地址 (e.g. https://ip:port) */
    private String panelUrl;

    /** JumpServer 资产 ID（UUID），绑定后「终端登录」直接使用该资产创建 ConnectionToken */
    private String jumpserverAssetId;

    /** 付费周期 (天): 30=月付, 90=季付, 180=半年付, 365=年付 */
    private Integer billingCycle;

    /** 用户手动编辑过的字段列表 (JSON数组, 如 ["tags","label"]), 同步时跳过这些字段 */
    private String userEditedFields;
}
