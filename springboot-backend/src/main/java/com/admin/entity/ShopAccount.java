package com.admin.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 店铺/账号实体 — 跨境电商社媒账号管理
 * 绑定 IP 池出口 + 指纹浏览器 profile，实现一账号一出口
 */
@Data
@TableName("shop_account")
@EqualsAndHashCode(callSuper = true)
public class ShopAccount extends BaseEntity {

    private static final long serialVersionUID = 1L;

    /** 店铺/账号名称 */
    private String name;
    /** 平台: tiktok, xiaohongshu, douyin, facebook, instagram, amazon, shopee, lazada */
    private String platform;
    /** 平台侧店铺 ID */
    private String shopExternalId;
    /** 登录账号 */
    private String loginAccount;
    /** 绑定的 IP 池条目 ID */
    private Long ipPoolId;
    /** 绑定的 GOST 转发规则 ID */
    private Long forwardId;
    /** 关联的服务器资产 ID */
    private Long assetId;
    /** 指纹浏览器类型: ziniao, ads, other */
    private String browserType;
    /** 指纹浏览器 profile ID */
    private String browserProfileId;
    /** 代理配置快照 JSON（导出给浏览器的完整配置）*/
    private String proxyConfigSnapshot;
    /** 最后一次代理配置导出时间 */
    private Long lastProxyExportAt;
    /** 账号状态: active, suspended, banned, cooldown */
    private String accountStatus;
    /** 最后登录时间 */
    private Long lastLoginAt;
    /** 环境: 生产, 测试 */
    private String environment;
    /** 团队/部门 */
    private String team;
    /** 负责人 */
    private String operator;
    /** 标签 JSON */
    private String tags;
    /** 备注 */
    private String remark;
}
