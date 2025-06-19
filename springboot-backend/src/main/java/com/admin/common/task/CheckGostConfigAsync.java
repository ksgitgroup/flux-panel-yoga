package com.admin.common.task;

import com.admin.common.dto.ConfigItem;
import com.admin.common.dto.GostConfigDto;
import com.admin.common.utils.GostUtil;
import com.admin.entity.Forward;
import com.admin.entity.Node;
import com.admin.entity.SpeedLimit;
import com.admin.service.ForwardService;
import com.admin.service.NodeService;
import com.admin.service.SpeedLimitService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import javax.annotation.Resource;
import java.util.List;
import java.util.Objects;

@Slf4j
@Configuration
@EnableScheduling
public class CheckGostConfigAsync {

    @Resource
    private NodeService nodeService;

    @Resource
    private ForwardService forwardService;

    @Resource
    private SpeedLimitService speedLimitService;

    /**
     * 启动后10秒执行一次，然后每10分钟执行一次
     * 清理孤立的Gost配置项
     */
    @Scheduled(initialDelay = 10000, fixedRate = 600000)
    public void cleanOrphanedGostConfigs() {
        log.info("开始清理孤立的Gost配置项");
        
        List<Node> activeNodes = nodeService.list(new QueryWrapper<Node>().eq("status", 1));
        log.info("找到 {} 个活跃节点", activeNodes.size());
        
        for (Node node : activeNodes) {
            cleanNodeConfigs(node);
        }
        
        log.info("Gost配置清理任务完成");
    }

    /**
     * 清理单个节点的配置
     */
    private void cleanNodeConfigs(Node node) {
        String nodeAddress = node.getIp() + ":" + node.getPort();
        
        try {
            GostConfigDto gostConfig = GostUtil.GetConfig(nodeAddress, node.getSecret());
            
            cleanOrphanedServices(gostConfig, node);
            cleanOrphanedChains(gostConfig, node);
            cleanOrphanedLimiters(gostConfig, node);
            
        } catch (Exception e) {
            log.error("清理节点 {} 配置时发生错误", nodeAddress, e);
        }
    }

    /**
     * 清理孤立的服务
     */
    private void cleanOrphanedServices(GostConfigDto gostConfig, Node node) {
        if (gostConfig.getServices() == null) {
            return;
        }
        
        String nodeAddress = node.getIp() + ":" + node.getPort();
        
        for (ConfigItem service : gostConfig.getServices()) {
            safeExecute(() -> {
                if (Objects.equals(service.getName(), "web_api")) {
                    return; // 排除API服务
                }
                
                String[] serviceIds = parseServiceName(service.getName());
                if (serviceIds.length == 4) {
                    String forwardId = serviceIds[0];
                    String userId = serviceIds[1];
                    String userTunnelId = serviceIds[2];
                    String type = serviceIds[3];
                    
                    if (Objects.equals(type, "tcp")) { // 只处理TCP，避免重复处理
                        Forward forward = forwardService.getById(forwardId);
                        if (forward == null) {
                            log.warn("删除孤立的服务: {} (节点: {})", service.getName(), nodeAddress);
                            GostUtil.DeleteService(nodeAddress, forwardId+"_"+userId+"_"+userTunnelId, node.getSecret());
                        }
                    }
                }
            }, "清理服务 " + service.getName());
        }
    }

    /**
     * 清理孤立的链
     */
    private void cleanOrphanedChains(GostConfigDto gostConfig, Node node) {
        if (gostConfig.getChains() == null) {
            return;
        }
        
        String nodeAddress = node.getIp() + ":" + node.getPort();
        
        for (ConfigItem chain : gostConfig.getChains()) {
            safeExecute(() -> {
                String[] serviceIds = parseServiceName(chain.getName());
                if (serviceIds.length == 4) {
                    String forwardId = serviceIds[0];
                    String userId = serviceIds[1];
                    String userTunnelId = serviceIds[2];
                    String type = serviceIds[3];
                    
                    if (Objects.equals(type, "chains")) {
                        Forward forward = forwardService.getById(forwardId);
                        if (forward == null) {
                            log.warn("删除孤立的链: {} (节点: {})", chain.getName(), nodeAddress);
                            GostUtil.DeleteChains(nodeAddress, forwardId+"_"+userId+"_"+userTunnelId, node.getSecret());
                        }
                    }
                }
            }, "清理链 " + chain.getName());
        }
    }

    /**
     * 清理孤立的限流器
     */
    private void cleanOrphanedLimiters(GostConfigDto gostConfig, Node node) {
        if (gostConfig.getLimiters() == null) {
            return;
        }
        
        String nodeAddress = node.getIp() + ":" + node.getPort();
        
        for (ConfigItem limiter : gostConfig.getLimiters()) {
            safeExecute(() -> {
                SpeedLimit speedLimit = speedLimitService.getById(limiter.getName());
                if (speedLimit == null) {
                    log.warn("删除孤立的限流器: {} (节点: {})", limiter.getName(), nodeAddress);
                    GostUtil.DeleteLimiters(nodeAddress, Long.parseLong(limiter.getName()), node.getSecret());
                }
            }, "清理限流器 " + limiter.getName());
        }
    }

    /**
     * 安全执行操作，捕获异常
     */
    private void safeExecute(Runnable operation, String operationDesc) {
        try {
            operation.run();
        } catch (Exception e) {
            log.error("执行操作失败: {}", operationDesc, e);
        }
    }

    /**
     * 解析服务名称
     */
    private String[] parseServiceName(String serviceName) {
        return serviceName.split("_");
    }
}
