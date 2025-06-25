package com.admin.common.dto;

import lombok.Data;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Min;
import javax.validation.constraints.Max;

@Data
public class TunnelUpdateDto {
    
    @NotNull(message = "隧道ID不能为空")
    private Long id;
    
    @NotBlank(message = "隧道名称不能为空")
    private String name;
    
    @NotNull(message = "流量计算类型不能为空")
    private Integer flow;
    
    @NotNull(message = "入口端口开始不能为空")
    @Min(value = 1, message = "入口端口开始必须大于0")
    @Max(value = 65535, message = "入口端口开始不能超过65535")
    private Integer inPortSta;
    
    @NotNull(message = "入口端口结束不能为空")
    @Min(value = 1, message = "入口端口结束必须大于0")
    @Max(value = 65535, message = "入口端口结束不能超过65535")
    private Integer inPortEnd;
    
    // 出口端口开始（对于隧道转发类型的隧道）
    @Min(value = 1, message = "出口端口开始必须大于等于0")
    @Max(value = 65535, message = "出口端口开始不能超过65535")
    private Integer outIpSta;
    
    // 出口端口结束（对于隧道转发类型的隧道）
    @Min(value = 1, message = "出口端口结束必须大于等于0")
    @Max(value = 65535, message = "出口端口结束不能超过65535")
    private Integer outIpEnd;
    
    // TCP监听地址
    private String tcpListenAddr;
    
    // UDP监听地址
    private String udpListenAddr;
} 