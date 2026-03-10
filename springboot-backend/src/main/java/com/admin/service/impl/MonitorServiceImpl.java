package com.admin.service.impl;

import com.admin.common.dto.*;
import com.admin.common.lang.R;
import com.admin.entity.AssetHost;
import com.admin.entity.MonitorInstance;
import com.admin.entity.MonitorMetricLatest;
import com.admin.entity.MonitorNodeSnapshot;
import com.admin.mapper.AssetHostMapper;
import com.admin.mapper.MonitorInstanceMapper;
import com.admin.mapper.MonitorMetricLatestMapper;
import com.admin.mapper.MonitorNodeSnapshotMapper;
import com.admin.common.auth.AuthContext;
import com.admin.common.auth.AuthPrincipal;
import com.admin.service.AlertService;
import com.admin.service.MonitorService;
import com.admin.service.NodeService;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.conn.ssl.NoopHostnameVerifier;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.impl.conn.PoolingHttpClientConnectionManager;
import org.apache.http.ssl.SSLContexts;
import org.apache.http.ssl.TrustStrategy;
import org.apache.http.util.EntityUtils;
import com.admin.common.utils.SimpleCircuitBreaker;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import javax.net.ssl.SSLContext;
import java.nio.charset.StandardCharsets;
import java.net.URLEncoder;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class MonitorServiceImpl extends ServiceImpl<MonitorInstanceMapper, MonitorInstance> implements MonitorService {

    private static final String STATUS_NEVER = "never";
    private static final String STATUS_SUCCESS = "success";
    private static final String STATUS_FAILED = "failed";
    private static final String TYPE_KOMARI = "komari";
    private static final String TYPE_PIKA = "pika";

    /** 熔断器：连续 3 次失败后熔断，30 秒后半开试探 */
    private static final SimpleCircuitBreaker circuitBreaker = new SimpleCircuitBreaker(3, 30_000);

    /** 连接池复用：标准 TLS */
    private static final CloseableHttpClient POOLED_CLIENT;
    /** 连接池复用：跳过 TLS 验证 */
    private static final CloseableHttpClient POOLED_INSECURE_CLIENT;

    static {
        PoolingHttpClientConnectionManager cm = new PoolingHttpClientConnectionManager();
        cm.setMaxTotal(50);
        cm.setDefaultMaxPerRoute(10);
        POOLED_CLIENT = HttpClients.custom().setConnectionManager(cm).build();

        try {
            TrustStrategy trustAll = (chain, authType) -> true;
            SSLContext sslCtx = SSLContexts.custom().loadTrustMaterial(null, trustAll).build();
            PoolingHttpClientConnectionManager cmInsecure = new PoolingHttpClientConnectionManager();
            cmInsecure.setMaxTotal(50);
            cmInsecure.setDefaultMaxPerRoute(10);
            POOLED_INSECURE_CLIENT = HttpClients.custom()
                    .setConnectionManager(cmInsecure)
                    .setSSLContext(sslCtx)
                    .setSSLHostnameVerifier(NoopHostnameVerifier.INSTANCE)
                    .build();
        } catch (Exception e) {
            throw new ExceptionInInitializerError("Failed to init insecure HttpClient: " + e.getMessage());
        }
    }

    @Resource
    private MonitorInstanceMapper monitorInstanceMapper;

    @Resource
    private MonitorNodeSnapshotMapper monitorNodeSnapshotMapper;

    @Resource
    private MonitorMetricLatestMapper monitorMetricLatestMapper;

    @Resource
    private AssetHostMapper assetHostMapper;

    @Resource
    private AlertService alertService;

    @Resource
    private NodeService nodeService;

    // ==================== CRUD ====================

    @Override
    public R getAllInstances() {
        List<MonitorInstance> instances = this.list(new LambdaQueryWrapper<MonitorInstance>()
                .orderByDesc(MonitorInstance::getUpdatedTime, MonitorInstance::getId));
        List<MonitorInstanceViewDto> views = instances.stream().map(this::toInstanceView).collect(Collectors.toList());
        return R.ok(views);
    }

    @Override
    public R getInstanceDetail(Long id) {
        MonitorInstance instance = getRequiredInstance(id);
        MonitorInstanceViewDto view = toInstanceView(instance);

        List<MonitorNodeSnapshot> nodes = monitorNodeSnapshotMapper.selectList(new LambdaQueryWrapper<MonitorNodeSnapshot>()
                .eq(MonitorNodeSnapshot::getInstanceId, id)
                .orderByDesc(MonitorNodeSnapshot::getOnline)
                .orderByAsc(MonitorNodeSnapshot::getName));

        List<MonitorNodeSnapshotViewDto> nodeViews = buildNodeViews(nodes, instance.getName());
        MonitorInstanceDetailDto detail = new MonitorInstanceDetailDto();
        detail.setInstance(view);
        detail.setNodes(nodeViews);
        try {
            detail.setProviderSummary(buildProviderSummary(instance, nodes));
        } catch (Exception e) {
            detail.setProviderSummaryError(shortenError(e.getMessage()));
            log.warn("[MonitorDetail] Failed to build provider summary for {}: {}", instance.getName(), e.getMessage());
        }
        return R.ok(detail);
    }

    @Override
    public R getNodeProviderDetail(Long nodeId) {
        MonitorNodeSnapshot node = getRequiredNode(nodeId);
        MonitorInstance instance = getRequiredInstance(node.getInstanceId());

        MonitorNodeProviderDetailDto detail = new MonitorNodeProviderDetailDto();
        detail.setNodeId(node.getId());
        detail.setNodeName(firstNonBlank(node.getName(), node.getIp(), node.getRemoteNodeUuid()));
        detail.setInstanceType(instance.getType());

        try {
            if (TYPE_PIKA.equalsIgnoreCase(instance.getType())) {
                detail.setPikaSecurity(loadPikaNodeSecurityDetail(instance, node));
            } else if (TYPE_KOMARI.equalsIgnoreCase(instance.getType())) {
                detail.setKomariOperations(loadKomariNodeOperationsDetail(instance, node));
            }
        } catch (Exception e) {
            detail.setError(shortenError(e.getMessage()));
            log.warn("[MonitorDetail] Failed to load provider detail for node {}: {}", nodeId, e.getMessage());
        }

        return R.ok(detail);
    }

    @Override
    public R getKomariPingTaskDetail(Long nodeId, Long taskId, Integer hours) {
        MonitorNodeSnapshot node = getRequiredNode(nodeId);
        MonitorInstance instance = getRequiredInstance(node.getInstanceId());
        if (!TYPE_KOMARI.equalsIgnoreCase(instance.getType())) {
            return R.err("仅 Komari 节点支持 Ping 任务记录下钻");
        }
        if (taskId == null || taskId <= 0) {
            return R.err("任务 ID 不合法");
        }
        try {
            return R.ok(loadKomariPingTaskDetail(instance, node, taskId, hours));
        } catch (Exception e) {
            log.warn("[MonitorDetail] Failed to load Komari ping task detail for node {} task {}: {}", nodeId, taskId, e.getMessage());
            return R.err("获取 Ping 任务记录失败: " + shortenError(e.getMessage()));
        }
    }

    @Override
    public R createInstance(MonitorInstanceDto dto) {
        validateDuplicateName(dto.getName(), null);
        long now = System.currentTimeMillis();
        MonitorInstance instance = new MonitorInstance();
        applyDto(instance, dto.getName(), dto.getType(), dto.getBaseUrl(), dto.getApiKey(),
                dto.getUsername(), dto.getSyncEnabled(), dto.getSyncIntervalMinutes(), dto.getAllowInsecureTls(), dto.getRemark());
        instance.setLastSyncStatus(STATUS_NEVER);
        instance.setNodeCount(0);
        instance.setOnlineNodeCount(0);
        instance.setCreatedTime(now);
        instance.setUpdatedTime(now);
        instance.setStatus(0);
        this.save(instance);
        return R.ok(toInstanceView(instance));
    }

    @Override
    public R updateInstance(MonitorInstanceUpdateDto dto) {
        MonitorInstance instance = getRequiredInstance(dto.getId());
        validateDuplicateName(dto.getName(), dto.getId());
        applyDto(instance, dto.getName(), dto.getType(), dto.getBaseUrl(), dto.getApiKey(),
                dto.getUsername(), dto.getSyncEnabled(), dto.getSyncIntervalMinutes(), dto.getAllowInsecureTls(), dto.getRemark());
        instance.setUpdatedTime(System.currentTimeMillis());
        this.updateById(instance);
        return R.ok(toInstanceView(instance));
    }

    @Override
    public R deleteInstance(Long id) {
        MonitorInstance instance = getRequiredInstance(id);

        // Clean up asset references before deleting snapshots
        List<MonitorNodeSnapshot> nodes = monitorNodeSnapshotMapper.selectList(
                new LambdaQueryWrapper<MonitorNodeSnapshot>()
                        .eq(MonitorNodeSnapshot::getInstanceId, id)
                        .isNotNull(MonitorNodeSnapshot::getAssetId));
        for (MonitorNodeSnapshot node : nodes) {
            if (node.getAssetId() != null && node.getRemoteNodeUuid() != null) {
                AssetHost asset = assetHostMapper.selectById(node.getAssetId());
                if (asset != null) {
                    boolean updated = false;
                    if (node.getRemoteNodeUuid().equals(asset.getMonitorNodeUuid())) {
                        asset.setMonitorNodeUuid("");
                        updated = true;
                    }
                    if (node.getRemoteNodeUuid().equals(asset.getPikaNodeId())) {
                        asset.setPikaNodeId("");
                        updated = true;
                    }
                    if (updated) {
                        assetHostMapper.updateById(asset);
                    }
                }
            }
        }
        log.info("删除探针实例 [{}](type={}), 清理了 {} 个节点的资产关联",
                instance.getName(), instance.getType(), nodes.size());

        monitorMetricLatestMapper.delete(new LambdaQueryWrapper<MonitorMetricLatest>()
                .eq(MonitorMetricLatest::getInstanceId, id));
        monitorNodeSnapshotMapper.delete(new LambdaQueryWrapper<MonitorNodeSnapshot>()
                .eq(MonitorNodeSnapshot::getInstanceId, id));
        this.removeById(id);
        return R.ok();
    }

    // ==================== Sync & Test ====================

    @Override
    public R testConnection(Long id) {
        MonitorInstance instance = getRequiredInstance(id);
        long now = System.currentTimeMillis();
        try {
            if (TYPE_PIKA.equalsIgnoreCase(instance.getType())) {
                // Pika: test by logging in with username/password
                String jwt = loginPika(instance);
                if (jwt == null) {
                    throw new RuntimeException("Pika login failed - check username/password");
                }
            } else {
                // Komari: test by calling /api/version
                String response = httpGet(instance, "/api/version", instance.getAllowInsecureTls());
                if (response == null) {
                    throw new RuntimeException("Empty response from monitor server");
                }
            }
            instance.setLastSyncStatus(STATUS_SUCCESS);
            instance.setLastSyncError("");
            instance.setLastSyncAt(now);
            instance.setUpdatedTime(now);
            this.updateById(instance);
            return R.ok("Connection successful");
        } catch (Exception e) {
            instance.setLastSyncStatus(STATUS_FAILED);
            instance.setLastSyncError(e.getMessage());
            instance.setLastSyncAt(now);
            instance.setUpdatedTime(now);
            this.updateById(instance);
            return R.err("Connection failed: " + e.getMessage());
        }
    }

    @Override
    public R syncInstance(Long id) {
        MonitorInstance instance = getRequiredInstance(id);
        try {
            Map<String, Object> summary = performSync(instance);
            return R.ok(summary);
        } catch (Exception e) {
            log.error("[MonitorSync] Manual sync failed for instance {}: {}", instance.getName(), e.getMessage());
            return R.err("Sync failed: " + e.getMessage());
        }
    }

    @Override
    public void autoSyncEligibleInstances() {
        List<MonitorInstance> instances = this.list(new LambdaQueryWrapper<MonitorInstance>()
                .eq(MonitorInstance::getSyncEnabled, 1)
                .eq(MonitorInstance::getStatus, 0));
        long now = System.currentTimeMillis();
        for (MonitorInstance instance : instances) {
            int intervalMs = (instance.getSyncIntervalMinutes() != null ? instance.getSyncIntervalMinutes() : 5) * 60_000;
            if (instance.getLastSyncAt() != null && (now - instance.getLastSyncAt()) < intervalMs) {
                continue;
            }
            try {
                performSync(instance);
            } catch (Exception e) {
                log.warn("[MonitorSync] Auto sync failed for {}: {}", instance.getName(), e.getMessage());
            }
        }

        // Evaluate alert rules after all syncs complete
        try {
            alertService.evaluateAlerts();
        } catch (Exception e) {
            log.warn("[MonitorSync] Alert evaluation failed: {}", e.getMessage());
        }
    }

    @Override
    public R getNodesByAssetId(Long assetId) {
        List<MonitorNodeSnapshot> nodes = monitorNodeSnapshotMapper.selectList(new LambdaQueryWrapper<MonitorNodeSnapshot>()
                .eq(MonitorNodeSnapshot::getAssetId, assetId));
        return R.ok(buildNodeViews(nodes, null));
    }

    @Override
    public R getAllUnboundNodes() {
        List<MonitorNodeSnapshot> nodes = monitorNodeSnapshotMapper.selectList(new LambdaQueryWrapper<MonitorNodeSnapshot>()
                .isNull(MonitorNodeSnapshot::getAssetId)
                .ne(MonitorNodeSnapshot::getStatus, -1));
        return R.ok(buildNodeViews(nodes, null));
    }

    @Override
    public R getDashboardNodes() {
        // Only return nodes linked to assets for consistency with assets page
        List<MonitorNodeSnapshot> allNodes = monitorNodeSnapshotMapper.selectList(
                new LambdaQueryWrapper<MonitorNodeSnapshot>()
                        .ne(MonitorNodeSnapshot::getStatus, -1)
                        .isNotNull(MonitorNodeSnapshot::getAssetId)
                        .and(w -> w.isNull(MonitorNodeSnapshot::getAssetUnlinked)
                                .or().ne(MonitorNodeSnapshot::getAssetUnlinked, 1))
                        .orderByDesc(MonitorNodeSnapshot::getOnline)
                        .orderByAsc(MonitorNodeSnapshot::getName));
        if (allNodes.isEmpty()) {
            return R.ok(Collections.emptyMap());
        }

        // Build instance name map
        List<MonitorInstance> instances = this.list();
        Map<Long, String> instanceNameMap = instances.stream()
                .collect(Collectors.toMap(MonitorInstance::getId, MonitorInstance::getName, (a, b) -> a));

        // Build node views with metrics
        List<MonitorNodeSnapshotViewDto> nodeViews = buildNodeViews(allNodes, null);
        for (MonitorNodeSnapshotViewDto nv : nodeViews) {
            if (nv.getInstanceName() == null) {
                nv.setInstanceName(instanceNameMap.get(nv.getInstanceId()));
            }
        }

        // Build asset name map for nodes with assetId
        Set<Long> assetIds = allNodes.stream()
                .map(MonitorNodeSnapshot::getAssetId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, AssetHost> assetMap = new HashMap<>();
        if (!assetIds.isEmpty()) {
            List<AssetHost> assets = assetHostMapper.selectBatchIds(assetIds);
            for (AssetHost a : assets) {
                assetMap.put(a.getId(), a);
            }
        }
        for (MonitorNodeSnapshotViewDto nv : nodeViews) {
            if (nv.getAssetId() != null) {
                AssetHost a = assetMap.get(nv.getAssetId());
                if (a != null) {
                    if (nv.getAssetName() == null) nv.setAssetName(a.getName());
                    nv.setProvider(a.getProvider());
                    nv.setLabel(a.getLabel());
                    nv.setBandwidthMbps(a.getBandwidthMbps());
                    nv.setSshPort(a.getSshPort());
                    nv.setPanelUrl(a.getPanelUrl());
                    nv.setRemark(a.getRemark());
                    nv.setPurchaseDate(a.getPurchaseDate());
                    nv.setMonthlyCost(a.getMonthlyCost());
                    nv.setPurpose(a.getPurpose());
                    // Use asset tags as the single source of truth for tag display
                    if (a.getTags() != null) nv.setTags(a.getTags());
                }
            }
        }

        // Populate peer probe info (same assetId, different instance type)
        Map<Long, List<MonitorNodeSnapshotViewDto>> assetNodeMap = new HashMap<>();
        for (MonitorNodeSnapshotViewDto nv : nodeViews) {
            if (nv.getAssetId() != null) {
                assetNodeMap.computeIfAbsent(nv.getAssetId(), k -> new ArrayList<>()).add(nv);
            }
        }
        for (List<MonitorNodeSnapshotViewDto> group : assetNodeMap.values()) {
            if (group.size() >= 2) {
                for (MonitorNodeSnapshotViewDto nv : group) {
                    for (MonitorNodeSnapshotViewDto peer : group) {
                        if (!peer.getId().equals(nv.getId()) && !Objects.equals(peer.getInstanceType(), nv.getInstanceType())) {
                            nv.setPeerNodeId(peer.getId());
                            nv.setPeerInstanceType(peer.getInstanceType());
                            break;
                        }
                    }
                }
            }
        }

        // 按资产范围过滤（非管理员只能看到有权限的资产关联的节点）
        List<MonitorNodeSnapshotViewDto> filteredViews = filterNodeViewsByAssetScope(nodeViews);

        long online = filteredViews.stream().filter(n -> n.getOnline() != null && n.getOnline() == 1).count();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("nodes", filteredViews);
        result.put("total", filteredViews.size());
        result.put("online", online);
        result.put("offline", filteredViews.size() - online);
        return R.ok(result);
    }

    private List<MonitorNodeSnapshotViewDto> filterNodeViewsByAssetScope(List<MonitorNodeSnapshotViewDto> views) {
        AuthPrincipal principal = AuthContext.getCurrentPrincipal();
        if (principal == null) return views;
        Set<Long> effectiveIds = principal.getEffectiveAssetIds();
        if (effectiveIds == null) return views; // null = no restriction
        return views.stream()
                .filter(v -> v.getAssetId() != null && effectiveIds.contains(v.getAssetId()))
                .collect(Collectors.toList());
    }

    @Override
    public R deleteNodeSnapshot(Long nodeId) {
        MonitorNodeSnapshot node = monitorNodeSnapshotMapper.selectById(nodeId);
        if (node == null) {
            return R.err("探针节点不存在");
        }
        // Unlink from asset if bound
        if (node.getAssetId() != null) {
            AssetHost asset = assetHostMapper.selectById(node.getAssetId());
            if (asset != null) {
                if (node.getRemoteNodeUuid() != null && node.getRemoteNodeUuid().equals(asset.getMonitorNodeUuid())) {
                    asset.setMonitorNodeUuid("");
                    assetHostMapper.updateById(asset);
                }
                if (node.getRemoteNodeUuid() != null && node.getRemoteNodeUuid().equals(asset.getPikaNodeId())) {
                    asset.setPikaNodeId("");
                    assetHostMapper.updateById(asset);
                }
            }
        }

        // Try to delete from remote probe (best-effort, don't block local deletion)
        String remoteDeleteMsg = tryDeleteFromRemoteProbe(node);

        // Soft-delete: mark status=-1 so sync won't re-create, but keep metrics for history
        monitorMetricLatestMapper.delete(new LambdaQueryWrapper<MonitorMetricLatest>()
                .eq(MonitorMetricLatest::getNodeSnapshotId, nodeId));
        node.setStatus(-1); // Soft-deleted
        node.setOnline(0);
        node.setUpdatedTime(System.currentTimeMillis());
        monitorNodeSnapshotMapper.updateById(node);

        String msg = "已删除探针节点";
        if (remoteDeleteMsg != null) {
            msg += "（" + remoteDeleteMsg + "）";
        }
        return R.ok(msg);
    }

    /**
     * Best-effort delete node from remote probe (Komari/Pika).
     * Returns a status message, or null if remote deletion succeeded silently.
     */
    private String tryDeleteFromRemoteProbe(MonitorNodeSnapshot node) {
        if (node.getInstanceId() == null || node.getRemoteNodeUuid() == null) {
            return null;
        }
        MonitorInstance instance = this.getById(node.getInstanceId());
        if (instance == null) {
            return null;
        }
        try {
            if (TYPE_KOMARI.equalsIgnoreCase(instance.getType())) {
                // Komari: POST /api/admin/client/{uuid}/remove
                String path = "/api/admin/client/" + node.getRemoteNodeUuid() + "/remove";
                httpPost(instance, path, null, instance.getAllowInsecureTls());
                log.info("已从 Komari 远程删除节点: {} (instance={})", node.getRemoteNodeUuid(), instance.getName());
                return "已同步从探针端删除";
            } else if (TYPE_PIKA.equalsIgnoreCase(instance.getType())) {
                // Pika: DELETE /api/admin/agents/{id} — requires JWT auth
                String jwt = loginPika(instance);
                if (jwt != null) {
                    String baseUrl = instance.getBaseUrl().replaceAll("/+$", "");
                    String url = baseUrl + "/api/admin/agents/" + node.getRemoteNodeUuid();
                    httpDeleteWithToken(url, jwt, instance.getAllowInsecureTls());
                    log.info("已从 Pika 远程删除节点: {} (instance={})", node.getRemoteNodeUuid(), instance.getName());
                    return "已同步从探针端删除";
                }
                return "Pika 登录失败，探针端节点未删除，请手动清理";
            }
        } catch (Exception e) {
            log.warn("远程删除探针节点失败 (instance={}, node={}): {}", instance.getName(), node.getRemoteNodeUuid(), e.getMessage());
            return "探针端删除失败: " + e.getMessage() + "，请手动清理";
        }
        return null;
    }

    /**
     * Clear asset's probe reference when a node is removed or disappeared from probe.
     * @param node the node snapshot being unlinked
     * @param probeType "komari" or "pika" — determines which asset field to clear
     */
    private void unlinkNodeFromAsset(MonitorNodeSnapshot node, String probeType) {
        if (node.getAssetId() == null || node.getRemoteNodeUuid() == null) return;
        AssetHost asset = assetHostMapper.selectById(node.getAssetId());
        if (asset == null) return;
        boolean updated = false;
        if (TYPE_KOMARI.equalsIgnoreCase(probeType)
                && node.getRemoteNodeUuid().equals(asset.getMonitorNodeUuid())) {
            asset.setMonitorNodeUuid("");
            updated = true;
        }
        if (TYPE_PIKA.equalsIgnoreCase(probeType)
                && node.getRemoteNodeUuid().equals(asset.getPikaNodeId())) {
            asset.setPikaNodeId("");
            updated = true;
        }
        if (updated) {
            assetHostMapper.updateById(asset);
            log.info("探针端节点已消失，清理资产[{}]的{}关联: {}", asset.getId(), probeType, node.getRemoteNodeUuid());
        }
    }

    // ==================== Historical Records (Charts) ====================

    @Override
    public R getNodeRecords(MonitorRecordsDto dto) {
        MonitorNodeSnapshot node = monitorNodeSnapshotMapper.selectById(dto.getNodeId());
        if (node == null) {
            return R.err("探针节点不存在");
        }
        MonitorInstance instance = this.getById(node.getInstanceId());
        if (instance == null) {
            return R.err("探针实例不存在");
        }

        String range = dto.getRange();
        if (!StringUtils.hasText(range)) range = "1h";
        String type = dto.getType();
        if (!StringUtils.hasText(type)) type = "all";

        try {
            if (TYPE_KOMARI.equalsIgnoreCase(instance.getType())) {
                return fetchKomariRecords(instance, node, range, type);
            } else if (TYPE_PIKA.equalsIgnoreCase(instance.getType())) {
                return fetchPikaRecords(instance, node, range, type);
            } else {
                return R.err("不支持的探针类型: " + instance.getType());
            }
        } catch (Exception e) {
            log.warn("[MonitorRecords] Failed to fetch records for node {}: {}", node.getId(), e.getMessage());
            return R.err("获取历史数据失败: " + e.getMessage());
        }
    }

    /**
     * Fetch historical records from Komari via JSON-RPC getRecords.
     * Returns normalized chart data: {series: [{name, data: [{timestamp, value}]}]}
     */
    private R fetchKomariRecords(MonitorInstance instance, MonitorNodeSnapshot node, String range, String type) {
        // Map range string to hours
        int hours = rangeToHours(range);

        // Map our type to Komari load_type
        String loadType = mapToKomariLoadType(type);

        // Build RPC request
        JSONObject params = new JSONObject();
        params.put("type", "load");
        params.put("uuid", node.getRemoteNodeUuid());
        params.put("hours", hours);
        if (!"all".equals(loadType)) {
            params.put("load_type", loadType);
        }
        params.put("maxCount", 2000);

        JSONObject rpcRequest = new JSONObject();
        rpcRequest.put("jsonrpc", "2.0");
        rpcRequest.put("method", "common:getRecords");
        rpcRequest.put("params", params);
        rpcRequest.put("id", 1);

        String rpcJson = httpPost(instance, "/api/rpc2", rpcRequest.toJSONString(), instance.getAllowInsecureTls());
        if (rpcJson == null) {
            throw new RuntimeException("Empty response from Komari RPC");
        }

        JSONObject rpcResponse = JSON.parseObject(rpcJson);
        if (rpcResponse.containsKey("error")) {
            throw new RuntimeException("RPC error: " + rpcResponse.get("error"));
        }
        JSONObject result = rpcResponse.getJSONObject("result");
        if (result == null) {
            return R.ok(Map.of("series", List.of(), "probeType", "komari"));
        }

        // If load_type was specified, result has: {records: {uuid: [{time, cpu/ram/...}]}, load_type}
        // If not, result has: {records: {uuid: [{time, cpu, ram, ...all fields}]}}
        JSONObject records = result.getJSONObject("records");
        if (records == null || records.isEmpty()) {
            return R.ok(Map.of("series", List.of(), "probeType", "komari"));
        }

        // Get records for our node's UUID
        String uuid = node.getRemoteNodeUuid();
        JSONArray nodeRecords = records.getJSONArray(uuid);
        if (nodeRecords == null || nodeRecords.isEmpty()) {
            return R.ok(Map.of("series", List.of(), "probeType", "komari"));
        }

        // Normalize to chart series format
        List<Map<String, Object>> series = normalizeKomariToSeries(nodeRecords, type);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("series", series);
        data.put("probeType", "komari");
        data.put("range", range);
        data.put("nodeId", node.getId());
        return R.ok(data);
    }

    /**
     * Fetch historical records from Pika via REST API.
     * GET /api/agents/:id/metrics?type=cpu&range=1h
     */
    private R fetchPikaRecords(MonitorInstance instance, MonitorNodeSnapshot node, String range, String type) {
        String jwt = loginPika(instance);
        if (jwt == null) {
            throw new RuntimeException("Pika login failed");
        }

        // Pika metric types: cpu, memory, disk, network, disk_io, temperature
        List<String> pikaTypes = mapToPikaTypes(type);
        List<Map<String, Object>> allSeries = new ArrayList<>();

        String pikaRange = mapToPikaRange(range);

        for (String pikaType : pikaTypes) {
            String path = "/api/agents/" + node.getRemoteNodeUuid() + "/metrics?type=" + pikaType + "&range=" + pikaRange;
            String baseUrl = instance.getBaseUrl().replaceAll("/+$", "");
            String responseJson = httpGetWithToken(baseUrl + path, jwt, instance.getAllowInsecureTls());
            if (responseJson == null) continue;

            JSONObject resp = JSON.parseObject(responseJson);
            // Pika may wrap in {data: {series: [...]}} or return directly
            JSONObject data = resp.containsKey("data") ? resp.getJSONObject("data") : resp;
            JSONArray pikaSeries = data.getJSONArray("series");
            if (pikaSeries == null) continue;

            for (int i = 0; i < pikaSeries.size(); i++) {
                JSONObject s = pikaSeries.getJSONObject(i);
                String name = pikaType + "_" + s.getString("name");
                JSONArray dataArr = s.getJSONArray("data");
                if (dataArr == null || dataArr.isEmpty()) continue;

                List<Map<String, Object>> points = new ArrayList<>();
                for (int j = 0; j < dataArr.size(); j++) {
                    JSONObject pt = dataArr.getJSONObject(j);
                    Map<String, Object> point = new LinkedHashMap<>();
                    point.put("timestamp", pt.getLong("timestamp"));
                    point.put("value", pt.getDouble("value"));
                    points.add(point);
                }
                Map<String, Object> seriesItem = new LinkedHashMap<>();
                seriesItem.put("name", name);
                seriesItem.put("data", points);
                allSeries.add(seriesItem);
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("series", allSeries);
        result.put("probeType", "pika");
        result.put("range", range);
        result.put("nodeId", node.getId());
        return R.ok(result);
    }

    private List<Map<String, Object>> normalizeKomariToSeries(JSONArray records, String type) {
        List<Map<String, Object>> series = new ArrayList<>();

        if ("all".equals(type) || "cpu".equals(type)) {
            series.add(extractKomariSeries(records, "cpu", "cpu"));
        }
        if ("all".equals(type) || "ram".equals(type) || "memory".equals(type)) {
            series.add(extractKomariSeries(records, "ram", "ram"));
            series.add(extractKomariSeries(records, "ram_total", "ram_total"));
        }
        if ("all".equals(type) || "swap".equals(type)) {
            series.add(extractKomariSeries(records, "swap", "swap"));
            series.add(extractKomariSeries(records, "swap_total", "swap_total"));
        }
        if ("all".equals(type) || "disk".equals(type)) {
            series.add(extractKomariSeries(records, "disk", "disk"));
            series.add(extractKomariSeries(records, "disk_total", "disk_total"));
        }
        if ("all".equals(type) || "network".equals(type)) {
            series.add(extractKomariSeries(records, "net_in", "net_in"));
            series.add(extractKomariSeries(records, "net_out", "net_out"));
        }
        if ("all".equals(type) || "load".equals(type)) {
            series.add(extractKomariSeries(records, "load", "load"));
        }
        if ("all".equals(type) || "connections".equals(type)) {
            series.add(extractKomariSeries(records, "connections", "connections"));
        }
        if ("all".equals(type) || "temp".equals(type) || "temperature".equals(type)) {
            series.add(extractKomariSeries(records, "temp", "temp"));
        }
        if ("all".equals(type) || "gpu".equals(type)) {
            series.add(extractKomariSeries(records, "gpu", "gpu"));
        }
        if ("all".equals(type) || "process".equals(type)) {
            series.add(extractKomariSeries(records, "process", "process"));
        }

        // Remove empty series
        series.removeIf(s -> ((List<?>) s.get("data")).isEmpty());
        return series;
    }

    private Map<String, Object> extractKomariSeries(JSONArray records, String field, String seriesName) {
        List<Map<String, Object>> points = new ArrayList<>();
        for (int i = 0; i < records.size(); i++) {
            JSONObject rec = records.getJSONObject(i);
            Object val = rec.get(field);
            if (val == null) continue;

            // Parse Komari time (RFC3339 string or LocalTime object)
            String timeStr = rec.getString("time");
            long timestamp;
            try {
                // Try parsing RFC3339
                timestamp = java.time.OffsetDateTime.parse(timeStr).toInstant().toEpochMilli();
            } catch (Exception e) {
                try {
                    // Fallback: parse as local datetime
                    timestamp = java.time.LocalDateTime.parse(timeStr.replace(" ", "T"))
                            .atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
                } catch (Exception e2) {
                    continue;
                }
            }

            Map<String, Object> point = new LinkedHashMap<>();
            point.put("timestamp", timestamp);
            point.put("value", ((Number) val).doubleValue());
            points.add(point);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("name", seriesName);
        result.put("data", points);
        return result;
    }

    private int rangeToHours(String range) {
        if (range == null) return 1;
        switch (range) {
            case "1h": return 1;
            case "3h": return 3;
            case "6h": return 6;
            case "12h": return 12;
            case "24h": case "1d": return 24;
            case "3d": return 72;
            case "7d": return 168;
            default: return 1;
        }
    }

    private String mapToKomariLoadType(String type) {
        if (type == null || "all".equals(type)) return "all";
        switch (type) {
            case "memory": case "ram": return "ram";
            case "network": return "network";
            case "disk": return "disk";
            case "cpu": return "cpu";
            case "swap": return "swap";
            case "load": return "load";
            case "connections": return "connections";
            default: return "all";
        }
    }

    private List<String> mapToPikaTypes(String type) {
        if (type == null || "all".equals(type)) {
            return List.of("cpu", "memory", "network", "disk", "temperature");
        }
        switch (type) {
            case "cpu": return List.of("cpu");
            case "memory": case "ram": return List.of("memory");
            case "network": return List.of("network");
            case "disk": return List.of("disk");
            case "load": return List.of("cpu"); // Pika cpu includes load
            default: return List.of(type);
        }
    }

    private String mapToPikaRange(String range) {
        // Pika supports: 1m, 5m, 15m, 30m, 1h, 3h, 6h, 12h, 1d/24h, 3d, 7d, 30d
        if (range == null) return "1h";
        switch (range) {
            case "1h": case "3h": case "6h": case "12h": case "24h": case "3d": case "7d":
                return range;
            case "1d": return "24h";
            default: return "1h";
        }
    }

    // ==================== Core Sync Logic (Komari) ====================

    private Map<String, Object> performSync(MonitorInstance instance) {
        long now = System.currentTimeMillis();
        Map<String, Object> summary = new LinkedHashMap<>();
        try {
            if (TYPE_KOMARI.equalsIgnoreCase(instance.getType())) {
                summary = syncKomari(instance);
            } else if (TYPE_PIKA.equalsIgnoreCase(instance.getType())) {
                summary = syncPika(instance);
            } else {
                log.warn("[MonitorSync] Unsupported probe type: {}", instance.getType());
                throw new RuntimeException("Unsupported probe type: " + instance.getType());
            }
            instance.setLastSyncStatus(STATUS_SUCCESS);
            instance.setLastSyncError("");
        } catch (Exception e) {
            instance.setLastSyncStatus(STATUS_FAILED);
            instance.setLastSyncError(e.getMessage());
            throw e;
        } finally {
            instance.setLastSyncAt(now);
            instance.setUpdatedTime(now);
            this.updateById(instance);
        }
        return summary;
    }

    private Map<String, Object> syncKomari(MonitorInstance instance) {
        // 1. Fetch node list from komari admin API (returns full data including IP/version)
        String clientsJson = httpGet(instance, "/api/admin/client/list", instance.getAllowInsecureTls());
        if (clientsJson == null) {
            throw new RuntimeException("Failed to fetch clients from komari");
        }

        // /api/admin/client/list returns raw JSON array: [{...}, ...]
        JSONArray clients;
        String trimmed = clientsJson.trim();
        if (trimmed.startsWith("[")) {
            clients = JSON.parseArray(trimmed);
        } else {
            JSONObject clientsResponse = JSON.parseObject(trimmed);
            if (clientsResponse.containsKey("data")) {
                clients = clientsResponse.getJSONArray("data");
            } else {
                clients = new JSONArray();
            }
        }

        if (clients == null) {
            clients = new JSONArray();
        }

        // 2. Fetch ALL metrics + online status in ONE call via JSON-RPC getNodesLatestStatus
        // Uses ws.GetLatestReport() (no TTL) + ws.GetAllOnlineUUIDs() - same data source as Komari's own dashboard
        JSONObject allMetrics = fetchAllMetricsViaRpc(instance);

        long now = System.currentTimeMillis();
        Set<String> seenUuids = new HashSet<>();
        int onlineCount = 0;
        int newNodes = 0;
        int updatedNodes = 0;
        int newAssets = 0;

        for (int i = 0; i < clients.size(); i++) {
            JSONObject client = clients.getJSONObject(i);
            String uuid = client.getString("uuid");
            if (!StringUtils.hasText(uuid)) {
                continue;
            }
            seenUuids.add(uuid);

            // Upsert node snapshot
            MonitorNodeSnapshot existing = monitorNodeSnapshotMapper.selectOne(new LambdaQueryWrapper<MonitorNodeSnapshot>()
                    .eq(MonitorNodeSnapshot::getInstanceId, instance.getId())
                    .eq(MonitorNodeSnapshot::getRemoteNodeUuid, uuid));

            boolean isNew = (existing == null);
            if (isNew) {
                existing = new MonitorNodeSnapshot();
                existing.setInstanceId(instance.getId());
                existing.setRemoteNodeUuid(uuid);
                existing.setCreatedTime(now);
                existing.setUpdatedTime(now);
                existing.setStatus(0);
                existing.setOnline(0);
                monitorNodeSnapshotMapper.insert(existing);
                newNodes++;
            } else if (existing.getStatus() != null && existing.getStatus() == -1) {
                // Soft-deleted by user — skip entirely, don't update
                continue;
            } else {
                updatedNodes++;
            }

            // Static client info
            existing.setName(client.getString("name"));
            existing.setIp(client.getString("ipv4"));
            existing.setIpv6(client.getString("ipv6"));
            existing.setOs(client.getString("os"));
            existing.setCpuName(client.getString("cpu_name"));
            existing.setCpuCores(client.getInteger("cpu_cores"));
            existing.setMemTotal(client.getLong("mem_total"));
            existing.setSwapTotal(client.getLong("swap_total"));
            existing.setDiskTotal(client.getLong("disk_total"));
            existing.setRegion(client.getString("region"));
            existing.setVersion(client.getString("version"));
            existing.setVirtualization(client.getString("virtualization"));
            existing.setArch(client.getString("arch"));
            existing.setKernelVersion(client.getString("kernel_version"));
            existing.setGpuName(client.getString("gpu_name"));
            existing.setHidden(client.getBooleanValue("hidden") ? 1 : 0);
            existing.setTags(client.getString("tags"));
            existing.setNodeGroup(client.getString("group"));
            existing.setWeight(client.getInteger("weight"));
            existing.setPrice(client.getDouble("price"));
            existing.setBillingCycle(client.getInteger("billing_cycle"));
            existing.setCurrency(client.getString("currency"));
            existing.setTrafficLimit(client.getLong("traffic_limit"));
            existing.setTrafficLimitType(client.getString("traffic_limit_type"));

            // Parse expired_at timestamp
            String expiredAtStr = client.getString("expired_at");
            if (StringUtils.hasText(expiredAtStr) && !"0001-01-01T00:00:00Z".equals(expiredAtStr)) {
                try {
                    existing.setExpiredAt(java.time.Instant.parse(expiredAtStr).toEpochMilli());
                } catch (Exception ignored) {}
            }

            // Apply metrics + online status from batch RPC result
            JSONObject nodeMetric = allMetrics != null ? allMetrics.getJSONObject(uuid) : null;
            boolean isOnline = nodeMetric != null && nodeMetric.getBooleanValue("online");
            if (isOnline) onlineCount++;

            existing.setOnline(isOnline ? 1 : 0);
            Long prevActive = existing.getLastActiveAt();
            existing.setLastActiveAt(isOnline ? now : (prevActive != null ? prevActive : 0L));
            existing.setLastSyncAt(now);
            existing.setUpdatedTime(now);
            // Record first-ever online time for offline diagnostics
            if (isOnline && existing.getFirstSeenAt() == null) {
                existing.setFirstSeenAt(now);
            }

            monitorNodeSnapshotMapper.updateById(existing);

            // Upsert latest metrics if data available
            if (nodeMetric != null) {
                applyNodeMetric(instance, existing, uuid, nodeMetric, now);
            }

            // Auto-create/link asset (skip if user previously unlinked)
            if (existing.getAssetId() == null && !Integer.valueOf(1).equals(existing.getAssetUnlinked())) {
                boolean created = autoCreateAssetFromNode(existing, instance);
                if (created) newAssets++;
            } else if (existing.getAssetId() != null) {
                refreshAssetFromProbe(existing);
            }
        }

        // Mark removed nodes (no longer in probe) and clean up asset references
        int removedNodes = 0;
        List<MonitorNodeSnapshot> allNodes = monitorNodeSnapshotMapper.selectList(new LambdaQueryWrapper<MonitorNodeSnapshot>()
                .eq(MonitorNodeSnapshot::getInstanceId, instance.getId())
                .ne(MonitorNodeSnapshot::getStatus, -1));
        for (MonitorNodeSnapshot node : allNodes) {
            if (!seenUuids.contains(node.getRemoteNodeUuid())) {
                node.setOnline(0);
                node.setStatus(1); // Mark as "removed from probe"
                node.setUpdatedTime(now);
                monitorNodeSnapshotMapper.updateById(node);
                // Clear asset's probe reference since probe no longer has this node
                unlinkNodeFromAsset(node, TYPE_KOMARI);
                removedNodes++;
            }
        }

        // Update instance counters
        instance.setNodeCount(seenUuids.size());
        instance.setOnlineNodeCount(onlineCount);

        // Build sync summary
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("total", seenUuids.size());
        summary.put("online", onlineCount);
        summary.put("offline", seenUuids.size() - onlineCount);
        summary.put("newNodes", newNodes);
        summary.put("updatedNodes", updatedNodes);
        summary.put("removedNodes", removedNodes);
        summary.put("newAssets", newAssets);
        return summary;
    }

    /**
     * Fetch all nodes' latest metrics + online status via JSON-RPC getNodesLatestStatus.
     * This uses ws.GetLatestReport() (no TTL) + ws.GetAllOnlineUUIDs() internally,
     * the same data source as Komari's own dashboard WebSocket.
     * Returns: {"uuid1": {cpu, ram, ram_total, online, ...}, "uuid2": {...}}
     */
    private JSONObject fetchAllMetricsViaRpc(MonitorInstance instance) {
        try {
            String rpcBody = "{\"jsonrpc\":\"2.0\",\"method\":\"common:getNodesLatestStatus\",\"id\":1}";
            String rpcJson = httpPost(instance, "/api/rpc2", rpcBody, instance.getAllowInsecureTls());
            if (rpcJson == null) {
                return null;
            }
            JSONObject rpcResponse = JSON.parseObject(rpcJson);
            if (rpcResponse.containsKey("error")) {
                log.warn("[MonitorSync] RPC getNodesLatestStatus error: {}", rpcResponse.get("error"));
                return null;
            }
            JSONObject result = rpcResponse.getJSONObject("result");
            if (result != null) {
                log.info("[MonitorSync] RPC getNodesLatestStatus returned {} nodes", result.size());
            }
            return result;
        } catch (Exception e) {
            log.warn("[MonitorSync] Failed to fetch metrics via RPC: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Apply flat metric data from getNodesLatestStatus RPC result to a metric record.
     * Fields: cpu, gpu, ram, ram_total, swap, swap_total, load, load5, load15, temp,
     * disk, disk_total, net_in, net_out, net_total_up, net_total_down,
     * process, connections, connections_udp, online, uptime
     */
    private void applyNodeMetric(MonitorInstance instance, MonitorNodeSnapshot nodeSnapshot,
                                  String uuid, JSONObject data, long now) {
        try {
            MonitorMetricLatest metric = monitorMetricLatestMapper.selectOne(new LambdaQueryWrapper<MonitorMetricLatest>()
                    .eq(MonitorMetricLatest::getInstanceId, instance.getId())
                    .eq(MonitorMetricLatest::getRemoteNodeUuid, uuid));

            if (metric == null) {
                metric = new MonitorMetricLatest();
                metric.setInstanceId(instance.getId());
                metric.setRemoteNodeUuid(uuid);
                metric.setNodeSnapshotId(nodeSnapshot.getId());
                metric.setCreatedTime(now);
                metric.setStatus(0);
            }

            // Flat fields from getNodesLatestStatus RPC response
            metric.setCpuUsage(data.getDouble("cpu"));
            metric.setGpuUsage(data.getDouble("gpu"));
            metric.setMemUsed(data.getLong("ram"));
            metric.setMemTotal(data.getLong("ram_total"));
            metric.setSwapUsed(data.getLong("swap"));
            metric.setSwapTotal(data.getLong("swap_total"));
            metric.setLoad1(data.getDouble("load"));
            metric.setLoad5(data.getDouble("load5"));
            metric.setLoad15(data.getDouble("load15"));
            metric.setTemperature(data.getDouble("temp"));
            metric.setDiskUsed(data.getLong("disk"));
            metric.setDiskTotal(data.getLong("disk_total"));
            metric.setNetIn(data.getLong("net_in"));
            metric.setNetOut(data.getLong("net_out"));
            metric.setNetTotalUp(data.getLong("net_total_up"));
            metric.setNetTotalDown(data.getLong("net_total_down"));
            metric.setProcessCount(data.getInteger("process"));
            metric.setConnections(data.getInteger("connections"));
            metric.setConnectionsUdp(data.getInteger("connections_udp"));
            metric.setUptime(data.getLong("uptime"));
            metric.setSampledAt(now);
            metric.setUpdatedTime(now);

            if (metric.getId() == null) {
                monitorMetricLatestMapper.insert(metric);
            } else {
                monitorMetricLatestMapper.updateById(metric);
            }
        } catch (Exception e) {
            log.debug("[MonitorSync] Failed to apply metrics for node {}: {}", uuid, e.getMessage());
        }
    }

    // ==================== Provision Agent (Komari Admin API) ====================

    @Override
    public R provisionAgent(MonitorProvisionDto dto) {
        MonitorInstance instance = getRequiredInstance(dto.getInstanceId());
        String baseUrl = instance.getBaseUrl().replaceAll("/+$", "");

        if (TYPE_PIKA.equalsIgnoreCase(instance.getType())) {
            // Pika: generate install command using API key from Pika's key management
            // The user needs to create an API key in Pika's admin panel first
            try {
                String jwt = loginPika(instance);
                if (jwt == null) {
                    return R.err("Pika 登录失败，无法获取安装信息");
                }

                // Fetch API keys to get the first enabled key for agent install
                String keysJson = httpGetWithToken(baseUrl + "/api/admin/api-keys", jwt, instance.getAllowInsecureTls());
                // Pika may return raw JSON array or {data:[...]}
                JSONArray keys;
                String trimmedKeys = keysJson.trim();
                if (trimmedKeys.startsWith("[")) {
                    keys = JSON.parseArray(trimmedKeys);
                } else {
                    JSONObject keysResp = JSON.parseObject(trimmedKeys);
                    keys = keysResp.getJSONArray("data");
                }
                String apiKey = null;
                if (keys != null) {
                    for (int i = 0; i < keys.size(); i++) {
                        JSONObject k = keys.getJSONObject(i);
                        if (k.getBooleanValue("enabled")) {
                            apiKey = k.getString("key");
                            break;
                        }
                    }
                }
                if (apiKey == null) {
                    // Auto-create an API key in Pika for agent installation
                    log.info("[MonitorProvision] No API key found in Pika {}, auto-creating one", instance.getName());
                    String createKeyJson = httpPostWithToken(
                            baseUrl + "/api/admin/api-keys", jwt,
                            "{\"name\":\"Flux Auto-Install\"}", instance.getAllowInsecureTls());
                    if (createKeyJson != null) {
                        JSONObject newKey = JSON.parseObject(createKeyJson);
                        apiKey = newKey.getString("key");
                    }
                    if (apiKey == null) {
                        return R.err("Pika 自动创建 API Key 失败，请手动在 Pika 管理面板中创建");
                    }
                }

                String name = dto.getName() != null ? dto.getName().trim() : "";
                String installCmd = String.format(
                        "curl -fsSL %s/api/agent/install.sh?token=%s%s | bash",
                        baseUrl, apiKey, name.isEmpty() ? "" : "&name=" + name);

                Map<String, Object> result = new LinkedHashMap<>();
                result.put("instanceId", instance.getId());
                result.put("instanceName", instance.getName());
                result.put("endpoint", baseUrl);
                result.put("installCommand", installCmd);
                return R.ok(result);
            } catch (Exception e) {
                log.error("[MonitorProvision] Pika provision failed for {}: {}", instance.getName(), e.getMessage());
                return R.err("Pika 安装命令生成失败: " + e.getMessage());
            }
        }

        // Komari provision
        if (!TYPE_KOMARI.equalsIgnoreCase(instance.getType())) {
            return R.err("不支持的探针类型: " + instance.getType());
        }
        if (!StringUtils.hasText(instance.getApiKey())) {
            return R.err("该探针实例未配置 API Key，无法创建客户端");
        }

        try {
            // Check for recently created but not-yet-online nodes to avoid duplicates
            // Look for snapshots created within last 30 minutes that are still offline
            List<MonitorNodeSnapshot> recentOrphans = monitorNodeSnapshotMapper.selectList(
                    new LambdaQueryWrapper<MonitorNodeSnapshot>()
                            .eq(MonitorNodeSnapshot::getInstanceId, instance.getId())
                            .eq(MonitorNodeSnapshot::getOnline, 0)
                            .ne(MonitorNodeSnapshot::getStatus, -1)
                            .isNull(MonitorNodeSnapshot::getFirstSeenAt)  // never connected
                            .gt(MonitorNodeSnapshot::getCreatedTime, System.currentTimeMillis() - 30 * 60 * 1000)
                            .orderByDesc(MonitorNodeSnapshot::getCreatedTime));
            if (!recentOrphans.isEmpty()) {
                // Reuse the most recent orphan - get its token from Komari
                MonitorNodeSnapshot orphan = recentOrphans.get(0);
                String existingUuid = orphan.getRemoteNodeUuid();
                try {
                    String tokenJson = httpGet(instance, "/api/admin/client/" + existingUuid + "/token", instance.getAllowInsecureTls());
                    if (tokenJson != null) {
                        JSONObject tokenResp = JSON.parseObject(tokenJson);
                        String existingToken = tokenResp.getString("token");
                        if (StringUtils.hasText(existingToken)) {
                            log.info("[MonitorProvision] Reusing existing orphan client {} for instance {}", existingUuid, instance.getName());
                            // Rename reused client if a name was provided
                            String reuseName = dto.getName() != null ? dto.getName().trim() : "";
                            if (!reuseName.isEmpty()) {
                                try {
                                    httpPost(instance, "/api/admin/client/" + existingUuid + "/edit",
                                            "{\"name\":\"" + reuseName.replace("\"", "\\\"") + "\"}",
                                            instance.getAllowInsecureTls());
                                } catch (Exception e) {
                                    log.warn("[MonitorProvision] Failed to rename reused client {} to '{}': {}", existingUuid, reuseName, e.getMessage());
                                }
                            }
                            String scriptUrl = "https://raw.githubusercontent.com/komari-monitor/komari-agent/refs/heads/main/install.sh";
                            String installCmd = String.format("curl -fsSL %s | bash -s -- --endpoint %s --token %s", scriptUrl, baseUrl, existingToken);
                            String ghProxy = "https://ghfast.top";
                            String installCmdCn = String.format("curl -fsSL %s/%s | bash -s -- --install-ghproxy %s --endpoint %s --token %s",
                                    ghProxy, scriptUrl, ghProxy, baseUrl, existingToken);
                            Map<String, Object> reuseResult = new LinkedHashMap<>();
                            reuseResult.put("uuid", existingUuid);
                            reuseResult.put("token", existingToken);
                            reuseResult.put("instanceId", instance.getId());
                            reuseResult.put("instanceName", instance.getName());
                            reuseResult.put("endpoint", baseUrl);
                            reuseResult.put("installCommand", installCmd);
                            reuseResult.put("installCommandCn", installCmdCn);
                            reuseResult.put("reused", true);
                            return R.ok(reuseResult);
                        }
                    }
                } catch (Exception e) {
                    log.warn("[MonitorProvision] Failed to get token for orphan {}, will create new: {}", existingUuid, e.getMessage());
                }
            }

            // No reusable orphan found — create new client
            // Workaround: Komari <= 1.1.8 panics on audit log when using API key auth with name parameter.
            // Create without name (goes through no-audit-log branch), name will sync from agent basic info.
            String responseJson = httpPost(instance, "/api/admin/client/add", "{}", instance.getAllowInsecureTls());
            if (responseJson == null || responseJson.isBlank()) {
                return R.err("Komari 返回空响应，请检查探针实例连接和 API Key 配置");
            }
            JSONObject resp = JSON.parseObject(responseJson);

            if (!"success".equals(resp.getString("status"))) {
                String msg = resp.getString("message");
                return R.err("Komari 返回错误: " + (msg != null ? msg : resp.toJSONString()));
            }

            String uuid = resp.getString("uuid");
            String token = resp.getString("token");
            if (token == null || token.isEmpty()) {
                return R.err("Komari 创建客户端成功但未返回 token，请检查 Komari 版本");
            }

            // Rename client if a name was provided (replaces default "client_xxxxxxxx")
            String provisionName = dto.getName() != null ? dto.getName().trim() : "";
            if (!provisionName.isEmpty()) {
                try {
                    httpPost(instance, "/api/admin/client/" + uuid + "/edit",
                            "{\"name\":\"" + provisionName.replace("\"", "\\\"") + "\"}",
                            instance.getAllowInsecureTls());
                } catch (Exception e) {
                    log.warn("[MonitorProvision] Failed to rename Komari client {} to '{}': {}", uuid, provisionName, e.getMessage());
                }
            }

            // Build install command with optional GitHub proxy for China servers
            String scriptUrl = "https://raw.githubusercontent.com/komari-monitor/komari-agent/refs/heads/main/install.sh";
            String installCmd = String.format(
                    "curl -fsSL %s | bash -s -- --endpoint %s --token %s", scriptUrl, baseUrl, token);
            // China-friendly variant: proxy both script download AND binary download via --install-ghproxy
            String ghProxy = "https://ghfast.top";
            String installCmdCn = String.format(
                    "curl -fsSL %s/%s | bash -s -- --install-ghproxy %s --endpoint %s --token %s",
                    ghProxy, scriptUrl, ghProxy, baseUrl, token);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("uuid", uuid);
            result.put("token", token);
            result.put("instanceId", instance.getId());
            result.put("instanceName", instance.getName());
            result.put("endpoint", baseUrl);
            result.put("installCommand", installCmd);
            result.put("installCommandCn", installCmdCn);

            return R.ok(result);
        } catch (SimpleCircuitBreaker.CircuitBreakerOpenException e) {
            return R.err("探针实例连接熔断中 (连续失败过多)，请稍后重试或检查 " + instance.getName() + " 是否可达");
        } catch (Exception e) {
            log.error("[MonitorProvision] Failed to provision agent on {}: {}", instance.getName(), e.getMessage(), e);
            return R.err("创建探针客户端失败: " + e.getMessage());
        }
    }

    // ==================== Pika Sync ====================

    /**
     * Login to Pika admin API to get a JWT token.
     * Uses username + apiKey(password) from the instance config.
     */
    private String loginPika(MonitorInstance instance) {
        String baseUrl = instance.getBaseUrl().replaceAll("/+$", "");
        String username = StringUtils.hasText(instance.getUsername()) ? instance.getUsername() : "admin";
        String password = instance.getApiKey();
        if (!StringUtils.hasText(password)) {
            throw new RuntimeException("Pika password (API Key field) is not configured");
        }

        boolean insecure = instance.getAllowInsecureTls() != null && instance.getAllowInsecureTls() == 1;
        CloseableHttpClient client = insecure ? POOLED_INSECURE_CLIENT : POOLED_CLIENT;
        try {
            String loginBody = JSON.toJSONString(Map.of("username", username, "password", password));
            HttpPost request = new HttpPost(baseUrl + "/api/login");
            request.setConfig(RequestConfig.custom().setConnectTimeout(10_000).setSocketTimeout(15_000).build());
            request.setHeader("Content-Type", "application/json");
            request.setHeader("Accept", "application/json");
            request.setEntity(new StringEntity(loginBody, StandardCharsets.UTF_8));

            try (CloseableHttpResponse response = client.execute(request)) {
                int statusCode = response.getStatusLine().getStatusCode();
                String body = EntityUtils.toString(response.getEntity(), StandardCharsets.UTF_8);
                if (statusCode < 200 || statusCode >= 300) {
                    throw new RuntimeException("Pika login HTTP " + statusCode + ": " + truncate(body, 200));
                }
                JSONObject resp = JSON.parseObject(body);
                // Pika returns {token, expiresAt, user} at top level
                String token = resp.getString("token");
                if (!StringUtils.hasText(token)) {
                    // Fallback: check nested {data:{token}} for compatibility
                    JSONObject data = resp.getJSONObject("data");
                    if (data != null) token = data.getString("token");
                }
                if (!StringUtils.hasText(token)) {
                    throw new RuntimeException("Pika login failed: " + truncate(body, 200));
                }
                return token;
            }
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Pika login failed: " + e.getMessage(), e);
        }
    }

    /**
     * HTTP GET with explicit JWT Bearer token (used for Pika where token is obtained per-sync).
     */
    private String httpGetWithToken(String url, String token, Integer allowInsecureTls) {
        boolean insecure = allowInsecureTls != null && allowInsecureTls == 1;
        CloseableHttpClient client = insecure ? POOLED_INSECURE_CLIENT : POOLED_CLIENT;
        try {
            HttpGet request = new HttpGet(url);
            request.setConfig(RequestConfig.custom().setConnectTimeout(10_000).setSocketTimeout(15_000).build());
            request.setHeader("Authorization", "Bearer " + token);
            request.setHeader("Accept", "application/json");

            try (CloseableHttpResponse response = client.execute(request)) {
                int statusCode = response.getStatusLine().getStatusCode();
                String body = EntityUtils.toString(response.getEntity(), StandardCharsets.UTF_8);
                if (statusCode >= 200 && statusCode < 300) {
                    return body;
                }
                throw new RuntimeException("HTTP " + statusCode + ": " + truncate(body, 200));
            }
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Request failed: " + e.getMessage(), e);
        }
    }

    private String httpPostWithToken(String url, String token, String jsonBody, Integer allowInsecureTls) {
        boolean insecure = allowInsecureTls != null && allowInsecureTls == 1;
        CloseableHttpClient client = insecure ? POOLED_INSECURE_CLIENT : POOLED_CLIENT;
        try {
            HttpPost request = new HttpPost(url);
            request.setConfig(RequestConfig.custom().setConnectTimeout(10_000).setSocketTimeout(15_000).build());
            request.setHeader("Authorization", "Bearer " + token);
            request.setHeader("Accept", "application/json");
            request.setHeader("Content-Type", "application/json");
            if (jsonBody != null) {
                request.setEntity(new StringEntity(jsonBody, StandardCharsets.UTF_8));
            }
            try (CloseableHttpResponse response = client.execute(request)) {
                int statusCode = response.getStatusLine().getStatusCode();
                String body = EntityUtils.toString(response.getEntity(), StandardCharsets.UTF_8);
                if (statusCode >= 200 && statusCode < 300) {
                    return body;
                }
                throw new RuntimeException("HTTP " + statusCode + ": " + truncate(body, 200));
            }
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Request failed: " + e.getMessage(), e);
        }
    }

    /**
     * HTTP DELETE with JWT Bearer token (used for Pika agent deletion).
     */
    private String httpDeleteWithToken(String url, String token, Integer allowInsecureTls) {
        boolean insecure = allowInsecureTls != null && allowInsecureTls == 1;
        CloseableHttpClient client = insecure ? POOLED_INSECURE_CLIENT : POOLED_CLIENT;
        try {
            org.apache.http.client.methods.HttpDelete request = new org.apache.http.client.methods.HttpDelete(url);
            request.setConfig(RequestConfig.custom().setConnectTimeout(10_000).setSocketTimeout(15_000).build());
            request.setHeader("Authorization", "Bearer " + token);
            request.setHeader("Accept", "application/json");
            try (CloseableHttpResponse response = client.execute(request)) {
                int statusCode = response.getStatusLine().getStatusCode();
                String body = EntityUtils.toString(response.getEntity(), StandardCharsets.UTF_8);
                if (statusCode >= 200 && statusCode < 300) {
                    return body;
                }
                throw new RuntimeException("HTTP " + statusCode + ": " + truncate(body, 200));
            }
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Request failed: " + e.getMessage(), e);
        }
    }

    private Map<String, Object> syncPika(MonitorInstance instance) {
        // 1. Login to get JWT
        String jwt = loginPika(instance);
        String baseUrl = instance.getBaseUrl().replaceAll("/+$", "");
        Integer tls = instance.getAllowInsecureTls();

        // 2. Fetch agent list (Pika returns raw JSON array [...])
        String agentsJson = httpGetWithToken(baseUrl + "/api/admin/agents", jwt, tls);
        JSONArray agents;
        String trimmedAgents = agentsJson.trim();
        if (trimmedAgents.startsWith("[")) {
            agents = JSON.parseArray(trimmedAgents);
        } else {
            JSONObject agentsResp = JSON.parseObject(trimmedAgents);
            agents = agentsResp.getJSONArray("data");
        }
        if (agents == null) {
            agents = new JSONArray();
        }

        long now = System.currentTimeMillis();
        Set<String> seenIds = new HashSet<>();
        int onlineCount = 0;
        int newNodes = 0;
        int updatedNodes = 0;
        int newAssets = 0;

        for (int i = 0; i < agents.size(); i++) {
            JSONObject agent = agents.getJSONObject(i);
            String agentId = agent.getString("id");
            if (!StringUtils.hasText(agentId)) continue;
            seenIds.add(agentId);

            // Upsert node snapshot
            MonitorNodeSnapshot existing = monitorNodeSnapshotMapper.selectOne(new LambdaQueryWrapper<MonitorNodeSnapshot>()
                    .eq(MonitorNodeSnapshot::getInstanceId, instance.getId())
                    .eq(MonitorNodeSnapshot::getRemoteNodeUuid, agentId));

            boolean isNew = (existing == null);
            if (isNew) {
                existing = new MonitorNodeSnapshot();
                existing.setInstanceId(instance.getId());
                existing.setRemoteNodeUuid(agentId);
                existing.setCreatedTime(now);
                existing.setUpdatedTime(now);
                existing.setStatus(0);
                existing.setOnline(0);
                monitorNodeSnapshotMapper.insert(existing);
                newNodes++;
            } else if (existing.getStatus() != null && existing.getStatus() == -1) {
                // Soft-deleted by user — skip entirely, don't update
                continue;
            } else {
                updatedNodes++;
            }

            // Map Pika agent fields → MonitorNodeSnapshot
            existing.setName(agent.getString("name"));
            existing.setIp(agent.getString("ipv4"));
            existing.setIpv6(agent.getString("ipv6"));
            existing.setOs(agent.getString("os"));
            existing.setArch(agent.getString("arch"));
            existing.setVersion(agent.getString("version"));
            existing.setTags(agent.get("tags") != null ? agent.getJSONArray("tags").toJSONString() : null);
            existing.setWeight(agent.getInteger("weight"));

            // Pika trafficStats: {enabled, type, limit, used, resetDay, ...}
            JSONObject trafficStats = agent.getJSONObject("trafficStats");
            if (trafficStats != null && trafficStats.getBooleanValue("enabled")) {
                Long limit = trafficStats.getLong("limit");
                if (limit != null && limit > 0) existing.setTrafficLimit(limit);
                existing.setTrafficUsed(trafficStats.getLong("used"));
                existing.setTrafficLimitType(trafficStats.getString("type"));
                existing.setTrafficResetDay(trafficStats.getInteger("resetDay"));
            }

            // Pika status: 1=online, 0=offline
            boolean isOnline = agent.getIntValue("status") == 1;
            if (isOnline) onlineCount++;
            existing.setOnline(isOnline ? 1 : 0);

            // Expiry (Pika uses ms timestamp, 0 = never)
            Long expireTime = agent.getLong("expireTime");
            if (expireTime != null && expireTime > 0) {
                existing.setExpiredAt(expireTime);
            }

            Long prevActive = existing.getLastActiveAt();
            existing.setLastActiveAt(isOnline ? now : (prevActive != null ? prevActive : 0L));
            existing.setLastSyncAt(now);
            existing.setUpdatedTime(now);
            // Record first-ever online time for offline diagnostics
            if (isOnline && existing.getFirstSeenAt() == null) {
                existing.setFirstSeenAt(now);
            }
            monitorNodeSnapshotMapper.updateById(existing);

            // 3. Fetch per-agent latest metrics (Pika returns {cpu:{...}, memory:{...}, ...} directly)
            try {
                String metricsJson = httpGetWithToken(baseUrl + "/api/admin/agents/" + agentId + "/metrics/latest", jwt, tls);
                JSONObject metricsData = JSON.parseObject(metricsJson);
                // If wrapped in {data:{...}}, unwrap; otherwise use as-is
                if (metricsData.containsKey("data") && metricsData.getJSONObject("data") != null && metricsData.getJSONObject("data").containsKey("cpu")) {
                    metricsData = metricsData.getJSONObject("data");
                }
                if (metricsData != null && metricsData.containsKey("cpu")) {
                    applyPikaMetrics(instance, existing, agentId, metricsData, now);
                }
            } catch (Exception e) {
                log.debug("[MonitorSync] Failed to fetch Pika metrics for agent {}: {}", agentId, e.getMessage());
            }

            // Auto-create/link asset (skip if user previously unlinked)
            if (existing.getAssetId() == null && !Integer.valueOf(1).equals(existing.getAssetUnlinked())) {
                boolean created = autoCreateOrLinkAssetFromNode(existing, instance);
                if (created) newAssets++;
            } else if (existing.getAssetId() != null) {
                // If metrics fetch failed and OS is still empty, try to derive osCategory from asset's existing OS
                if (!StringUtils.hasText(existing.getOs())) {
                    AssetHost existingAsset = assetHostMapper.selectById(existing.getAssetId());
                    if (existingAsset != null && StringUtils.hasText(existingAsset.getOs())) {
                        existing.setOs(existingAsset.getOs());
                    }
                }
                refreshAssetFromProbe(existing);
            }
        }

        // Mark removed nodes (no longer in probe) and clean up asset references
        int removedNodes = 0;
        List<MonitorNodeSnapshot> allNodes = monitorNodeSnapshotMapper.selectList(new LambdaQueryWrapper<MonitorNodeSnapshot>()
                .eq(MonitorNodeSnapshot::getInstanceId, instance.getId())
                .ne(MonitorNodeSnapshot::getStatus, -1));
        for (MonitorNodeSnapshot node : allNodes) {
            if (!seenIds.contains(node.getRemoteNodeUuid())) {
                node.setOnline(0);
                node.setStatus(1); // Mark as "removed from probe"
                node.setUpdatedTime(now);
                monitorNodeSnapshotMapper.updateById(node);
                // Clear asset's probe reference since probe no longer has this node
                unlinkNodeFromAsset(node, TYPE_PIKA);
                removedNodes++;
            }
        }

        instance.setNodeCount(seenIds.size());
        instance.setOnlineNodeCount(onlineCount);

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("total", seenIds.size());
        summary.put("online", onlineCount);
        summary.put("offline", seenIds.size() - onlineCount);
        summary.put("newNodes", newNodes);
        summary.put("updatedNodes", updatedNodes);
        summary.put("removedNodes", removedNodes);
        summary.put("newAssets", newAssets);
        return summary;
    }

    /**
     * Map Pika metrics response (nested structure) to flat MonitorMetricLatest.
     * Pika metrics: {cpu:{usagePercent,...}, memory:{total,used,...}, disk:{total,used,...},
     *   network:{totalBytesSentRate,...}, host:{uptime,load1,...}, gpu:[{utilization,...}], ...}
     */
    private void applyPikaMetrics(MonitorInstance instance, MonitorNodeSnapshot nodeSnapshot,
                                   String agentId, JSONObject data, long now) {
        try {
            MonitorMetricLatest metric = monitorMetricLatestMapper.selectOne(new LambdaQueryWrapper<MonitorMetricLatest>()
                    .eq(MonitorMetricLatest::getInstanceId, instance.getId())
                    .eq(MonitorMetricLatest::getRemoteNodeUuid, agentId));

            if (metric == null) {
                metric = new MonitorMetricLatest();
                metric.setInstanceId(instance.getId());
                metric.setRemoteNodeUuid(agentId);
                metric.setNodeSnapshotId(nodeSnapshot.getId());
                metric.setCreatedTime(now);
                metric.setStatus(0);
            }

            // CPU
            JSONObject cpu = data.getJSONObject("cpu");
            if (cpu != null) {
                metric.setCpuUsage(cpu.getDouble("usagePercent"));
                // Also populate node snapshot CPU info
                if (cpu.getInteger("logicalCores") != null) {
                    nodeSnapshot.setCpuCores(cpu.getInteger("logicalCores"));
                }
                if (StringUtils.hasText(cpu.getString("modelName"))) {
                    nodeSnapshot.setCpuName(cpu.getString("modelName"));
                }
            }

            // Memory
            JSONObject memory = data.getJSONObject("memory");
            if (memory != null) {
                metric.setMemUsed(memory.getLong("used"));
                metric.setMemTotal(memory.getLong("total"));
                metric.setSwapUsed(memory.getLong("swapUsed"));
                metric.setSwapTotal(memory.getLong("swapTotal"));
                // Also update node snapshot totals
                if (memory.getLong("total") != null) nodeSnapshot.setMemTotal(memory.getLong("total"));
                if (memory.getLong("swapTotal") != null) nodeSnapshot.setSwapTotal(memory.getLong("swapTotal"));
            }

            // Disk
            JSONObject disk = data.getJSONObject("disk");
            if (disk != null) {
                metric.setDiskUsed(disk.getLong("used"));
                metric.setDiskTotal(disk.getLong("total"));
                if (disk.getLong("total") != null) nodeSnapshot.setDiskTotal(disk.getLong("total"));
            }

            // Network
            JSONObject network = data.getJSONObject("network");
            if (network != null) {
                metric.setNetIn(network.getLong("totalBytesRecvRate"));
                metric.setNetOut(network.getLong("totalBytesSentRate"));
                metric.setNetTotalUp(network.getLong("totalBytesSentTotal"));
                metric.setNetTotalDown(network.getLong("totalBytesRecvTotal"));
            }

            // Network connections
            JSONObject netConn = data.getJSONObject("networkConnection");
            if (netConn != null) {
                metric.setConnections(netConn.getInteger("total"));
            }

            // Host info (load, uptime, procs, kernel, virtualization)
            JSONObject host = data.getJSONObject("host");
            if (host != null) {
                metric.setLoad1(host.getDouble("load1"));
                metric.setLoad5(host.getDouble("load5"));
                metric.setLoad15(host.getDouble("load15"));
                metric.setUptime(host.getLong("uptime"));
                metric.setProcessCount(host.getInteger("procs"));
                // Populate node snapshot system info from host
                if (StringUtils.hasText(host.getString("kernelVersion"))) {
                    nodeSnapshot.setKernelVersion(host.getString("kernelVersion"));
                }
                if (StringUtils.hasText(host.getString("virtualizationSystem"))) {
                    nodeSnapshot.setVirtualization(host.getString("virtualizationSystem"));
                }
                if (StringUtils.hasText(host.getString("platform"))) {
                    String osInfo = host.getString("platform");
                    if (StringUtils.hasText(host.getString("platformVersion"))) {
                        osInfo += " " + host.getString("platformVersion");
                    }
                    nodeSnapshot.setOs(osInfo);
                }
            }

            // GPU (take first GPU if array)
            JSONArray gpuArr = data.getJSONArray("gpu");
            if (gpuArr != null && !gpuArr.isEmpty()) {
                JSONObject gpu = gpuArr.getJSONObject(0);
                metric.setGpuUsage(gpu.getDouble("utilization"));
                if (StringUtils.hasText(gpu.getString("name"))) {
                    nodeSnapshot.setGpuName(gpu.getString("name"));
                }
            }

            // Temperature (take first sensor)
            JSONArray tempArr = data.getJSONArray("temperature");
            if (tempArr != null && !tempArr.isEmpty()) {
                metric.setTemperature(tempArr.getJSONObject(0).getDouble("temperature"));
            }

            metric.setSampledAt(now);
            metric.setUpdatedTime(now);

            if (metric.getId() == null) {
                monitorMetricLatestMapper.insert(metric);
            } else {
                monitorMetricLatestMapper.updateById(metric);
            }

            // Update node snapshot with enriched data from metrics
            monitorNodeSnapshotMapper.updateById(nodeSnapshot);
        } catch (Exception e) {
            log.debug("[MonitorSync] Failed to apply Pika metrics for agent {}: {}", agentId, e.getMessage());
        }
    }

    // ==================== Auto-Create / Link Asset from Probe Node ====================

    /**
     * Auto-create or link an asset for a probe node.
     * For dual-probe support: if an asset with the same IP already exists, link to it
     * instead of creating a duplicate.
     */
    private boolean autoCreateOrLinkAssetFromNode(MonitorNodeSnapshot node, MonitorInstance instance) {
        if (node.getAssetId() != null) return false;

        boolean isPika = TYPE_PIKA.equalsIgnoreCase(instance.getType());

        // Check if an asset already references this specific node UUID
        if (isPika) {
            int existingPika = assetHostMapper.selectCount(new LambdaQueryWrapper<AssetHost>()
                    .eq(AssetHost::getPikaNodeId, node.getRemoteNodeUuid())
                    .eq(AssetHost::getStatus, 0)).intValue();
            if (existingPika > 0) return false;
        } else {
            int existingKomari = assetHostMapper.selectCount(new LambdaQueryWrapper<AssetHost>()
                    .eq(AssetHost::getMonitorNodeUuid, node.getRemoteNodeUuid())
                    .eq(AssetHost::getStatus, 0)).intValue();
            if (existingKomari > 0) return false;
        }

        // Dual-probe IP matching: try to find an existing asset with the same IP
        if (StringUtils.hasText(node.getIp())) {
            AssetHost existingByIp = assetHostMapper.selectOne(new LambdaQueryWrapper<AssetHost>()
                    .eq(AssetHost::getPrimaryIp, node.getIp())
                    .eq(AssetHost::getStatus, 0)
                    .last("LIMIT 1"));
            if (existingByIp != null) {
                // Link this node to the existing asset (dual-probe binding)
                if (isPika) {
                    existingByIp.setPikaNodeId(node.getRemoteNodeUuid());
                } else {
                    existingByIp.setMonitorNodeUuid(node.getRemoteNodeUuid());
                }
                existingByIp.setUpdatedTime(System.currentTimeMillis());
                assetHostMapper.updateById(existingByIp);
                node.setAssetId(existingByIp.getId());
                monitorNodeSnapshotMapper.updateById(node);
                log.info("[MonitorSync] Linked {} node {} to existing asset '{}' by IP match ({})",
                        instance.getType(), node.getRemoteNodeUuid(), existingByIp.getName(), node.getIp());
                return false; // Not a new asset, just linked
            }
        }

        // Create new asset
        String assetName = StringUtils.hasText(node.getName()) ? node.getName() : node.getIp();
        if (!StringUtils.hasText(assetName)) {
            assetName = node.getRemoteNodeUuid().substring(0, 8);
        }
        int nameCount = assetHostMapper.selectCount(new LambdaQueryWrapper<AssetHost>()
                .eq(AssetHost::getName, assetName)
                .eq(AssetHost::getStatus, 0)).intValue();
        if (nameCount > 0) {
            assetName = assetName + "-" + node.getRemoteNodeUuid().substring(0, 4);
        }

        long now = System.currentTimeMillis();
        AssetHost asset = new AssetHost();
        asset.setName(assetName);
        asset.setPrimaryIp(node.getIp());
        asset.setIpv6(node.getIpv6());
        asset.setOs(node.getOs());
        asset.setOsCategory(deriveOsCategory(node.getOs()));
        asset.setCpuCores(node.getCpuCores());
        asset.setRegion(node.getRegion());
        asset.setCpuName(node.getCpuName());
        asset.setArch(node.getArch());
        asset.setVirtualization(node.getVirtualization());
        asset.setKernelVersion(node.getKernelVersion());
        asset.setGpuName(node.getGpuName());
        asset.setCreatedTime(now);
        asset.setUpdatedTime(now);
        asset.setStatus(0);

        // Set label from probe name (unique server identifier)
        if (StringUtils.hasText(node.getName())) {
            asset.setLabel(node.getName());
        }

        // Set probe link based on type
        if (isPika) {
            asset.setPikaNodeId(node.getRemoteNodeUuid());
        } else {
            asset.setMonitorNodeUuid(node.getRemoteNodeUuid());
        }

        // Convert bytes → MB/GB
        if (node.getMemTotal() != null && node.getMemTotal() > 0) {
            asset.setMemTotalMb((int) (node.getMemTotal() / (1024 * 1024)));
        }
        if (node.getDiskTotal() != null && node.getDiskTotal() > 0) {
            asset.setDiskTotalGb((int) (node.getDiskTotal() / (1024L * 1024 * 1024)));
        }
        if (node.getSwapTotal() != null && node.getSwapTotal() > 0) {
            asset.setSwapTotalMb((int) (node.getSwapTotal() / (1024 * 1024)));
        }

        // Sync billing info from probe (Komari)
        applyProbeBillingToAsset(asset, node);

        // Sync tags from probe
        applyProbeTagsToAsset(asset, node);

        try {
            assetHostMapper.insert(asset);
            node.setAssetId(asset.getId());
            monitorNodeSnapshotMapper.updateById(node);
            log.info("[MonitorSync] Auto-created asset '{}' from {} node {}", assetName, instance.getType(), node.getRemoteNodeUuid());
            return true;
        } catch (Exception e) {
            log.warn("[MonitorSync] Failed to auto-create asset for node {}: {}", node.getRemoteNodeUuid(), e.getMessage());
            return false;
        }
    }

    /**
     * Sync billing fields from probe snapshot to asset (only fills empty fields).
     * Komari provides: price, billingCycle, currency, expiredAt.
     */
    private void applyProbeBillingToAsset(AssetHost asset, MonitorNodeSnapshot node) {
        // monthlyCost ← price (convert to string)
        if (!StringUtils.hasText(asset.getMonthlyCost()) && node.getPrice() != null && node.getPrice() > 0) {
            asset.setMonthlyCost(String.valueOf(node.getPrice()));
        }
        // billingCycle
        if (asset.getBillingCycle() == null && node.getBillingCycle() != null && node.getBillingCycle() > 0) {
            asset.setBillingCycle(node.getBillingCycle());
        }
        // currency
        if (!StringUtils.hasText(asset.getCurrency()) && StringUtils.hasText(node.getCurrency())) {
            asset.setCurrency(node.getCurrency());
        }
        // expireDate ← expiredAt
        if (asset.getExpireDate() == null && node.getExpiredAt() != null && node.getExpiredAt() > 0) {
            // Skip far-future dates (Komari uses year > 2200 for "lifetime")
            long yearMs = 365L * 24 * 3600 * 1000;
            if (node.getExpiredAt() < System.currentTimeMillis() + 100 * yearMs) {
                asset.setExpireDate(node.getExpiredAt());
            }
        }
    }

    /**
     * Merge probe tags into asset tags.
     * Probe tags are added to asset tags; existing user tags are preserved.
     */
    private void applyProbeTagsToAsset(AssetHost asset, MonitorNodeSnapshot node) {
        if (!StringUtils.hasText(node.getTags())) return;
        try {
            // Parse probe tags
            java.util.Set<String> probeTags = new java.util.LinkedHashSet<>();
            com.alibaba.fastjson2.JSONArray probeArr = com.alibaba.fastjson2.JSON.parseArray(node.getTags());
            if (probeArr != null) {
                for (int i = 0; i < probeArr.size(); i++) {
                    String t = probeArr.getString(i);
                    if (StringUtils.hasText(t)) probeTags.add(t.trim());
                }
            }
            if (probeTags.isEmpty()) return;

            // Parse existing asset tags
            java.util.Set<String> assetTags = new java.util.LinkedHashSet<>();
            if (StringUtils.hasText(asset.getTags())) {
                try {
                    com.alibaba.fastjson2.JSONArray existArr = com.alibaba.fastjson2.JSON.parseArray(asset.getTags());
                    if (existArr != null) {
                        for (int i = 0; i < existArr.size(); i++) {
                            String t = existArr.getString(i);
                            if (StringUtils.hasText(t)) assetTags.add(t.trim());
                        }
                    }
                } catch (Exception ignored) {
                    // Fallback: comma/semicolon separated
                    for (String t : asset.getTags().split("[;,]")) {
                        if (StringUtils.hasText(t.trim())) assetTags.add(t.trim());
                    }
                }
            }

            // Merge: add probe tags that don't exist yet
            assetTags.addAll(probeTags);

            // Write back as JSON array
            com.alibaba.fastjson2.JSONArray merged = new com.alibaba.fastjson2.JSONArray();
            merged.addAll(assetTags);
            asset.setTags(merged.toJSONString());
        } catch (Exception e) {
            log.debug("[MonitorSync] Failed to merge probe tags: {}", e.getMessage());
        }
    }

    /**
     * Ongoing sync: refresh existing asset with probe data (label, tags, billing).
     * Only fills empty fields — never overwrites user-edited values.
     */
    private void refreshAssetFromProbe(MonitorNodeSnapshot node) {
        if (node.getAssetId() == null) return;
        try {
            AssetHost asset = assetHostMapper.selectById(node.getAssetId());
            if (asset == null || asset.getStatus() != 0) return;

            boolean changed = false;
            // Parse user-edited fields to skip during sync
            Set<String> userEdited = AssetHostServiceImpl.parseUserEditedFields(asset.getUserEditedFields());

            // Label: sync from probe name if asset label is empty AND user hasn't edited it
            if (!userEdited.contains("label") && !StringUtils.hasText(asset.getLabel()) && StringUtils.hasText(node.getName())) {
                asset.setLabel(node.getName());
                changed = true;
            }

            // OS + osCategory: sync from probe unless user has manually edited
            if (!userEdited.contains("os") && StringUtils.hasText(node.getOs())) {
                String newOs = node.getOs();
                String newCat = deriveOsCategory(newOs);
                if (!newOs.equals(asset.getOs()) || !java.util.Objects.equals(newCat, asset.getOsCategory())) {
                    asset.setOs(newOs);
                    asset.setOsCategory(newCat);
                    changed = true;
                }
            } else if (StringUtils.hasText(asset.getOs()) && !StringUtils.hasText(asset.getOsCategory())) {
                asset.setOsCategory(deriveOsCategory(asset.getOs()));
                changed = true;
            }

            // Hardware: sync from probe unless user has manually edited specific fields
            if (!userEdited.contains("cpuCores") && node.getCpuCores() != null && !java.util.Objects.equals(node.getCpuCores(), asset.getCpuCores())) {
                asset.setCpuCores(node.getCpuCores()); changed = true;
            }
            if (!userEdited.contains("memTotalMb") && node.getMemTotal() != null) {
                Integer memMb = (int) (node.getMemTotal() / (1024 * 1024));
                if (!java.util.Objects.equals(memMb, asset.getMemTotalMb())) { asset.setMemTotalMb(memMb); changed = true; }
            }
            if (!userEdited.contains("diskTotalGb") && node.getDiskTotal() != null) {
                Integer diskGb = (int) (node.getDiskTotal() / (1024 * 1024 * 1024));
                if (!java.util.Objects.equals(diskGb, asset.getDiskTotalGb())) { asset.setDiskTotalGb(diskGb); changed = true; }
            }
            if (StringUtils.hasText(node.getCpuName()) && !node.getCpuName().equals(asset.getCpuName())) {
                asset.setCpuName(node.getCpuName()); changed = true;
            }
            if (StringUtils.hasText(node.getArch()) && !node.getArch().equals(asset.getArch())) {
                asset.setArch(node.getArch()); changed = true;
            }
            if (StringUtils.hasText(node.getVirtualization()) && !node.getVirtualization().equals(asset.getVirtualization())) {
                asset.setVirtualization(node.getVirtualization()); changed = true;
            }
            if (StringUtils.hasText(node.getKernelVersion()) && !node.getKernelVersion().equals(asset.getKernelVersion())) {
                asset.setKernelVersion(node.getKernelVersion()); changed = true;
            }
            if (StringUtils.hasText(node.getGpuName()) && !node.getGpuName().equals(asset.getGpuName())) {
                asset.setGpuName(node.getGpuName()); changed = true;
            }
            if (node.getSwapTotal() != null) {
                Integer swapMb = (int) (node.getSwapTotal() / (1024 * 1024));
                if (!java.util.Objects.equals(swapMb, asset.getSwapTotalMb())) { asset.setSwapTotalMb(swapMb); changed = true; }
            }

            // Billing: fill empty fields, skip user-edited ones
            if (!userEdited.contains("monthlyCost") && !userEdited.contains("currency")
                    && !userEdited.contains("billingCycle") && !userEdited.contains("expireDate")) {
                String prevCost = asset.getMonthlyCost();
                Integer prevCycle = asset.getBillingCycle();
                String prevCurrency = asset.getCurrency();
                Long prevExpire = asset.getExpireDate();
                applyProbeBillingToAsset(asset, node);
                if (!java.util.Objects.equals(prevCost, asset.getMonthlyCost())
                        || !java.util.Objects.equals(prevCycle, asset.getBillingCycle())
                        || !java.util.Objects.equals(prevCurrency, asset.getCurrency())
                        || !java.util.Objects.equals(prevExpire, asset.getExpireDate())) {
                    changed = true;
                }
            }

            // Tags: only fill if asset has no tags AND user hasn't edited tags
            if (!userEdited.contains("tags") && !StringUtils.hasText(asset.getTags())) {
                String prevTags = asset.getTags();
                applyProbeTagsToAsset(asset, node);
                if (!java.util.Objects.equals(prevTags, asset.getTags())) {
                    changed = true;
                }
            }

            if (changed) {
                asset.setUpdatedTime(System.currentTimeMillis());
                assetHostMapper.updateById(asset);
            }
        } catch (Exception e) {
            log.debug("[MonitorSync] Failed to refresh asset from probe {}: {}", node.getRemoteNodeUuid(), e.getMessage());
        }
    }

    /**
     * Legacy wrapper - Komari sync still calls this.
     */
    private boolean autoCreateAssetFromNode(MonitorNodeSnapshot node, MonitorInstance instance) {
        return autoCreateOrLinkAssetFromNode(node, instance);
    }

    // ==================== HTTP Client ====================

    private String httpGet(MonitorInstance instance, String path, Integer allowInsecureTls) {
        String baseUrl = instance.getBaseUrl().replaceAll("/+$", "");
        String url = baseUrl + path;
        String cbKey = extractCircuitBreakerKey(baseUrl);

        // 熔断检查：节点宕机时快速失败，不等待超时
        if (!circuitBreaker.allowRequest(cbKey)) {
            throw new SimpleCircuitBreaker.CircuitBreakerOpenException(cbKey);
        }

        boolean insecure = allowInsecureTls != null && allowInsecureTls == 1;
        CloseableHttpClient client = insecure ? POOLED_INSECURE_CLIENT : POOLED_CLIENT;
        HttpGet request = new HttpGet(url);
        request.setConfig(RequestConfig.custom()
                .setConnectTimeout(10_000)
                .setSocketTimeout(15_000)
                .build());

        if (StringUtils.hasText(instance.getApiKey())) {
            request.setHeader("Authorization", "Bearer " + instance.getApiKey());
        }
        request.setHeader("Accept", "application/json");

        try (CloseableHttpResponse response = client.execute(request)) {
            int statusCode = response.getStatusLine().getStatusCode();
            String body = EntityUtils.toString(response.getEntity(), StandardCharsets.UTF_8);
            if (statusCode >= 200 && statusCode < 300) {
                circuitBreaker.recordSuccess(cbKey);
                return body;
            }
            circuitBreaker.recordFailure(cbKey);
            throw new RuntimeException("HTTP " + statusCode + ": " + truncate(body, 200));
        } catch (SimpleCircuitBreaker.CircuitBreakerOpenException e) {
            throw e;
        } catch (RuntimeException e) {
            circuitBreaker.recordFailure(cbKey);
            throw e;
        } catch (Exception e) {
            circuitBreaker.recordFailure(cbKey);
            throw new RuntimeException("Request failed: " + e.getMessage(), e);
        }
    }

    private String httpPost(MonitorInstance instance, String path, String jsonBody, Integer allowInsecureTls) {
        String baseUrl = instance.getBaseUrl().replaceAll("/+$", "");
        String url = baseUrl + path;
        String cbKey = extractCircuitBreakerKey(baseUrl);

        if (!circuitBreaker.allowRequest(cbKey)) {
            throw new SimpleCircuitBreaker.CircuitBreakerOpenException(cbKey);
        }

        boolean insecure = allowInsecureTls != null && allowInsecureTls == 1;
        CloseableHttpClient client = insecure ? POOLED_INSECURE_CLIENT : POOLED_CLIENT;
        HttpPost request = new HttpPost(url);
        request.setConfig(RequestConfig.custom()
                .setConnectTimeout(10_000)
                .setSocketTimeout(15_000)
                .build());

        if (StringUtils.hasText(instance.getApiKey())) {
            request.setHeader("Authorization", "Bearer " + instance.getApiKey());
        }
        request.setHeader("Accept", "application/json");
        request.setHeader("Content-Type", "application/json");
        if (jsonBody != null) {
            request.setEntity(new StringEntity(jsonBody, StandardCharsets.UTF_8));
        }

        try (CloseableHttpResponse response = client.execute(request)) {
            int statusCode = response.getStatusLine().getStatusCode();
            String body = EntityUtils.toString(response.getEntity(), StandardCharsets.UTF_8);
            if (statusCode >= 200 && statusCode < 300) {
                circuitBreaker.recordSuccess(cbKey);
                return body;
            }
            circuitBreaker.recordFailure(cbKey);
            throw new RuntimeException("HTTP " + statusCode + ": " + truncate(body, 200));
        } catch (SimpleCircuitBreaker.CircuitBreakerOpenException e) {
            throw e;
        } catch (RuntimeException e) {
            circuitBreaker.recordFailure(cbKey);
            throw e;
        } catch (Exception e) {
            circuitBreaker.recordFailure(cbKey);
            throw new RuntimeException("Request failed: " + e.getMessage(), e);
        }
    }

    /** 从 URL 提取 host:port 作为熔断器 key */
    private String extractCircuitBreakerKey(String baseUrl) {
        try {
            java.net.URL u = new java.net.URL(baseUrl);
            return u.getHost() + ":" + (u.getPort() > 0 ? u.getPort() : u.getDefaultPort());
        } catch (Exception e) {
            return baseUrl;
        }
    }

    // ==================== Helpers ====================

    private MonitorInstance getRequiredInstance(Long id) {
        MonitorInstance instance = this.getById(id);
        if (instance == null) {
            throw new IllegalStateException("探针实例不存在");
        }
        return instance;
    }

    private MonitorNodeSnapshot getRequiredNode(Long nodeId) {
        MonitorNodeSnapshot node = monitorNodeSnapshotMapper.selectById(nodeId);
        if (node == null) {
            throw new IllegalStateException("探针节点不存在");
        }
        return node;
    }

    private void validateDuplicateName(String name, Long ignoreId) {
        LambdaQueryWrapper<MonitorInstance> query = new LambdaQueryWrapper<MonitorInstance>()
                .eq(MonitorInstance::getName, name.trim());
        if (ignoreId != null) {
            query.ne(MonitorInstance::getId, ignoreId);
        }
        if (monitorInstanceMapper.selectCount(query) > 0) {
            throw new IllegalStateException("已存在同名探针实例");
        }
    }

    private void applyDto(MonitorInstance instance, String name, String type, String baseUrl, String apiKey,
                           String username, Integer syncEnabled, Integer syncIntervalMinutes, Integer allowInsecureTls, String remark) {
        instance.setName(name != null ? name.trim() : null);
        instance.setType(type != null ? type.trim().toLowerCase(Locale.ROOT) : TYPE_KOMARI);
        instance.setBaseUrl(baseUrl != null ? baseUrl.trim().replaceAll("/+$", "") : null);
        if (apiKey != null && !apiKey.trim().isEmpty()) {
            instance.setApiKey(apiKey.trim());
        }
        if (username != null && !username.trim().isEmpty()) {
            instance.setUsername(username.trim());
        }
        instance.setSyncEnabled(syncEnabled != null ? syncEnabled : 1);
        instance.setSyncIntervalMinutes(syncIntervalMinutes != null ? syncIntervalMinutes : 5);
        instance.setAllowInsecureTls(allowInsecureTls != null ? allowInsecureTls : 0);
        instance.setRemark(remark != null ? remark.trim() : null);
    }

    private MonitorInstanceViewDto toInstanceView(MonitorInstance instance) {
        MonitorInstanceViewDto dto = new MonitorInstanceViewDto();
        BeanUtils.copyProperties(instance, dto);
        return dto;
    }

    private List<MonitorNodeSnapshotViewDto> buildNodeViews(List<MonitorNodeSnapshot> nodes, String instanceName) {
        if (nodes == null || nodes.isEmpty()) {
            return Collections.emptyList();
        }

        List<Long> nodeIds = nodes.stream().map(MonitorNodeSnapshot::getId).collect(Collectors.toList());
        List<String> uuids = nodes.stream().map(MonitorNodeSnapshot::getRemoteNodeUuid).collect(Collectors.toList());
        Set<Long> instanceIds = nodes.stream().map(MonitorNodeSnapshot::getInstanceId).collect(Collectors.toSet());

        // Build instance info map (name + type)
        List<MonitorInstance> instances = this.listByIds(instanceIds);
        Map<Long, MonitorInstance> instanceMap = instances.stream()
                .collect(Collectors.toMap(MonitorInstance::getId, i -> i, (a, b) -> a));

        List<MonitorMetricLatest> metrics = monitorMetricLatestMapper.selectList(new LambdaQueryWrapper<MonitorMetricLatest>()
                .in(MonitorMetricLatest::getInstanceId, instanceIds)
                .in(MonitorMetricLatest::getRemoteNodeUuid, uuids));
        Map<String, MonitorMetricLatest> metricMap = new HashMap<>();
        for (MonitorMetricLatest m : metrics) {
            metricMap.put(m.getInstanceId() + ":" + m.getRemoteNodeUuid(), m);
        }

        return nodes.stream().map(node -> {
            MonitorNodeSnapshotViewDto dto = new MonitorNodeSnapshotViewDto();
            BeanUtils.copyProperties(node, dto);
            // Fill instance name and type
            MonitorInstance inst = instanceMap.get(node.getInstanceId());
            if (inst != null) {
                dto.setInstanceName(instanceName != null ? instanceName : inst.getName());
                dto.setInstanceType(inst.getType());
                dto.setInstanceBaseUrl(inst.getBaseUrl());
            } else {
                dto.setInstanceName(instanceName);
            }

            MonitorMetricLatest metric = metricMap.get(node.getInstanceId() + ":" + node.getRemoteNodeUuid());
            if (metric != null) {
                MonitorMetricLatestViewDto metricDto = new MonitorMetricLatestViewDto();
                BeanUtils.copyProperties(metric, metricDto);
                dto.setLatestMetric(metricDto);
            }

            // Compute offline diagnostics
            long now = System.currentTimeMillis();
            boolean isOnline = node.getOnline() != null && node.getOnline() == 1;
            boolean everConnected = node.getFirstSeenAt() != null || (node.getLastActiveAt() != null && node.getLastActiveAt() > 0);

            if (isOnline) {
                dto.setConnectionStatus("online");
            } else if (!everConnected) {
                dto.setConnectionStatus("never_connected");
                dto.setOfflineReason("never_connected");
            } else {
                dto.setConnectionStatus("offline");
                // Calculate offline duration from lastActiveAt
                Long lastActive = node.getLastActiveAt();
                if (lastActive != null && lastActive > 0) {
                    dto.setOfflineDuration(now - lastActive);
                }
                // Infer offline reason
                Long lastSync = node.getLastSyncAt();
                if (lastSync == null || (now - lastSync) > 600_000) {
                    // Probe hasn't synced in 10+ minutes → probe unreachable or server down
                    dto.setOfflineReason("probe_unreachable");
                } else if (node.getStatus() != null && node.getStatus() == 1) {
                    // Status=1 means probe no longer reports this node
                    dto.setOfflineReason("probe_removed");
                } else {
                    dto.setOfflineReason("server_down");
                }
            }

            return dto;
        }).collect(Collectors.toList());
    }

    private MonitorProviderSummaryViewDto buildProviderSummary(MonitorInstance instance, List<MonitorNodeSnapshot> nodes) {
        MonitorProviderSummaryViewDto summary = new MonitorProviderSummaryViewDto();
        summary.setType(instance.getType());
        summary.setTotalNodes(nodes == null ? 0 : nodes.size());
        summary.setOnlineNodes((int) (nodes == null ? 0 : nodes.stream()
                .filter(node -> node.getOnline() != null && node.getOnline() == 1)
                .count()));

        if (TYPE_PIKA.equalsIgnoreCase(instance.getType())) {
            summary.setPikaSecurity(loadPikaSecuritySummary(instance, nodes));
        } else if (TYPE_KOMARI.equalsIgnoreCase(instance.getType())) {
            summary.setKomariOperations(loadKomariOperationsSummary(instance, nodes));
        }
        return summary;
    }

    private PikaSecuritySummaryViewDto loadPikaSecuritySummary(MonitorInstance instance, List<MonitorNodeSnapshot> nodes) {
        PikaSecuritySummaryViewDto summary = new PikaSecuritySummaryViewDto();
        List<MonitorProviderHighlightViewDto> highlights = new ArrayList<>();
        summary.setHighlights(highlights);

        String jwt;
        try {
            jwt = loginPika(instance);
        } catch (Exception e) {
            log.warn("[MonitorDetail] Pika login failed for {}: {}", instance.getName(), e.getMessage());
            summary.setLoginError(shortenError(e.getMessage()));
            return summary;
        }
        String baseUrl = instance.getBaseUrl().replaceAll("/+$", "");
        Integer tls = instance.getAllowInsecureTls();

        Map<String, String> agentNames = new HashMap<>();
        if (nodes != null) {
            for (MonitorNodeSnapshot node : nodes) {
                agentNames.put(node.getRemoteNodeUuid(), StringUtils.hasText(node.getName()) ? node.getName() : node.getRemoteNodeUuid());
            }
        }

        JSONObject monitorsPayload = parseFlexiblePayload(httpGetWithToken(
                baseUrl + "/api/admin/monitors?pageIndex=1&pageSize=200&sortOrder=asc&sortField=name",
                jwt,
                tls));
        JSONArray monitorItems = extractItemsArray(monitorsPayload);
        summary.setTotalMonitors(extractTotalCount(monitorsPayload, monitorItems));
        summary.setEnabledMonitors((int) monitorItems.stream()
                .filter(item -> item instanceof JSONObject && ((JSONObject) item).getBooleanValue("enabled"))
                .count());
        summary.setPublicMonitors((int) monitorItems.stream()
                .filter(item -> item instanceof JSONObject && "public".equalsIgnoreCase(((JSONObject) item).getString("visibility")))
                .count());
        for (int i = 0; i < Math.min(3, monitorItems.size()); i++) {
            JSONObject item = monitorItems.getJSONObject(i);
            addHighlight(highlights,
                    item.getString("name"),
                    "service-monitor",
                    buildPikaMonitorDetail(item),
                    item.getBooleanValue("enabled") ? "info" : "muted",
                    item.getJSONArray("agentIds") == null ? null : item.getJSONArray("agentIds").size(),
                    item.getLong("updatedAt"));
        }

        JSONObject alertPayload = parseFlexiblePayload(httpGetWithToken(
                baseUrl + "/api/admin/alert-records?pageIndex=1&pageSize=10&sortOrder=desc&sortField=fired_at",
                jwt,
                tls));
        JSONArray alertItems = extractItemsArray(alertPayload);
        summary.setAlertRecordCount(extractTotalCount(alertPayload, alertItems));
        for (int i = 0; i < Math.min(3, alertItems.size()); i++) {
            JSONObject item = alertItems.getJSONObject(i);
            addHighlight(highlights,
                    firstNonBlank(item.getString("configName"), item.getString("alertType"), "Pika Alert"),
                    "alert-record",
                    firstNonBlank(item.getString("message"), item.getString("agentName")),
                    normalizeSeverity(item.getString("level")),
                    null,
                    firstPositive(item.getLong("firedAt"), item.getLong("createdAt")));
        }

        int protectedNodes = 0;
        int tamperEventCount = 0;
        int tamperAlertCount = 0;
        int auditCoverage = 0;
        int publicPortCount = 0;
        int suspiciousProcessCount = 0;

        // Limit per-node detail fetching to avoid N+1 HTTP latency (4 requests per node)
        int maxNodeDetail = 5;
        int nodeDetailCount = 0;
        if (nodes != null) {
            for (MonitorNodeSnapshot node : nodes) {
                String agentId = node.getRemoteNodeUuid();
                if (!StringUtils.hasText(agentId) || !isSafePathSegment(agentId)) {
                    continue;
                }
                if (++nodeDetailCount > maxNodeDetail) {
                    break;
                }

                try {
                    JSONObject tamperConfig = unwrapDataObject(parseFlexiblePayload(httpGetWithToken(
                            baseUrl + "/api/admin/agents/" + agentId + "/tamper/config",
                            jwt,
                            tls)));
                    if (tamperConfig.getBooleanValue("enabled")) {
                        protectedNodes++;
                        JSONArray paths = tamperConfig.getJSONArray("paths");
                        addHighlight(highlights,
                                agentNames.get(agentId),
                                "tamper-config",
                                "防篡改已启用" + (paths == null || paths.isEmpty() ? "" : " · 路径 " + paths.size()),
                                "success",
                                paths == null ? null : paths.size(),
                                tamperConfig.getLong("updatedAt"));
                    }
                } catch (Exception e) {
                    log.debug("[MonitorDetail] Pika tamper config skipped for {}: {}", agentId, e.getMessage());
                }

                try {
                    JSONObject tamperEvents = parseFlexiblePayload(httpGetWithToken(
                            baseUrl + "/api/admin/agents/" + agentId + "/tamper/events?pageIndex=1&pageSize=3",
                            jwt,
                            tls));
                    JSONArray items = extractItemsArray(tamperEvents);
                    tamperEventCount += extractTotalCount(tamperEvents, items);
                    if (!items.isEmpty()) {
                        JSONObject event = items.getJSONObject(0);
                        addHighlight(highlights,
                                agentNames.get(agentId),
                                "tamper-event",
                                firstNonBlank(event.getString("path"), event.getString("details"), "检测到文件变化"),
                                "warning",
                                extractTotalCount(tamperEvents, items),
                                firstPositive(event.getLong("timestamp"), event.getLong("createdAt")));
                    }
                } catch (Exception e) {
                    log.debug("[MonitorDetail] Pika tamper events skipped for {}: {}", agentId, e.getMessage());
                }

                try {
                    JSONObject tamperAlerts = parseFlexiblePayload(httpGetWithToken(
                            baseUrl + "/api/admin/agents/" + agentId + "/tamper/alerts?pageIndex=1&pageSize=3",
                            jwt,
                            tls));
                    JSONArray items = extractItemsArray(tamperAlerts);
                    tamperAlertCount += extractTotalCount(tamperAlerts, items);
                    if (!items.isEmpty()) {
                        JSONObject event = items.getJSONObject(0);
                        addHighlight(highlights,
                                agentNames.get(agentId),
                                "tamper-alert",
                                firstNonBlank(event.getString("path"), event.getString("details"), "存在未恢复篡改告警"),
                                event.getBooleanValue("restored") ? "info" : "danger",
                                extractTotalCount(tamperAlerts, items),
                                firstPositive(event.getLong("timestamp"), event.getLong("createdAt")));
                    }
                } catch (Exception e) {
                    log.debug("[MonitorDetail] Pika tamper alerts skipped for {}: {}", agentId, e.getMessage());
                }

                try {
                    JSONObject auditResult = unwrapDataObject(parseFlexiblePayload(httpGetWithToken(
                            baseUrl + "/api/admin/agents/" + agentId + "/audit/result",
                            jwt,
                            tls)));
                    int nodePublicPorts = countPublicListeningPorts(auditResult);
                    int nodeSuspiciousProcesses = countSuspiciousProcesses(auditResult);
                    auditCoverage++;
                    publicPortCount += nodePublicPorts;
                    suspiciousProcessCount += nodeSuspiciousProcesses;
                    if (nodePublicPorts > 0 || nodeSuspiciousProcesses > 0) {
                        addHighlight(highlights,
                                agentNames.get(agentId),
                                "audit",
                                "公开监听端口 " + nodePublicPorts + " · 可疑进程 " + nodeSuspiciousProcesses,
                                nodePublicPorts > 0 || nodeSuspiciousProcesses > 0 ? "warning" : "info",
                                nodePublicPorts + nodeSuspiciousProcesses,
                                firstPositive(auditResult.getLong("endTime"), auditResult.getLong("startTime")));
                    }
                } catch (Exception e) {
                    log.debug("[MonitorDetail] Pika audit result skipped for {}: {}", agentId, e.getMessage());
                }
            }
        }

        summary.setTamperProtectedNodes(protectedNodes);
        summary.setTamperEventCount(tamperEventCount);
        summary.setTamperAlertCount(tamperAlertCount);
        summary.setAuditCoverageNodes(auditCoverage);
        summary.setPublicListeningPortCount(publicPortCount);
        summary.setSuspiciousProcessCount(suspiciousProcessCount);
        return summary;
    }

    private KomariOperationsSummaryViewDto loadKomariOperationsSummary(MonitorInstance instance, List<MonitorNodeSnapshot> nodes) {
        KomariOperationsSummaryViewDto summary = new KomariOperationsSummaryViewDto();
        List<MonitorProviderHighlightViewDto> highlights = new ArrayList<>();
        summary.setHighlights(highlights);

        Set<String> boundNodeIds = nodes == null
                ? Collections.emptySet()
                : nodes.stream()
                .map(MonitorNodeSnapshot::getRemoteNodeUuid)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());

        JSONObject publicNodesPayload = parseFlexiblePayload(httpGet(instance, "/api/nodes", instance.getAllowInsecureTls()));
        JSONArray publicNodeItems = extractItemsArray(publicNodesPayload);
        summary.setPublicNodeCount(publicNodeItems.size());
        int publicBoundNodes = 0;
        for (int i = 0; i < publicNodeItems.size(); i++) {
            JSONObject item = publicNodeItems.getJSONObject(i);
            if (boundNodeIds.contains(item.getString("uuid"))) {
                publicBoundNodes++;
            }
            if (i < 3) {
                addHighlight(highlights,
                        firstNonBlank(item.getString("name"), item.getString("uuid"), "Public Node"),
                        "public-node",
                        firstNonBlank(item.getString("region"), item.getString("os"), "公开节点"),
                        "info",
                        null,
                        null);
            }
        }
        summary.setPublicBoundNodeCount(publicBoundNodes);
        summary.setHiddenBoundNodeCount(Math.max(0, boundNodeIds.size() - publicBoundNodes));

        JSONObject pingPayload = parseFlexiblePayload(httpGet(instance, "/api/admin/ping/", instance.getAllowInsecureTls()));
        JSONArray pingItems = extractItemsArray(pingPayload);
        int relevantPingTasks = 0;
        for (int i = 0; i < pingItems.size(); i++) {
            JSONObject item = pingItems.getJSONObject(i);
            if (!matchesKomariClients(item.get("clients"), boundNodeIds)) {
                continue;
            }
            relevantPingTasks++;
            if (relevantPingTasks <= 3) {
                addHighlight(highlights,
                        item.getString("name"),
                        "ping-task",
                        firstNonBlank(item.getString("target"), item.getString("type"), "Ping Task"),
                        "info",
                        item.getJSONArray("clients") == null ? null : item.getJSONArray("clients").size(),
                        null);
            }
        }
        summary.setPingTaskCount(relevantPingTasks);

        JSONObject loadPayload = parseFlexiblePayload(httpGet(instance, "/api/admin/notification/load/", instance.getAllowInsecureTls()));
        JSONArray loadItems = extractItemsArray(loadPayload);
        int relevantLoadNotifications = 0;
        for (int i = 0; i < loadItems.size(); i++) {
            JSONObject item = loadItems.getJSONObject(i);
            if (!matchesKomariClients(item.get("clients"), boundNodeIds)) {
                continue;
            }
            relevantLoadNotifications++;
            if (relevantLoadNotifications <= 2) {
                addHighlight(highlights,
                        firstNonBlank(item.getString("name"), "负载告警"),
                        "load-notification",
                        "指标 " + firstNonBlank(item.getString("metric"), "cpu") + " > " + item.getString("threshold"),
                        "warning",
                        item.getJSONArray("clients") == null ? null : item.getJSONArray("clients").size(),
                        null);
            }
        }
        summary.setLoadNotificationCount(relevantLoadNotifications);

        JSONObject offlinePayload = parseFlexiblePayload(httpGet(instance, "/api/admin/notification/offline", instance.getAllowInsecureTls()));
        JSONArray offlineItems = extractItemsArray(offlinePayload);
        int relevantOfflineNotifications = 0;
        for (int i = 0; i < offlineItems.size(); i++) {
            JSONObject item = offlineItems.getJSONObject(i);
            if (!boundNodeIds.contains(item.getString("client"))) {
                continue;
            }
            relevantOfflineNotifications++;
            if (relevantOfflineNotifications <= 2) {
                addHighlight(highlights,
                        firstNonBlank(item.getJSONObject("client_info") == null ? null : item.getJSONObject("client_info").getString("name"),
                                item.getString("client")),
                        "offline-notification",
                        "离线宽限期 " + firstPositiveInteger(item.getInteger("grace_period"), 180) + " 秒",
                        item.getBooleanValue("enable") ? "warning" : "muted",
                        null,
                        null);
            }
        }
        summary.setOfflineNotificationCount(relevantOfflineNotifications);
        return summary;
    }

    private PikaNodeSecurityDetailDto loadPikaNodeSecurityDetail(MonitorInstance instance, MonitorNodeSnapshot node) {
        String agentId = trimToNull(node.getRemoteNodeUuid());
        if (!StringUtils.hasText(agentId) || !isSafePathSegment(agentId)) {
            throw new IllegalStateException("Pika 节点标识不合法");
        }

        String jwt = loginPika(instance);
        String baseUrl = instance.getBaseUrl().replaceAll("/+$", "");
        Integer tls = instance.getAllowInsecureTls();

        PikaNodeSecurityDetailDto detail = new PikaNodeSecurityDetailDto();
        detail.setTamperProtectedPaths(Collections.emptyList());
        detail.setAuditWarnings(Collections.emptyList());
        detail.setPublicListeningPorts(Collections.emptyList());
        detail.setSuspiciousProcesses(Collections.emptyList());
        detail.setRecentTamperEvents(Collections.emptyList());
        detail.setRecentTamperAlerts(Collections.emptyList());
        detail.setRecentAuditRuns(Collections.emptyList());

        try {
            JSONObject tamperConfig = unwrapDataObject(parseFlexiblePayload(httpGetWithToken(
                    baseUrl + "/api/admin/agents/" + agentId + "/tamper/config",
                    jwt,
                    tls)));
            detail.setTamperEnabled(tamperConfig.getBoolean("enabled"));
            detail.setTamperProtectedPaths(toStringList(tamperConfig.getJSONArray("paths"), 12));
            detail.setTamperApplyStatus(trimToNull(tamperConfig.getString("applyStatus")));
            detail.setTamperApplyMessage(trimToNull(tamperConfig.getString("applyMessage")));
        } catch (Exception e) {
            log.debug("[MonitorDetail] Skip Pika tamper config for {}: {}", agentId, e.getMessage());
        }

        try {
            JSONObject tamperEvents = parseFlexiblePayload(httpGetWithToken(
                    baseUrl + "/api/admin/agents/" + agentId + "/tamper/events?pageIndex=1&pageSize=6",
                    jwt,
                    tls));
            detail.setRecentTamperEvents(buildTamperEvents(extractItemsArray(tamperEvents), 6));
        } catch (Exception e) {
            log.debug("[MonitorDetail] Skip Pika tamper events for {}: {}", agentId, e.getMessage());
        }

        try {
            JSONObject tamperAlerts = parseFlexiblePayload(httpGetWithToken(
                    baseUrl + "/api/admin/agents/" + agentId + "/tamper/alerts?pageIndex=1&pageSize=6",
                    jwt,
                    tls));
            detail.setRecentTamperAlerts(buildTamperAlerts(extractItemsArray(tamperAlerts), 6));
        } catch (Exception e) {
            log.debug("[MonitorDetail] Skip Pika tamper alerts for {}: {}", agentId, e.getMessage());
        }

        try {
            JSONObject auditResult = unwrapDataObject(parseFlexiblePayload(httpGetWithToken(
                    baseUrl + "/api/admin/agents/" + agentId + "/audit/result",
                    jwt,
                    tls)));
            detail.setAuditStartTime(firstPositive(auditResult.getLong("startTime")));
            detail.setAuditEndTime(firstPositive(auditResult.getLong("endTime")));
            detail.setAuditWarnings(toStringList(auditResult.getJSONArray("collectWarnings"), 8));

            List<PikaListeningPortViewDto> ports = buildPublicListeningPorts(auditResult);
            detail.setPublicListeningPorts(ports);
            detail.setPublicListeningPortCount(ports.size());

            List<PikaProcessViewDto> suspicious = buildSuspiciousProcesses(auditResult);
            detail.setSuspiciousProcesses(suspicious);
            detail.setSuspiciousProcessCount(suspicious.size());
        } catch (Exception e) {
            log.debug("[MonitorDetail] Skip Pika audit detail for {}: {}", agentId, e.getMessage());
        }

        try {
            JSONObject auditRuns = parseFlexiblePayload(httpGetWithToken(
                    baseUrl + "/api/admin/agents/" + agentId + "/audit/results?pageIndex=1&pageSize=5",
                    jwt,
                    tls));
            detail.setRecentAuditRuns(buildAuditRuns(extractItemsArray(auditRuns), 5));
        } catch (Exception e) {
            log.debug("[MonitorDetail] Skip Pika audit history for {}: {}", agentId, e.getMessage());
        }

        if (detail.getPublicListeningPortCount() == null) {
            detail.setPublicListeningPortCount(0);
        }
        if (detail.getSuspiciousProcessCount() == null) {
            detail.setSuspiciousProcessCount(0);
        }
        return detail;
    }

    private KomariNodeOperationsDetailDto loadKomariNodeOperationsDetail(MonitorInstance instance, MonitorNodeSnapshot node) {
        String nodeUuid = trimToNull(node.getRemoteNodeUuid());
        if (!StringUtils.hasText(nodeUuid)) {
            throw new IllegalStateException("Komari 节点标识不存在");
        }

        KomariNodeOperationsDetailDto detail = new KomariNodeOperationsDetailDto();
        detail.setPingTasks(Collections.emptyList());
        detail.setLoadNotifications(Collections.emptyList());
        detail.setOfflineNotifications(Collections.emptyList());

        JSONObject publicNodesPayload = parseFlexiblePayload(httpGet(instance, "/api/nodes", instance.getAllowInsecureTls()));
        JSONArray publicNodes = extractItemsArray(publicNodesPayload);
        for (int i = 0; i < publicNodes.size(); i++) {
            JSONObject item = publicNodes.getJSONObject(i);
            if (!nodeUuid.equals(item.getString("uuid"))) {
                continue;
            }
            detail.setPublicVisible(true);
            detail.setPublicNodeName(trimToNull(firstNonBlank(item.getString("name"), item.getString("uuid"))));
            detail.setPublicNodeRegion(trimToNull(item.getString("region")));
            detail.setPublicNodeOs(trimToNull(item.getString("os")));
            break;
        }
        if (detail.getPublicVisible() == null) {
            detail.setPublicVisible(false);
        }

        JSONObject pingPayload = parseFlexiblePayload(httpGet(instance, "/api/admin/ping/", instance.getAllowInsecureTls()));
        JSONArray pingItems = extractItemsArray(pingPayload);
        List<KomariPingTaskViewDto> pingTasks = new ArrayList<>();
        for (int i = 0; i < pingItems.size(); i++) {
            JSONObject item = pingItems.getJSONObject(i);
            if (!matchesKomariClient(item.get("clients"), nodeUuid)) {
                continue;
            }
            KomariPingTaskViewDto dto = new KomariPingTaskViewDto();
            dto.setTaskId(item.getLong("id"));
            dto.setName(trimToNull(firstNonBlank(item.getString("name"), "Ping Task")));
            dto.setTarget(trimToNull(item.getString("target")));
            dto.setType(trimToNull(item.getString("type")));
            dto.setInterval(item.getInteger("interval"));
            dto.setClientCount(extractClientCount(item.get("clients")));
            pingTasks.add(dto);
        }
        detail.setPingTasks(pingTasks);

        JSONObject loadPayload = parseFlexiblePayload(httpGet(instance, "/api/admin/notification/load/", instance.getAllowInsecureTls()));
        JSONArray loadItems = extractItemsArray(loadPayload);
        List<KomariLoadNotificationViewDto> loadNotifications = new ArrayList<>();
        for (int i = 0; i < loadItems.size(); i++) {
            JSONObject item = loadItems.getJSONObject(i);
            if (!matchesKomariClient(item.get("clients"), nodeUuid)) {
                continue;
            }
            KomariLoadNotificationViewDto dto = new KomariLoadNotificationViewDto();
            dto.setName(trimToNull(firstNonBlank(item.getString("name"), "负载规则")));
            dto.setMetric(trimToNull(item.getString("metric")));
            dto.setThreshold(item.getDouble("threshold"));
            dto.setRatio(item.getDouble("ratio"));
            dto.setInterval(item.getInteger("interval"));
            loadNotifications.add(dto);
        }
        detail.setLoadNotifications(loadNotifications);

        JSONObject offlinePayload = parseFlexiblePayload(httpGet(instance, "/api/admin/notification/offline", instance.getAllowInsecureTls()));
        JSONArray offlineItems = extractItemsArray(offlinePayload);
        List<KomariOfflineNotificationViewDto> offlineNotifications = new ArrayList<>();
        for (int i = 0; i < offlineItems.size(); i++) {
            JSONObject item = offlineItems.getJSONObject(i);
            if (!nodeUuid.equals(item.getString("client"))) {
                continue;
            }
            KomariOfflineNotificationViewDto dto = new KomariOfflineNotificationViewDto();
            dto.setEnabled(item.getBoolean("enable"));
            dto.setGracePeriod(firstPositiveInteger(item.getInteger("grace_period"), 180));
            offlineNotifications.add(dto);
        }
        detail.setOfflineNotifications(offlineNotifications);
        return detail;
    }

    private KomariPingTaskDetailViewDto loadKomariPingTaskDetail(MonitorInstance instance,
                                                                 MonitorNodeSnapshot node,
                                                                 Long taskId,
                                                                 Integer hours) {
        String nodeUuid = trimToNull(node.getRemoteNodeUuid());
        if (!StringUtils.hasText(nodeUuid)) {
            throw new IllegalStateException("Komari 节点标识不存在");
        }
        int safeHours = hours != null && hours > 0 && hours <= 168 ? hours : 12;

        JSONObject pingPayload = parseFlexiblePayload(httpGet(instance, "/api/admin/ping/", instance.getAllowInsecureTls()));
        JSONArray pingItems = extractItemsArray(pingPayload);
        JSONObject matchedTask = null;
        for (int i = 0; i < pingItems.size(); i++) {
            JSONObject item = pingItems.getJSONObject(i);
            if (Objects.equals(item.getLong("id"), taskId) && matchesKomariClient(item.get("clients"), nodeUuid)) {
                matchedTask = item;
                break;
            }
        }
        if (matchedTask == null) {
            throw new IllegalStateException("未找到该节点对应的 Ping 任务");
        }

        String query = "/api/records/ping?uuid="
                + URLEncoder.encode(nodeUuid, StandardCharsets.UTF_8)
                + "&task_id=" + taskId
                + "&hours=" + safeHours;
        JSONObject recordsPayload = parseFlexiblePayload(httpGet(instance, query, instance.getAllowInsecureTls()));
        JSONArray records = recordsPayload.getJSONArray("records");
        JSONArray basicInfo = recordsPayload.getJSONArray("basic_info");

        KomariPingTaskDetailViewDto detail = new KomariPingTaskDetailViewDto();
        detail.setTaskId(taskId);
        detail.setName(trimToNull(firstNonBlank(matchedTask.getString("name"), "Ping Task")));
        detail.setTarget(trimToNull(matchedTask.getString("target")));
        detail.setType(trimToNull(matchedTask.getString("type")));
        detail.setInterval(matchedTask.getInteger("interval"));
        detail.setClientCount(extractClientCount(matchedTask.get("clients")));
        detail.setRecords(Collections.emptyList());

        if (basicInfo != null) {
            for (int i = 0; i < basicInfo.size(); i++) {
                JSONObject item = basicInfo.getJSONObject(i);
                if (!nodeUuid.equals(item.getString("client"))) {
                    continue;
                }
                detail.setLossPercent(item.getDouble("loss"));
                detail.setMinLatency(item.getInteger("min"));
                detail.setMaxLatency(item.getInteger("max"));
                break;
            }
        }

        List<KomariPingRecordViewDto> recordViews = new ArrayList<>();
        int totalRecordCount = 0;
        int lossCount = 0;
        long latencySum = 0L;
        int latencyCount = 0;
        Integer computedMinLatency = null;
        Integer computedMaxLatency = null;
        Long lastRecordAt = null;
        if (records != null) {
            for (int i = 0; i < records.size(); i++) {
                JSONObject item = records.getJSONObject(i);
                if (!Objects.equals(item.getLong("task_id"), taskId) || !nodeUuid.equals(item.getString("client"))) {
                    continue;
                }
                totalRecordCount++;
                KomariPingRecordViewDto dto = new KomariPingRecordViewDto();
                Integer value = item.getInteger("value");
                dto.setValue(value);
                dto.setLoss(value != null && value < 0);
                String time = item.getString("time");
                Long ts = null;
                try {
                    if (StringUtils.hasText(time)) {
                        ts = java.time.Instant.parse(time).toEpochMilli();
                    }
                } catch (Exception ignored) {
                }
                dto.setTime(ts);
                if (ts != null && (lastRecordAt == null || ts > lastRecordAt)) {
                    lastRecordAt = ts;
                }
                if (dto.getLoss() != null && dto.getLoss()) {
                    lossCount++;
                } else if (value != null) {
                    latencySum += value;
                    latencyCount++;
                    if (computedMinLatency == null || value < computedMinLatency) {
                        computedMinLatency = value;
                    }
                    if (computedMaxLatency == null || value > computedMaxLatency) {
                        computedMaxLatency = value;
                    }
                }
                if (recordViews.size() < 60) {
                    recordViews.add(dto);
                }
            }
        }
        detail.setRecords(recordViews);
        detail.setRecordCount(totalRecordCount);
        detail.setLossCount(lossCount);
        detail.setLastRecordAt(lastRecordAt);
        if (detail.getLossPercent() == null && !recordViews.isEmpty()) {
            detail.setLossPercent(lossCount * 100.0 / Math.max(1, totalRecordCount));
        }
        if (latencyCount > 0) {
            detail.setAvgLatency(latencySum * 1.0 / latencyCount);
        }
        if (detail.getMinLatency() == null) {
            detail.setMinLatency(computedMinLatency);
        }
        if (detail.getMaxLatency() == null) {
            detail.setMaxLatency(computedMaxLatency);
        }
        return detail;
    }

    private JSONObject parseFlexiblePayload(String responseJson) {
        if (!StringUtils.hasText(responseJson)) {
            return new JSONObject();
        }
        String trimmed = responseJson.trim();
        if (trimmed.startsWith("[")) {
            JSONObject wrapper = new JSONObject();
            JSONArray items = JSON.parseArray(trimmed);
            wrapper.put("items", items);
            wrapper.put("total", items == null ? 0 : items.size());
            return wrapper;
        }
        JSONObject object = JSON.parseObject(trimmed);
        return object == null ? new JSONObject() : object;
    }

    private JSONObject unwrapDataObject(JSONObject payload) {
        if (payload == null) {
            return new JSONObject();
        }
        Object data = payload.get("data");
        if (data instanceof JSONObject) {
            return (JSONObject) data;
        }
        return payload;
    }

    private JSONArray extractItemsArray(JSONObject payload) {
        if (payload == null) {
            return new JSONArray();
        }
        Object data = payload.get("data");
        if (data instanceof JSONArray) {
            return (JSONArray) data;
        }
        if (data instanceof JSONObject) {
            JSONObject dataObject = (JSONObject) data;
            JSONArray items = dataObject.getJSONArray("items");
            if (items != null) {
                return items;
            }
        }
        JSONArray items = payload.getJSONArray("items");
        if (items != null) {
            return items;
        }
        items = payload.getJSONArray("data");
        return items == null ? new JSONArray() : items;
    }

    private int extractTotalCount(JSONObject payload, JSONArray fallbackItems) {
        if (payload == null) {
            return fallbackItems == null ? 0 : fallbackItems.size();
        }
        Object data = payload.get("data");
        if (data instanceof JSONObject) {
            JSONObject dataObject = (JSONObject) data;
            Integer total = dataObject.getInteger("total");
            if (total != null) {
                return total;
            }
        }
        Integer total = payload.getInteger("total");
        if (total != null) {
            return total;
        }
        return fallbackItems == null ? 0 : fallbackItems.size();
    }

    private boolean matchesKomariClients(Object rawClients, Set<String> boundNodeIds) {
        if (boundNodeIds == null || boundNodeIds.isEmpty()) {
            return false;
        }
        JSONArray clients = null;
        if (rawClients instanceof JSONArray) {
            clients = (JSONArray) rawClients;
        } else if (rawClients instanceof Collection) {
            clients = new JSONArray();
            clients.addAll((Collection<?>) rawClients);
        } else if (rawClients instanceof String && StringUtils.hasText((String) rawClients)) {
            try {
                clients = JSON.parseArray((String) rawClients);
            } catch (Exception ignored) {
                return false;
            }
        }
        if (clients == null || clients.isEmpty()) {
            return false;
        }
        for (int i = 0; i < clients.size(); i++) {
            if (boundNodeIds.contains(clients.getString(i))) {
                return true;
            }
        }
        return false;
    }

    private boolean matchesKomariClient(Object rawClients, String nodeUuid) {
        return StringUtils.hasText(nodeUuid) && matchesKomariClients(rawClients, Collections.singleton(nodeUuid));
    }

    private int extractClientCount(Object rawClients) {
        if (rawClients instanceof JSONArray) {
            return ((JSONArray) rawClients).size();
        }
        if (rawClients instanceof Collection) {
            return ((Collection<?>) rawClients).size();
        }
        if (rawClients instanceof String && StringUtils.hasText((String) rawClients)) {
            try {
                JSONArray arr = JSON.parseArray((String) rawClients);
                return arr == null ? 0 : arr.size();
            } catch (Exception ignored) {
                return 0;
            }
        }
        return 0;
    }

    private List<String> toStringList(JSONArray array, int maxSize) {
        if (array == null || array.isEmpty()) {
            return Collections.emptyList();
        }
        List<String> values = new ArrayList<>();
        for (int i = 0; i < array.size() && values.size() < maxSize; i++) {
            String value = trimToNull(array.getString(i));
            if (StringUtils.hasText(value)) {
                values.add(value);
            }
        }
        return values;
    }

    private List<PikaTamperEventViewDto> buildTamperEvents(JSONArray items, int maxSize) {
        if (items == null || items.isEmpty()) {
            return Collections.emptyList();
        }
        List<PikaTamperEventViewDto> result = new ArrayList<>();
        for (int i = 0; i < items.size() && result.size() < maxSize; i++) {
            JSONObject item = items.getJSONObject(i);
            PikaTamperEventViewDto dto = new PikaTamperEventViewDto();
            dto.setPath(trimToNull(item.getString("path")));
            dto.setOperation(trimToNull(item.getString("operation")));
            dto.setDetails(trimToNull(firstNonBlank(item.getString("details"), item.getString("message"))));
            dto.setTimestamp(firstPositive(item.getLong("timestamp"), item.getLong("createdAt")));
            result.add(dto);
        }
        return result;
    }

    private List<PikaTamperAlertViewDto> buildTamperAlerts(JSONArray items, int maxSize) {
        if (items == null || items.isEmpty()) {
            return Collections.emptyList();
        }
        List<PikaTamperAlertViewDto> result = new ArrayList<>();
        for (int i = 0; i < items.size() && result.size() < maxSize; i++) {
            JSONObject item = items.getJSONObject(i);
            PikaTamperAlertViewDto dto = new PikaTamperAlertViewDto();
            dto.setPath(trimToNull(item.getString("path")));
            dto.setDetails(trimToNull(firstNonBlank(item.getString("details"), item.getString("message"))));
            dto.setRestored(item.getBoolean("restored"));
            dto.setTimestamp(firstPositive(item.getLong("timestamp"), item.getLong("createdAt")));
            result.add(dto);
        }
        return result;
    }

    private List<PikaListeningPortViewDto> buildPublicListeningPorts(JSONObject auditResult) {
        JSONObject inventory = auditResult.getJSONObject("assetInventory");
        if (inventory == null) {
            return Collections.emptyList();
        }
        JSONObject networkAssets = inventory.getJSONObject("networkAssets");
        if (networkAssets == null) {
            return Collections.emptyList();
        }
        JSONArray listeningPorts = networkAssets.getJSONArray("listeningPorts");
        if (listeningPorts == null || listeningPorts.isEmpty()) {
            return Collections.emptyList();
        }
        List<PikaListeningPortViewDto> result = new ArrayList<>();
        for (int i = 0; i < listeningPorts.size() && result.size() < 12; i++) {
            JSONObject item = listeningPorts.getJSONObject(i);
            if (!item.getBooleanValue("isPublic")) {
                continue;
            }
            PikaListeningPortViewDto dto = new PikaListeningPortViewDto();
            dto.setProtocol(trimToNull(item.getString("protocol")));
            dto.setAddress(trimToNull(item.getString("address")));
            dto.setPort(item.getInteger("port"));
            dto.setProcessName(trimToNull(item.getString("processName")));
            dto.setProcessPid(item.getInteger("processPid"));
            dto.setIsPublic(item.getBoolean("isPublic"));
            result.add(dto);
        }
        return result;
    }

    private List<PikaProcessViewDto> buildSuspiciousProcesses(JSONObject auditResult) {
        JSONObject inventory = auditResult.getJSONObject("assetInventory");
        if (inventory == null) {
            return Collections.emptyList();
        }
        JSONObject processAssets = inventory.getJSONObject("processAssets");
        if (processAssets == null) {
            return Collections.emptyList();
        }
        JSONArray suspiciousProcesses = processAssets.getJSONArray("suspiciousProcesses");
        if (suspiciousProcesses == null || suspiciousProcesses.isEmpty()) {
            return Collections.emptyList();
        }
        List<PikaProcessViewDto> result = new ArrayList<>();
        for (int i = 0; i < suspiciousProcesses.size() && result.size() < 12; i++) {
            JSONObject item = suspiciousProcesses.getJSONObject(i);
            PikaProcessViewDto dto = new PikaProcessViewDto();
            dto.setPid(item.getInteger("pid"));
            dto.setName(trimToNull(item.getString("name")));
            dto.setUsername(trimToNull(item.getString("username")));
            dto.setCpuPercent(item.getDouble("cpuPercent"));
            dto.setMemPercent(item.getDouble("memPercent"));
            dto.setExeDeleted(item.getBoolean("exeDeleted"));
            dto.setCmdline(trimToNull(item.getString("cmdline")));
            result.add(dto);
        }
        return result;
    }

    private List<PikaAuditRunViewDto> buildAuditRuns(JSONArray items, int maxSize) {
        if (items == null || items.isEmpty()) {
            return Collections.emptyList();
        }
        List<PikaAuditRunViewDto> result = new ArrayList<>();
        for (int i = 0; i < items.size() && result.size() < maxSize; i++) {
            JSONObject item = items.getJSONObject(i);
            PikaAuditRunViewDto dto = new PikaAuditRunViewDto();
            dto.setStartTime(item.getLong("startTime"));
            dto.setEndTime(item.getLong("endTime"));
            dto.setPassCount(item.getInteger("passCount"));
            dto.setFailCount(item.getInteger("failCount"));
            dto.setWarnCount(item.getInteger("warnCount"));
            dto.setTotalCount(item.getInteger("totalCount"));
            JSONObject systemInfo = item.getJSONObject("systemInfo");
            dto.setSystem(systemInfo == null
                    ? null
                    : trimToNull(firstNonBlank(systemInfo.getString("hostname"), systemInfo.getString("os"), systemInfo.getString("publicIP"))));
            result.add(dto);
        }
        return result;
    }

    private int countPublicListeningPorts(JSONObject auditResult) {
        JSONObject inventory = auditResult.getJSONObject("assetInventory");
        if (inventory == null) {
            return 0;
        }
        JSONObject networkAssets = inventory.getJSONObject("networkAssets");
        if (networkAssets == null) {
            return 0;
        }
        JSONArray listeningPorts = networkAssets.getJSONArray("listeningPorts");
        if (listeningPorts == null || listeningPorts.isEmpty()) {
            return 0;
        }
        int count = 0;
        for (int i = 0; i < listeningPorts.size(); i++) {
            JSONObject port = listeningPorts.getJSONObject(i);
            if (port.getBooleanValue("isPublic")) {
                count++;
            }
        }
        return count;
    }

    private int countSuspiciousProcesses(JSONObject auditResult) {
        JSONObject inventory = auditResult.getJSONObject("assetInventory");
        if (inventory == null) {
            return 0;
        }
        JSONObject processAssets = inventory.getJSONObject("processAssets");
        if (processAssets == null) {
            return 0;
        }
        JSONArray suspiciousProcesses = processAssets.getJSONArray("suspiciousProcesses");
        return suspiciousProcesses == null ? 0 : suspiciousProcesses.size();
    }

    private void addHighlight(List<MonitorProviderHighlightViewDto> highlights,
                              String title,
                              String category,
                              String detail,
                              String severity,
                              Integer count,
                              Long timestamp) {
        if (highlights == null || highlights.size() >= 8 || !StringUtils.hasText(title)) {
            return;
        }
        MonitorProviderHighlightViewDto item = new MonitorProviderHighlightViewDto();
        item.setTitle(title);
        item.setCategory(category);
        item.setDetail(trimToNull(detail));
        item.setSeverity(trimToNull(severity));
        item.setCount(count);
        item.setTimestamp(timestamp);
        highlights.add(item);
    }

    private String buildPikaMonitorDetail(JSONObject item) {
        String target = firstNonBlank(item.getString("target"), item.getString("description"));
        String type = firstNonBlank(item.getString("type"), "monitor");
        if (!StringUtils.hasText(target)) {
            return type;
        }
        return type + " -> " + target;
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }

    private Long firstPositive(Long... values) {
        if (values == null) {
            return null;
        }
        for (Long value : values) {
            if (value != null && value > 0) {
                return value;
            }
        }
        return null;
    }

    private int firstPositiveInteger(Integer value, int fallback) {
        return value != null && value > 0 ? value : fallback;
    }

    private String normalizeSeverity(String level) {
        if (!StringUtils.hasText(level)) {
            return "info";
        }
        String normalized = level.trim().toLowerCase(Locale.ROOT);
        if ("critical".equals(normalized) || "high".equals(normalized) || "error".equals(normalized)) {
            return "danger";
        }
        if ("medium".equals(normalized) || "warn".equals(normalized) || "warning".equals(normalized)) {
            return "warning";
        }
        if ("success".equals(normalized) || "resolved".equals(normalized)) {
            return "success";
        }
        return normalized;
    }

    // ==================== Node Status Query ====================

    @Override
    public R getNodeStatusByUuid(Long instanceId, String uuid) {
        if (instanceId == null || !StringUtils.hasText(uuid)) {
            return R.err("instanceId 和 uuid 不能为空");
        }
        MonitorInstance instance = getRequiredInstance(instanceId);

        // 1. Check if snapshot exists locally (already synced before)
        MonitorNodeSnapshot snapshot = monitorNodeSnapshotMapper.selectOne(new LambdaQueryWrapper<MonitorNodeSnapshot>()
                .eq(MonitorNodeSnapshot::getInstanceId, instanceId)
                .eq(MonitorNodeSnapshot::getRemoteNodeUuid, uuid));

        // 2. Query Komari directly for live online status
        boolean remoteOnline = false;
        boolean remoteExists = false;
        String remoteName = null;
        String remoteIp = null;
        try {
            JSONObject allMetrics = fetchAllMetricsViaRpc(instance);
            if (allMetrics != null && allMetrics.containsKey(uuid)) {
                remoteExists = true;
                JSONObject m = allMetrics.getJSONObject(uuid);
                remoteOnline = m != null && m.getBooleanValue("online");
            }
            // Also check client list for name/ip
            String clientsJson = httpGet(instance, "/api/admin/client/list", instance.getAllowInsecureTls());
            if (clientsJson != null) {
                JSONArray clients = clientsJson.trim().startsWith("[")
                        ? JSON.parseArray(clientsJson.trim())
                        : JSON.parseObject(clientsJson.trim()).getJSONArray("data");
                if (clients != null) {
                    for (int i = 0; i < clients.size(); i++) {
                        JSONObject c = clients.getJSONObject(i);
                        if (uuid.equals(c.getString("uuid"))) {
                            remoteExists = true;
                            remoteName = c.getString("name");
                            remoteIp = c.getString("ipv4");
                            break;
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[MonitorSync] Failed to query node status from remote: {}", e.getMessage());
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("uuid", uuid);
        result.put("remoteExists", remoteExists);
        result.put("remoteOnline", remoteOnline);
        result.put("remoteName", remoteName);
        result.put("remoteIp", remoteIp);
        result.put("snapshotExists", snapshot != null);
        result.put("snapshotOnline", snapshot != null && Integer.valueOf(1).equals(snapshot.getOnline()));
        result.put("assetLinked", snapshot != null && snapshot.getAssetId() != null);
        result.put("assetId", snapshot != null ? snapshot.getAssetId() : null);
        return R.ok(result);
    }

    // ==================== Terminal Access ====================

    @Override
    public R getTerminalAccessUrl(Long nodeId) {
        if (nodeId == null) return R.err("节点 ID 不能为空");
        MonitorNodeSnapshot node = monitorNodeSnapshotMapper.selectById(nodeId);
        if (node == null) return R.err("探针节点不存在");
        MonitorInstance instance = this.getById(node.getInstanceId());
        if (instance == null) return R.err("探针实例不存在");
        if (!TYPE_KOMARI.equalsIgnoreCase(instance.getType())) {
            return R.err("远程终端仅支持 Komari 探针");
        }
        String baseUrl = instance.getBaseUrl().replaceAll("/+$", "");
        String terminalUrl = baseUrl + "/terminal/" + node.getRemoteNodeUuid();
        log.info("[Terminal] Access requested for node {} ({}), URL: {}", node.getName(), node.getIp(), terminalUrl);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("terminalUrl", terminalUrl);
        result.put("nodeName", node.getName());
        result.put("nodeIp", node.getIp());
        result.put("instanceName", instance.getName());
        return R.ok(result);
    }

    // ==================== Dual-Probe Provision ====================

    @Override
    public R provisionDualAgent(Long komariInstanceId, Long pikaInstanceId, String name) {
        if (komariInstanceId == null && pikaInstanceId == null) {
            return R.err("至少需要选择一个探针实例");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        List<String> installCommands = new ArrayList<>();
        List<String> installCommandsCn = new ArrayList<>();

        // Provision Komari
        if (komariInstanceId != null) {
            MonitorProvisionDto komariDto = new MonitorProvisionDto();
            komariDto.setInstanceId(komariInstanceId);
            komariDto.setName(name);
            R komariResult = provisionAgent(komariDto);
            if (komariResult.getCode() == 0) {
                Map<String, Object> data = (Map<String, Object>) komariResult.getData();
                result.put("komari", data);
                installCommands.add("# Komari 探针\n" + data.get("installCommand"));
                if (data.get("installCommandCn") != null) {
                    installCommandsCn.add("# Komari 探针\n" + data.get("installCommandCn"));
                }
            } else {
                result.put("komariError", komariResult.getMsg());
            }
        }

        // Provision Pika
        if (pikaInstanceId != null) {
            MonitorProvisionDto pikaDto = new MonitorProvisionDto();
            pikaDto.setInstanceId(pikaInstanceId);
            pikaDto.setName(name);
            R pikaResult = provisionAgent(pikaDto);
            if (pikaResult.getCode() == 0) {
                Map<String, Object> data = (Map<String, Object>) pikaResult.getData();
                result.put("pika", data);
                installCommands.add("# Pika 探针\n" + data.get("installCommand"));
                if (data.get("installCommandCn") != null) {
                    installCommandsCn.add("# Pika 探针\n" + data.get("installCommandCn"));
                }
            } else {
                result.put("pikaError", pikaResult.getMsg());
            }
        }

        result.put("combinedCommand", String.join("\n\n", installCommands));
        if (!installCommandsCn.isEmpty()) {
            result.put("combinedCommandCn", String.join("\n\n", installCommandsCn));
        }
        return R.ok(result);
    }

    // ==================== Unified Multi-Agent Provision ====================

    @Override
    public R provisionAllAgents(Long komariInstanceId, Long pikaInstanceId, Map<String, Object> gostConfig, String name) {
        if (komariInstanceId == null && pikaInstanceId == null && (gostConfig == null || gostConfig.isEmpty())) {
            return R.err("至少需要选择一个组件进行安装");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        List<String> installCommands = new ArrayList<>();
        List<String> installCommandsCn = new ArrayList<>();

        // Provision Komari
        if (komariInstanceId != null) {
            MonitorProvisionDto komariDto = new MonitorProvisionDto();
            komariDto.setInstanceId(komariInstanceId);
            komariDto.setName(name);
            R komariResult = provisionAgent(komariDto);
            if (komariResult.getCode() == 0) {
                Map<String, Object> data = (Map<String, Object>) komariResult.getData();
                result.put("komari", data);
                installCommands.add("# Komari 监控探针\n" + data.get("installCommand"));
                if (data.get("installCommandCn") != null) {
                    installCommandsCn.add("# Komari 监控探针\n" + data.get("installCommandCn"));
                }
            } else {
                result.put("komariError", komariResult.getMsg());
            }
        }

        // Provision Pika
        if (pikaInstanceId != null) {
            MonitorProvisionDto pikaDto = new MonitorProvisionDto();
            pikaDto.setInstanceId(pikaInstanceId);
            pikaDto.setName(name);
            R pikaResult = provisionAgent(pikaDto);
            if (pikaResult.getCode() == 0) {
                Map<String, Object> data = (Map<String, Object>) pikaResult.getData();
                result.put("pika", data);
                installCommands.add("# Pika 监控探针\n" + data.get("installCommand"));
                if (data.get("installCommandCn") != null) {
                    installCommandsCn.add("# Pika 监控探针\n" + data.get("installCommandCn"));
                }
            } else {
                result.put("pikaError", pikaResult.getMsg());
            }
        }

        // Provision GOST
        if (gostConfig != null && !gostConfig.isEmpty()) {
            try {
                String gostName = gostConfig.get("name") != null ? gostConfig.get("name").toString() : (name != null ? name : "gost-node");
                String serverIp = gostConfig.get("serverIp") != null ? gostConfig.get("serverIp").toString() : "";
                int portSta = gostConfig.get("portSta") != null ? ((Number) gostConfig.get("portSta")).intValue() : 10000;
                int portEnd = gostConfig.get("portEnd") != null ? ((Number) gostConfig.get("portEnd")).intValue() : 20000;
                Long assetId = gostConfig.get("assetId") != null ? ((Number) gostConfig.get("assetId")).longValue() : null;

                com.admin.common.dto.NodeDto nodeDto = new com.admin.common.dto.NodeDto();
                nodeDto.setName(gostName);
                nodeDto.setServerIp(serverIp);
                nodeDto.setIp(serverIp);
                nodeDto.setPortSta(portSta);
                nodeDto.setPortEnd(portEnd);
                nodeDto.setAssetId(assetId);

                R createResult = nodeService.createNode(nodeDto);
                if (createResult.getCode() == 0) {
                    com.admin.entity.Node node = (com.admin.entity.Node) createResult.getData();
                    R cmdResult = nodeService.getInstallCommand(node.getId());
                    if (cmdResult.getCode() == 0) {
                        Map<String, Object> gostData = new LinkedHashMap<>();
                        gostData.put("nodeId", node.getId());
                        gostData.put("nodeName", gostName);
                        gostData.put("installCommand", cmdResult.getData().toString());
                        result.put("gost", gostData);
                        installCommands.add("# GOST 代理节点\n" + cmdResult.getData().toString());
                        installCommandsCn.add("# GOST 代理节点\n" + cmdResult.getData().toString());
                    }
                } else {
                    result.put("gostError", createResult.getMsg());
                }
            } catch (Exception e) {
                log.error("[Provision] GOST provision failed: {}", e.getMessage());
                result.put("gostError", "GOST 节点创建失败: " + e.getMessage());
            }
        }

        result.put("combinedCommand", String.join("\n\n", installCommands));
        if (!installCommandsCn.isEmpty()) {
            result.put("combinedCommandCn", String.join("\n\n", installCommandsCn));
        }
        return R.ok(result);
    }

    private static final java.util.regex.Pattern SAFE_PATH_SEGMENT = java.util.regex.Pattern.compile("^[a-zA-Z0-9._-]{1,128}$");

    private boolean isSafePathSegment(String value) {
        return value != null && SAFE_PATH_SEGMENT.matcher(value).matches();
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private String shortenError(String value) {
        return truncate(value, 240);
    }

    private String truncate(String value, int maxLen) {
        if (value == null) return null;
        return value.length() > maxLen ? value.substring(0, maxLen) + "..." : value;
    }

    /**
     * Derive OS category from raw OS string.
     * Maps detailed OS versions to broad categories for filtering.
     */
    private String deriveOsCategory(String os) {
        if (os == null || os.isBlank()) return null;
        String lower = os.toLowerCase();
        if (lower.contains("ubuntu")) return "Ubuntu";
        if (lower.contains("debian")) return "Debian";
        if (lower.contains("centos")) return "CentOS";
        if (lower.contains("alma")) return "AlmaLinux";
        if (lower.contains("rocky")) return "Rocky";
        if (lower.contains("fedora")) return "Fedora";
        if (lower.contains("alpine")) return "Alpine";
        if (lower.contains("arch")) return "Arch";
        if (lower.contains("windows")) return "Windows";
        if (lower.contains("macos") || lower.contains("darwin")) return "MacOS";
        if (lower.contains("freebsd")) return "FreeBSD";
        return "Other";
    }

    @Override
    public void pushNameToProbes(Long assetId, String newName) {
        if (assetId == null || !StringUtils.hasText(newName)) return;
        // Find Komari nodes linked to this asset
        List<MonitorNodeSnapshot> nodes = monitorNodeSnapshotMapper.selectList(
                new LambdaQueryWrapper<MonitorNodeSnapshot>()
                        .eq(MonitorNodeSnapshot::getAssetId, assetId)
                        .ne(MonitorNodeSnapshot::getStatus, -1));
        for (MonitorNodeSnapshot node : nodes) {
            if (node.getInstanceId() == null || node.getRemoteNodeUuid() == null) continue;
            MonitorInstance instance = this.getById(node.getInstanceId());
            if (instance == null) continue;
            try {
                if (TYPE_KOMARI.equalsIgnoreCase(instance.getType())) {
                    // Komari: POST /api/admin/client/{uuid}/edit with {"name":"..."}
                    String path = "/api/admin/client/" + node.getRemoteNodeUuid() + "/edit";
                    String body = "{\"name\":\"" + newName.replace("\"", "\\\"") + "\"}";
                    httpPost(instance, path, body, instance.getAllowInsecureTls());
                    // Also update local snapshot name
                    node.setName(newName);
                    monitorNodeSnapshotMapper.updateById(node);
                    log.info("已推送名称到 Komari: {} → {} (instance={})", node.getRemoteNodeUuid(), newName, instance.getName());
                }
                // Pika: no edit API available yet, skip
            } catch (Exception e) {
                log.warn("推送名称到探针失败 (instance={}, node={}): {}", instance.getName(), node.getRemoteNodeUuid(), e.getMessage());
            }
        }
    }
}
