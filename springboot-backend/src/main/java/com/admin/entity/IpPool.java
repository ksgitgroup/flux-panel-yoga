package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * IP 池条目 — 管理出口 IP 资源
 * 关联 GOST landing 节点和转发规则，支持指纹浏览器代理配置导出
 */
@Data
@TableName("ip_pool")
@EqualsAndHashCode(callSuper = true)
public class IpPool extends BaseEntity {

    private static final long serialVersionUID = 1L;

    /** 名称标识 */
    private String name;
    /** 出口 IP 地址 */
    private String exitIp;
    /** 代理端口 */
    private Integer exitPort;
    /** 代理协议: socks5, http, https */
    private String protocol;
    /** 代理认证用户名 */
    private String proxyUser;
    /** 代理认证密码（加密存储） */
    private String proxyPass;
    /** 关联 GOST landing 节点 ID */
    private Long gostNodeId;
    /** 关联 GOST 转发规则 ID */
    private Long forwardId;
    /** 关联资产 ID */
    private Long assetId;
    /** IP 类型: datacenter, residential, mobile */
    private String ipType;
    /** 国家代码 (US, HK, JP...) */
    private String countryCode;
    /** 地区 */
    private String region;
    /** ISP */
    private String isp;
    /** ASN */
    private String asn;
    /** 健康状态: healthy, degraded, down */
    private String healthStatus;
    /** 健康分 0-100 */
    private Integer healthScore;
    /** 最后健康检查时间 */
    private Long lastHealthCheckAt;
    /** 风控评分 0-100 */
    private Integer riskScore;
    /** 是否黑名单 0=否 1=是 */
    private Integer blacklisted;
    /** 绑定的店铺 ID */
    private Long boundShopId;
    /** IP 冷却期结束时间 */
    private Long cooldownUntil;
    /** 轮换组 */
    private String rotationGroup;
    /** 用途标签 */
    private String usagePurpose;
    /** 标签 JSON */
    private String tags;
    /** 备注 */
    private String remark;
}
