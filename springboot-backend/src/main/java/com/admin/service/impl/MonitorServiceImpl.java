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
import com.admin.service.MonitorService;
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
import org.apache.http.ssl.SSLContexts;
import org.apache.http.ssl.TrustStrategy;
import org.apache.http.util.EntityUtils;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import javax.net.ssl.SSLContext;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class MonitorServiceImpl extends ServiceImpl<MonitorInstanceMapper, MonitorInstance> implements MonitorService {

    private static final String STATUS_NEVER = "never";
    private static final String STATUS_SUCCESS = "success";
    private static final String STATUS_FAILED = "failed";
    private static final String TYPE_KOMARI = "komari";

    @Resource
    private MonitorInstanceMapper monitorInstanceMapper;

    @Resource
    private MonitorNodeSnapshotMapper monitorNodeSnapshotMapper;

    @Resource
    private MonitorMetricLatestMapper monitorMetricLatestMapper;

    @Resource
    private AssetHostMapper assetHostMapper;

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
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("instance", view);
        detail.put("nodes", nodeViews);
        return R.ok(detail);
    }

    @Override
    public R createInstance(MonitorInstanceDto dto) {
        validateDuplicateName(dto.getName(), null);
        long now = System.currentTimeMillis();
        MonitorInstance instance = new MonitorInstance();
        applyDto(instance, dto.getName(), dto.getType(), dto.getBaseUrl(), dto.getApiKey(),
                dto.getSyncEnabled(), dto.getSyncIntervalMinutes(), dto.getAllowInsecureTls(), dto.getRemark());
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
                dto.getSyncEnabled(), dto.getSyncIntervalMinutes(), dto.getAllowInsecureTls(), dto.getRemark());
        instance.setUpdatedTime(System.currentTimeMillis());
        this.updateById(instance);
        return R.ok(toInstanceView(instance));
    }

    @Override
    public R deleteInstance(Long id) {
        getRequiredInstance(id);
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
            String response = httpGet(instance, "/api/version", instance.getAllowInsecureTls());
            if (response == null) {
                throw new RuntimeException("Empty response from monitor server");
            }
            instance.setLastSyncStatus(STATUS_SUCCESS);
            instance.setLastSyncError(null);
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
                .isNull(MonitorNodeSnapshot::getAssetId));
        return R.ok(buildNodeViews(nodes, null));
    }

    @Override
    public R getDashboardNodes() {
        // Return ALL nodes across all instances with latest metrics + instance name
        List<MonitorNodeSnapshot> allNodes = monitorNodeSnapshotMapper.selectList(
                new LambdaQueryWrapper<MonitorNodeSnapshot>()
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
        Map<Long, String> assetNameMap = new HashMap<>();
        if (!assetIds.isEmpty()) {
            List<AssetHost> assets = assetHostMapper.selectBatchIds(assetIds);
            for (AssetHost a : assets) {
                assetNameMap.put(a.getId(), a.getName());
            }
        }
        for (MonitorNodeSnapshotViewDto nv : nodeViews) {
            if (nv.getAssetId() != null && nv.getAssetName() == null) {
                nv.setAssetName(assetNameMap.get(nv.getAssetId()));
            }
        }

        long online = allNodes.stream().filter(n -> n.getOnline() != null && n.getOnline() == 1).count();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("nodes", nodeViews);
        result.put("total", allNodes.size());
        result.put("online", online);
        result.put("offline", allNodes.size() - online);
        return R.ok(result);
    }

    // ==================== Core Sync Logic (Komari) ====================

    private Map<String, Object> performSync(MonitorInstance instance) {
        long now = System.currentTimeMillis();
        Map<String, Object> summary = new LinkedHashMap<>();
        try {
            if (TYPE_KOMARI.equalsIgnoreCase(instance.getType())) {
                summary = syncKomari(instance);
            } else {
                log.warn("[MonitorSync] Unsupported probe type: {}", instance.getType());
                throw new RuntimeException("Unsupported probe type: " + instance.getType());
            }
            instance.setLastSyncStatus(STATUS_SUCCESS);
            instance.setLastSyncError(null);
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
                existing.setStatus(0);
                existing.setOnline(0);
                monitorNodeSnapshotMapper.insert(existing);
                newNodes++;
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

            monitorNodeSnapshotMapper.updateById(existing);

            // Upsert latest metrics if data available
            if (nodeMetric != null) {
                applyNodeMetric(instance, existing, uuid, nodeMetric, now);
            }

            // Auto-create asset for new nodes
            if (existing.getAssetId() == null) {
                boolean created = autoCreateAssetFromNode(existing, instance);
                if (created) newAssets++;
            }
        }

        // Mark removed nodes
        int removedNodes = 0;
        List<MonitorNodeSnapshot> allNodes = monitorNodeSnapshotMapper.selectList(new LambdaQueryWrapper<MonitorNodeSnapshot>()
                .eq(MonitorNodeSnapshot::getInstanceId, instance.getId()));
        for (MonitorNodeSnapshot node : allNodes) {
            if (!seenUuids.contains(node.getRemoteNodeUuid())) {
                node.setOnline(0);
                node.setStatus(1);
                node.setUpdatedTime(now);
                monitorNodeSnapshotMapper.updateById(node);
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
        if (!TYPE_KOMARI.equalsIgnoreCase(instance.getType())) {
            return R.err("仅支持 Komari 类型探针实例");
        }
        if (!StringUtils.hasText(instance.getApiKey())) {
            return R.err("该探针实例未配置 API Key，无法创建客户端");
        }

        try {
            // Call Komari admin API to create client
            String bodyJson = dto.getName() != null ? "{\"name\":\"" + dto.getName().trim() + "\"}" : "{}";
            String responseJson = httpPost(instance, "/api/admin/client/add", bodyJson, instance.getAllowInsecureTls());
            JSONObject resp = JSON.parseObject(responseJson);

            if (!"success".equals(resp.getString("status"))) {
                return R.err("Komari 返回错误: " + resp.getString("message"));
            }

            String uuid = resp.getString("uuid");
            String token = resp.getString("token");
            String baseUrl = instance.getBaseUrl().replaceAll("/+$", "");

            // Build install command
            String installCmd = String.format(
                    "curl -fsSL https://raw.githubusercontent.com/komari-monitor/komari-agent/refs/heads/main/install.sh | " +
                    "bash -s -- --endpoint %s --token %s", baseUrl, token);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("uuid", uuid);
            result.put("token", token);
            result.put("instanceId", instance.getId());
            result.put("instanceName", instance.getName());
            result.put("endpoint", baseUrl);
            result.put("installCommand", installCmd);

            return R.ok(result);
        } catch (Exception e) {
            log.error("[MonitorProvision] Failed to provision agent on {}: {}", instance.getName(), e.getMessage());
            return R.err("创建探针客户端失败: " + e.getMessage());
        }
    }

    // ==================== Auto-Create Asset from Probe Node ====================

    private boolean autoCreateAssetFromNode(MonitorNodeSnapshot node, MonitorInstance instance) {
        // Skip if node already linked to an asset
        if (node.getAssetId() != null) return false;

        // Skip if an asset already references this node UUID
        int existingCount = assetHostMapper.selectCount(new LambdaQueryWrapper<AssetHost>()
                .eq(AssetHost::getMonitorNodeUuid, node.getRemoteNodeUuid())
                .eq(AssetHost::getStatus, 0)).intValue();
        if (existingCount > 0) return false;

        // Skip if name already taken
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
        asset.setCpuCores(node.getCpuCores());
        asset.setRegion(node.getRegion());
        asset.setMonitorNodeUuid(node.getRemoteNodeUuid());
        asset.setCpuName(node.getCpuName());
        asset.setArch(node.getArch());
        asset.setVirtualization(node.getVirtualization());
        asset.setKernelVersion(node.getKernelVersion());
        asset.setGpuName(node.getGpuName());
        asset.setCreatedTime(now);
        asset.setUpdatedTime(now);
        asset.setStatus(0);

        // Convert memTotal (bytes) -> MB, diskTotal (bytes) -> GB, swapTotal (bytes) -> MB
        if (node.getMemTotal() != null && node.getMemTotal() > 0) {
            asset.setMemTotalMb((int) (node.getMemTotal() / (1024 * 1024)));
        }
        if (node.getDiskTotal() != null && node.getDiskTotal() > 0) {
            asset.setDiskTotalGb((int) (node.getDiskTotal() / (1024L * 1024 * 1024)));
        }
        if (node.getSwapTotal() != null && node.getSwapTotal() > 0) {
            asset.setSwapTotalMb((int) (node.getSwapTotal() / (1024 * 1024)));
        }

        try {
            assetHostMapper.insert(asset);
            // Link back
            node.setAssetId(asset.getId());
            monitorNodeSnapshotMapper.updateById(node);
            log.info("[MonitorSync] Auto-created asset '{}' from probe node {}", assetName, node.getRemoteNodeUuid());
            return true;
        } catch (Exception e) {
            log.warn("[MonitorSync] Failed to auto-create asset for node {}: {}", node.getRemoteNodeUuid(), e.getMessage());
            return false;
        }
    }

    // ==================== HTTP Client ====================

    private String httpGet(MonitorInstance instance, String path, Integer allowInsecureTls) {
        String url = instance.getBaseUrl().replaceAll("/+$", "") + path;
        try {
            CloseableHttpClient client = buildHttpClient(allowInsecureTls != null && allowInsecureTls == 1);
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

    private String httpPost(MonitorInstance instance, String path, String jsonBody, Integer allowInsecureTls) {
        String url = instance.getBaseUrl().replaceAll("/+$", "") + path;
        try {
            CloseableHttpClient client = buildHttpClient(allowInsecureTls != null && allowInsecureTls == 1);
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

    private CloseableHttpClient buildHttpClient(boolean allowInsecureTls) {
        try {
            if (allowInsecureTls) {
                TrustStrategy trustAll = (chain, authType) -> true;
                SSLContext sslContext = SSLContexts.custom().loadTrustMaterial(null, trustAll).build();
                return HttpClients.custom()
                        .setSSLContext(sslContext)
                        .setSSLHostnameVerifier(NoopHostnameVerifier.INSTANCE)
                        .build();
            }
            return HttpClients.createDefault();
        } catch (Exception e) {
            return HttpClients.createDefault();
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
                           Integer syncEnabled, Integer syncIntervalMinutes, Integer allowInsecureTls, String remark) {
        instance.setName(name != null ? name.trim() : null);
        instance.setType(type != null ? type.trim().toLowerCase(Locale.ROOT) : TYPE_KOMARI);
        instance.setBaseUrl(baseUrl != null ? baseUrl.trim().replaceAll("/+$", "") : null);
        // Only update apiKey if explicitly provided (avoid null erasure from frontend not sending it)
        if (apiKey != null) {
            instance.setApiKey(apiKey.trim());
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
            dto.setInstanceName(instanceName);

            MonitorMetricLatest metric = metricMap.get(node.getInstanceId() + ":" + node.getRemoteNodeUuid());
            if (metric != null) {
                MonitorMetricLatestViewDto metricDto = new MonitorMetricLatestViewDto();
                BeanUtils.copyProperties(metric, metricDto);
                dto.setLatestMetric(metricDto);
            }
            return dto;
        }).collect(Collectors.toList());
    }

    private String truncate(String value, int maxLen) {
        if (value == null) return null;
        return value.length() > maxLen ? value.substring(0, maxLen) + "..." : value;
    }
}
