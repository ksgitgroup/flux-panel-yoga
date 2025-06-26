package com.admin.common.utils;


import com.admin.common.dto.GostConfigDto;
import com.admin.common.dto.GostDto;
import com.admin.common.task.CheckGostConfigAsync;
import com.admin.entity.Node;
import com.admin.service.NodeService;
import com.alibaba.fastjson.JSONObject;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import javax.annotation.Resource;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.UUID;


@Slf4j
public class WebSocketServer extends TextWebSocketHandler {

    @Resource
    NodeService nodeService;

    @Resource
    CheckGostConfigAsync checkGostConfigAsync;

    // 存储所有活跃的 WebSocket 连接（
    private static final CopyOnWriteArraySet<WebSocketSession> activeSessions = new CopyOnWriteArraySet<>();
    
    // 存储节点ID和对应的WebSocket session映射
    private static final ConcurrentHashMap<Long, WebSocketSession> nodeSessions = new ConcurrentHashMap<>();
    
    // 为每个session提供锁对象，防止并发发送消息
    private static final ConcurrentHashMap<String, Object> sessionLocks = new ConcurrentHashMap<>();
    
    // 存储等待响应的请求，key为requestId，value为CompletableFuture
    private static final ConcurrentHashMap<String, CompletableFuture<GostDto>> pendingRequests = new ConcurrentHashMap<>();

