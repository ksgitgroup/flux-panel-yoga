package com.admin.common.dto;

import lombok.Data;

/**
 * 资产关联的隧道视图 DTO
 */
@Data
public class AssetTunnelLinkViewDto {
    private Long id;
    private String name;
    /** 隧道类型：1=端口转发，2=隧道转发 */
    private Integer type;
    /** 入口节点名称 */
    private String inNodeName;
    /** 入口 IP */
    private String inIp;
    /** 出口节点名称（隧道转发才有） */
    private String outNodeName;
    /** 出口 IP */
    private String outIp;
    /** 协议（tls/quic 等） */
    private String protocol;
    /** 当前资产在隧道中的角色：source=入口, target=出口 */
    private String role;
    /** 关联的转发规则数量 */
    private int forwardCount;
}
