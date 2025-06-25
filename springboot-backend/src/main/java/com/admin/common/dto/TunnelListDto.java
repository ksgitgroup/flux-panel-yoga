package com.admin.common.dto;

import lombok.Data;

@Data
public class TunnelListDto {

    private Integer id;

    private String name;
    
    /**
     * 入口IP
     */
    private String ip;
    
    /**
     * 入口端口范围开始
     */
    private Integer inPortSta;
    
    /**
     * 入口端口范围结束
     */
    private Integer inPortEnd;
    
    /**
     * 出口IP
     */
    private String outIp;
    
    /**
     * 出口端口范围开始
     */
    private Integer outIpSta;
    
    /**
     * 出口端口范围结束
     */
    private Integer outIpEnd;
    
    /**
     * 隧道类型（1-端口转发，2-隧道转发）
     */
    private Integer type;
    
    /**
     * 协议类型
     */
    private String protocol;
}