    //接受客户端消息
    @Override
    public void handleTextMessage(WebSocketSession session, TextMessage message) {
        try {
            if (StringUtils.isNoneBlank(message.getPayload())) {
                
                String id = session.getAttributes().get("id").toString();
                String type = session.getAttributes().get("type").toString();

                if (message.getPayload().contains("memory_usage")){
                    // 先发送确认消息
                    sendToUser(session, "{\"type\":\"call\"}");
                } else if (message.getPayload().contains("config_report")) {
                    log.info("收到消息: {}", message.getPayload());
                    JSONObject jsonObject = JSONObject.parseObject(message.getPayload());
                    String string = jsonObject.getString("data");
                    GostConfigDto gostConfigDto = JSONObject.parseObject(string, GostConfigDto.class);
                    checkGostConfigAsync.cleanNodeConfigs(id, gostConfigDto);
                } else if (message.getPayload().contains("requestId")) {
                    log.info("收到消息: {}", message.getPayload());
                    // 处理命令响应消息
                    try {
                        JSONObject responseJson = JSONObject.parseObject(message.getPayload());
                        String requestId = responseJson.getString("requestId");
                        String responseMessage = responseJson.getString("message");
                        String responseType = responseJson.getString("type");
                        JSONObject responseData = responseJson.getJSONObject("data");
                        
                        if (requestId != null) {
                            CompletableFuture<GostDto> future = pendingRequests.remove(requestId);
                            if (future != null) {
                                GostDto result = new GostDto();
                                
                                // 根据响应类型处理不同的数据
                                if ("PingResponse".equals(responseType) && responseData != null) {
                                    // 特殊处理ping响应，将完整的响应数据返回
                                    result.setMsg(responseMessage != null ? responseMessage : "OK");
                                    result.setData(responseData); // 保存ping详细结果
                                } else {
                                    // 其他类型的响应
                                    result.setMsg(responseMessage != null ? responseMessage : "无响应消息");
                                    if (responseData != null) {
                                        result.setData(responseData);
                                    }
                                }
                                
                                future.complete(result);
                            }
                        }
                    } catch (Exception e) {
                        log.error("处理响应消息失败: {}", e.getMessage(), e);
                    }
                } else {
                    log.info("收到消息: {}", message.getPayload());
                }

                // 如果是节点类型，转发消息给其他会话
                if (Objects.equals(type, "1")) {
                    JSONObject jsonObject = new JSONObject();
                    jsonObject.put("id", id);
                    jsonObject.put("type", "info");
                    jsonObject.put("data", message.getPayload());
                    String broadcastMessage = jsonObject.toJSONString();
                    
                    // 异步处理广播消息，避免阻塞当前线程
                    for (WebSocketSession targetSession : activeSessions) {
                        if (targetSession != null && targetSession.isOpen() && !targetSession.equals(session)) {
                            sendToUser(targetSession, broadcastMessage);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.error("处理WebSocket消息时发生异常: {}", e.getMessage(), e);
        }
    }

    // 建立连接
    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        try {
            String id = session.getAttributes().get("id").toString();
            String type = session.getAttributes().get("type").toString();
            
            if (!Objects.equals(type, "1")) {
                // 网页管理员连接
                activeSessions.add(session);
            } else {
                // 客户端节点连接
                Long nodeId = Long.valueOf(id);
                nodeSessions.put(nodeId, session);
                
                // 更新节点状态为在线
                Node byId = nodeService.getById(nodeId);
                if (byId != null) {
                    byId.setStatus(1);
                    nodeService.updateById(byId);
                    
                    // 广播节点上线状态给所有管理员
                    JSONObject res = new JSONObject();
                    res.put("id", id);
                    res.put("type", "status");
                    res.put("data", 1);
                    broadcastMessage(res.toJSONString());
                }
                
            }

        } catch (Exception e) {
            log.error("建立连接时发生异常: {}", e.getMessage(), e);
        }
    }

    // 连接关闭后
    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        try {
            String id = session.getAttributes().get("id").toString();
            String type = session.getAttributes().get("type").toString();
            String sessionId = session.getId();
            
            if (!Objects.equals(type, "1")) {
                // 连接关闭
                activeSessions.remove(session);
            } else {
                // 客户端节点连接关闭
                Long nodeId = Long.valueOf(id);
                nodeSessions.remove(nodeId);
                
                // 更新节点状态为离线
                Node byId = nodeService.getById(nodeId);
                if (byId != null) {
                    byId.setStatus(0);
                    nodeService.updateById(byId);
                    
                    JSONObject res = new JSONObject();
                    res.put("id", id);
                    res.put("type", "status");
                    res.put("data", 0);
                    broadcastMessage(res.toJSONString());
                }

            }
            
            // 清理session锁对象
            sessionLocks.remove(sessionId);
            
            // 清理该节点的待处理请求
            if (Objects.equals(type, "1")) {
                clearPendingRequestsForNode(Long.valueOf(id));
            }

        } catch (Exception e) {
            log.error("关闭连接时发生异常: {}", e.getMessage(), e);
        }
    }

    // 点对点发送消息
    @SneakyThrows
    public static void sendToUser(WebSocketSession socketSession, String message) {
        if (socketSession != null && socketSession.isOpen()) {
            String sessionId = socketSession.getId();
            Object lock = sessionLocks.computeIfAbsent(sessionId, k -> new Object());
            
            synchronized (lock) {
                try {
                    if (socketSession.isOpen()) {
                        socketSession.sendMessage(new TextMessage(message));
                    }
                } catch (Exception e) {
                    log.error("发送WebSocket消息失败 [sessionId={}]: {}", sessionId, e.getMessage());
                    cleanupSession(socketSession);
                }
            }
        } else {
            cleanupSession(socketSession);
        }
    }
    
    /**
     * 清理失效的session，自动识别是节点session还是管理员session
     */
    private static void cleanupSession(WebSocketSession session) {
        if (session == null) return;
        
        String sessionId = session.getId();
        
        // 清理session锁
        sessionLocks.remove(sessionId);
        
        boolean removedFromAdmin = activeSessions.remove(session);
        
        if (!removedFromAdmin) {
            nodeSessions.entrySet().removeIf(entry -> {
                if (entry.getValue() == session) {
                    return true;
                }
                return false;
            });
        }
    }

    // 广播消息
    public static void broadcastMessage(String message) {
        for (WebSocketSession session : activeSessions) {
            sendToUser(session, message);
        }
    }
    
    /**
     * 清理指定节点的待处理请求
     */
    private static void clearPendingRequestsForNode(Long nodeId) {
        // 完成所有待处理的请求，设置为连接断开错误
        pendingRequests.entrySet().removeIf(entry -> {
            CompletableFuture<GostDto> future = entry.getValue();
            if (!future.isDone()) {
                GostDto errorResult = new GostDto();
                errorResult.setMsg("节点连接已断开");
                future.complete(errorResult);
            }
            return true; // 移除所有请求
        });
    }


    public static GostDto send_msg(Long node_id, Object msg, String type) {
        WebSocketSession nodeSession = nodeSessions.get(node_id);

        if (nodeSession == null) {
            GostDto result = new GostDto();
            result.setMsg("节点不在线");
            return result;
        }

        if (!nodeSession.isOpen()) {
            nodeSessions.remove(node_id);
            sessionLocks.remove(nodeSession.getId());
            GostDto result = new GostDto();
            result.setMsg("节点连接已断开");
            return result;
        }

        // 生成唯一的请求ID
        String requestId = UUID.randomUUID().toString();
        
        // 创建CompletableFuture用于等待响应
        CompletableFuture<GostDto> future = new CompletableFuture<>();
        pendingRequests.put(requestId, future);

        try {
            JSONObject data = new JSONObject();
            data.put("type", type);
            data.put("data", msg);
            data.put("requestId", requestId);
            sendToUser(nodeSession, data.toJSONString());
            GostDto result = future.get(10, TimeUnit.SECONDS);
            return result;
            
        } catch (Exception e) {
            pendingRequests.remove(requestId);
            GostDto result = new GostDto();
            if (e instanceof java.util.concurrent.TimeoutException) {
                result.setMsg("等待响应超时");
            } else {
                result.setMsg("发送消息失败: " + e.getMessage());
            }
            log.error("发送消息到节点{}失败: {}", node_id, e.getMessage(), e);
            return result;
        }
    }

    
}
