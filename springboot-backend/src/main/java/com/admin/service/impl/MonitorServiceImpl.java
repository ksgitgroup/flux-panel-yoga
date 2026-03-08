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
import com.admin.service.AlertService;
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
    private static final String TYPE_PIKA = "pika";

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

        long online = allNodes.stream().filter(n -> n.getOnline() != null && n.getOnline() == 1).count();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("nodes", nodeViews);
        result.put("total", allNodes.size());
        result.put("online", online);
        result.put("offline", allNodes.size() - online);
        return R.ok(result);
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
        // Delete metrics then node
        monitorMetricLatestMapper.delete(new LambdaQueryWrapper<MonitorMetricLatest>()
                .eq(MonitorMetricLatest::getNodeSnapshotId, nodeId));
        monitorNodeSnapshotMapper.deleteById(nodeId);
        return R.ok("已删除探针节点");
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
            return List.of("cpu", "memory", "network", "disk");
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
            } else {
                // Ongoing sync: update existing asset with probe billing/tags/label
                refreshAssetFromProbe(existing);
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
                    return R.err("Pika 中没有可用的 API Key，请在 Pika 管理面板中创建一个");
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
            String bodyJson = dto.getName() != null ? "{\"name\":\"" + dto.getName().trim() + "\"}" : "{}";
            String responseJson = httpPost(instance, "/api/admin/client/add", bodyJson, instance.getAllowInsecureTls());
            JSONObject resp = JSON.parseObject(responseJson);

            if (!"success".equals(resp.getString("status"))) {
                return R.err("Komari 返回错误: " + resp.getString("message"));
            }

            String uuid = resp.getString("uuid");
            String token = resp.getString("token");

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

        try {
            String loginBody = JSON.toJSONString(Map.of("username", username, "password", password));
            CloseableHttpClient client = buildHttpClient(instance.getAllowInsecureTls() != null && instance.getAllowInsecureTls() == 1);
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
        try {
            CloseableHttpClient client = buildHttpClient(allowInsecureTls != null && allowInsecureTls == 1);
            HttpGet request = new HttpGet(url);
            request.setConfig(RequestConfig.custom().setConnectTimeout(10_000).setSocketTimeout(30_000).build());
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

            // Auto-create/link asset
            if (existing.getAssetId() == null) {
                boolean created = autoCreateOrLinkAssetFromNode(existing, instance);
                if (created) newAssets++;
            } else {
                // Ongoing sync: update existing asset with probe billing/tags/label
                refreshAssetFromProbe(existing);
            }
        }

        // Mark removed nodes
        int removedNodes = 0;
        List<MonitorNodeSnapshot> allNodes = monitorNodeSnapshotMapper.selectList(new LambdaQueryWrapper<MonitorNodeSnapshot>()
                .eq(MonitorNodeSnapshot::getInstanceId, instance.getId()));
        for (MonitorNodeSnapshot node : allNodes) {
            if (!seenIds.contains(node.getRemoteNodeUuid())) {
                node.setOnline(0);
                node.setStatus(1);
                node.setUpdatedTime(now);
                monitorNodeSnapshotMapper.updateById(node);
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

            // Label: sync from probe name if asset label is empty
            if (!StringUtils.hasText(asset.getLabel()) && StringUtils.hasText(node.getName())) {
                asset.setLabel(node.getName());
                changed = true;
            }

            // OS + osCategory: keep in sync
            if (StringUtils.hasText(node.getOs()) && !node.getOs().equals(asset.getOs())) {
                asset.setOs(node.getOs());
                asset.setOsCategory(deriveOsCategory(node.getOs()));
                changed = true;
            } else if (StringUtils.hasText(asset.getOs()) && !StringUtils.hasText(asset.getOsCategory())) {
                asset.setOsCategory(deriveOsCategory(asset.getOs()));
                changed = true;
            }

            // Billing: fill empty fields
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

            // Tags: merge probe tags
            String prevTags = asset.getTags();
            applyProbeTagsToAsset(asset, node);
            if (!java.util.Objects.equals(prevTags, asset.getTags())) {
                changed = true;
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
            return dto;
        }).collect(Collectors.toList());
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
            } else {
                result.put("pikaError", pikaResult.getMsg());
            }
        }

        result.put("combinedCommand", String.join("\n\n", installCommands));
        return R.ok(result);
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
}
