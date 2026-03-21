package com.admin.entity;

import java.io.Serializable;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * <p>
 * 
 * </p>
 *
 * @author QAQ
 * @since 2025-06-03
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class Node extends BaseEntity {

    private static final long serialVersionUID = 1L;

    private String name;

    private String secret;

    private String ip;

    private String serverIp;

    private String version;

    private Integer portSta;

    private Integer portEnd;

    private Long assetId;

    /**
     * 部署位置: overseas=海外, domestic_cloud=国内云, domestic_ix=国内IX专线, domestic_idc=国内自建机房
     */
    private String deployLocation;

    /**
     * GOST Web API 地址 (如 http://IP:18080)，用于远程配置下发
     */
    private String apiUrl;

}
