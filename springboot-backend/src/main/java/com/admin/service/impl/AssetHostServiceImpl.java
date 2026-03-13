package com.admin.service.impl;

import com.admin.common.auth.AuthContext;
import com.admin.common.auth.AuthPrincipal;
import com.admin.common.dto.*;
import com.admin.common.lang.R;
import com.admin.entity.*;
import com.admin.mapper.*;
import com.admin.service.AssetHostService;
import com.admin.service.MonitorService;
import com.admin.service.TunnelService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class AssetHostServiceImpl extends ServiceImpl<AssetHostMapper, AssetHost> implements AssetHostService {

    /** 资产视图缓存：避免高频 Dashboard/看板轮询时重复执行 7 次 DB 查询 */
    private volatile List<AssetHostViewDto> cachedAssetViews;
    private volatile long cachedAssetViewsAt;
    private static final long ASSET_VIEW_CACHE_TTL_MS = 30_000; // 30 秒

    @Resource
    private AssetHostMapper assetHostMapper;

    @Resource
    private XuiInstanceMapper xuiInstanceMapper;

    @Resource
    private XuiInboundSnapshotMapper xuiInboundSnapshotMapper;

    @Resource
    private ForwardMapper forwardMapper;

    @Resource
    private OnePanelInstanceMapper onePanelInstanceMapper;

    @Resource
    private TunnelService tunnelService;

    @Resource
    private NodeMapper nodeMapper;

    @Resource
    private MonitorNodeSnapshotMapper monitorNodeSnapshotMapper;

    @Resource
    private MonitorMetricLatestMapper monitorMetricLatestMapper;

    @Resource
    private MonitorInstanceMapper monitorInstanceMapper;

    @Resource
    private MonitorService monitorService;

    @Override
    public R getAllAssets() {
        long now = System.currentTimeMillis();
        List<AssetHostViewDto> cached = cachedAssetViews;
        if (cached != null && (now - cachedAssetViewsAt) < ASSET_VIEW_CACHE_TTL_MS) {
            return R.ok(filterByAssetScope(cached));
        }
        List<AssetHost> assets = this.list(new LambdaQueryWrapper<AssetHost>()
                .eq(AssetHost::getStatus, 0)
                .orderByDesc(AssetHost::getUpdatedTime, AssetHost::getId));
        List<AssetHostViewDto> views = buildAssetViews(assets);
        cachedAssetViews = views;
        cachedAssetViewsAt = now;
        return R.ok(filterByAssetScope(views));
    }

    /** 写操作后主动失效缓存 */
    private void invalidateAssetViewCache() {
        cachedAssetViews = null;
        cachedAssetViewsAt = 0;
    }

    @Override
    public R getAssetDetail(Long id) {
        // Check asset scope access
        AuthPrincipal principal = AuthContext.getCurrentPrincipal();
        if (principal != null && !principal.canAccessAsset(id)) {
            return R.err("无权访问该资产");
        }
        AssetHost asset = getRequiredAsset(id);
        List<AssetHostViewDto> views = buildAssetViews(Collections.singletonList(asset));
        AssetHostViewDto assetView = views.isEmpty() ? null : views.get(0);

        List<XuiInstance> instances = xuiInstanceMapper.selectList(new LambdaQueryWrapper<XuiInstance>()
                .eq(XuiInstance::getAssetId, asset.getId())
                .orderByDesc(XuiInstance::getUpdatedTime, XuiInstance::getId));

        List<XuiInstanceViewDto> instanceViews = instances.stream()
                .map(instance -> {
                    XuiInstanceViewDto dto = new XuiInstanceViewDto();
                    BeanUtils.copyProperties(instance, dto);
                    dto.setAssetId(asset.getId());
                    dto.setAssetName(asset.getName());
                    dto.setHostLabel(instance.getHostLabel());
                    dto.setPasswordConfigured(StringUtils.hasText(instance.getEncryptedPassword()));
                    dto.setLoginSecretConfigured(StringUtils.hasText(instance.getEncryptedLoginSecret()));
                    dto.setTrafficCallbackPath("/api/v1/xui/traffic/" + instance.getTrafficToken());
                    return dto;
                })
                .collect(Collectors.toList());

        List<Long> instanceIds = instances.stream().map(XuiInstance::getId).collect(Collectors.toList());
        List<XuiInboundSnapshot> inbounds = instanceIds.isEmpty()
                ? Collections.emptyList()
                : xuiInboundSnapshotMapper.selectList(new LambdaQueryWrapper<XuiInboundSnapshot>()
                .in(XuiInboundSnapshot::getInstanceId, instanceIds)
                .orderByAsc(XuiInboundSnapshot::getStatus)
                .orderByAsc(XuiInboundSnapshot::getProtocol, XuiInboundSnapshot::getPort));

        List<Forward> forwards = forwardMapper.selectList(new LambdaQueryWrapper<Forward>()
                .eq(Forward::getRemoteSourceAssetId, asset.getId())
                .orderByDesc(Forward::getUpdatedTime, Forward::getId));

        OnePanelInstance onePanelInstance = onePanelInstanceMapper.selectOne(new LambdaQueryWrapper<OnePanelInstance>()
                .eq(OnePanelInstance::getAssetId, asset.getId())
                .eq(OnePanelInstance::getStatus, 0)
                .orderByDesc(OnePanelInstance::getUpdatedTime, OnePanelInstance::getId)
                .last("LIMIT 1"));

        // Build monitor nodes for this asset
        List<MonitorNodeSnapshotViewDto> monitorNodes = buildMonitorNodesForAsset(asset);

        AssetHostDetailDto detail = new AssetHostDetailDto();
        detail.setAsset(assetView);
        detail.setXuiInstances(enrichInstanceCounts(instanceViews, inbounds));
        detail.setProtocolSummaries(buildProtocolSummaries(inbounds));
        detail.setForwards(buildForwardLinks(forwards));
        detail.setMonitorNodes(monitorNodes);
        detail.setOnePanelInstance(toOnePanelInstanceView(onePanelInstance, asset));
        return R.ok(detail);
    }

    @Override
    public R createAsset(AssetHostDto dto) {
        validateDuplicate(dto.getName(), dto.getLabel(), null);
        long now = System.currentTimeMillis();
        AssetHost asset = new AssetHost();
        applyAssetDto(asset, dto);
        asset.setCreatedTime(now);
        asset.setUpdatedTime(now);
        asset.setStatus(0);
        this.save(asset);
        invalidateAssetViewCache();
        return R.ok(buildAssetViews(Collections.singletonList(asset)).stream().findFirst().orElse(null));
    }

    @Override
    public R updateAsset(AssetHostUpdateDto dto) {
        AuthPrincipal p = AuthContext.getCurrentPrincipal();
        if (p != null && !p.canAccessAsset(dto.getId())) {
            return R.err("无权修改该资产");
        }
        AssetHost asset = getRequiredAsset(dto.getId());
        validateDuplicate(dto.getName(), dto.getLabel(), dto.getId());
        // Track which sync-protected fields the user is editing
        Set<String> editedFields = detectUserEditedFields(asset, dto);
        applyAssetDtoFromUpdate(asset, dto);
        // Merge with existing userEditedFields
        mergeUserEditedFields(asset, editedFields);
        asset.setUpdatedTime(System.currentTimeMillis());
        this.updateById(asset);
        invalidateAssetViewCache();

        // Push name change to linked probes (Komari) if label was edited
        if (editedFields.contains("label") && StringUtils.hasText(asset.getLabel())) {
            try {
                monitorService.pushNameToProbes(asset.getId(), asset.getLabel());
            } catch (Exception e) {
                log.warn("推送名称到探针失败: {}", e.getMessage());
            }
        }

        return R.ok(buildAssetViews(Collections.singletonList(asset)).stream().findFirst().orElse(null));
    }

    @Override
    public R deleteAsset(Long id) {
        AuthPrincipal dp = AuthContext.getCurrentPrincipal();
        if (dp != null && !dp.canAccessAsset(id)) {
            return R.err("无权删除该资产");
        }
        AssetHost asset = getRequiredAsset(id);
        Integer xuiCount = xuiInstanceMapper.selectCount(new LambdaQueryWrapper<XuiInstance>()
                .eq(XuiInstance::getAssetId, id));
        if (xuiCount != null && xuiCount > 0) {
            return R.err("该资产下仍有 X-UI 实例，无法删除");
        }
        Integer forwardCount = forwardMapper.selectCount(new LambdaQueryWrapper<Forward>()
                .eq(Forward::getRemoteSourceAssetId, id));
        if (forwardCount != null && forwardCount > 0) {
            return R.err("该资产仍被转发配置引用，无法删除");
        }
        Integer onePanelCount = onePanelInstanceMapper.selectCount(new LambdaQueryWrapper<OnePanelInstance>()
                .eq(OnePanelInstance::getAssetId, id)
                .eq(OnePanelInstance::getStatus, 0));
        if (onePanelCount != null && onePanelCount > 0) {
            return R.err("该资产下仍有 1Panel 摘要实例，无法删除");
        }
        // Unlink monitor node snapshots referencing this asset + mark as user-unlinked
        List<MonitorNodeSnapshot> linkedNodes = monitorNodeSnapshotMapper.selectList(
                new LambdaQueryWrapper<MonitorNodeSnapshot>().eq(MonitorNodeSnapshot::getAssetId, id));
        for (MonitorNodeSnapshot node : linkedNodes) {
            node.setAssetId(null);
            node.setAssetUnlinked(1); // Prevent auto-recreation on next sync
            monitorNodeSnapshotMapper.updateById(node);
        }

        this.removeById(asset.getId());
        invalidateAssetViewCache();
        return R.ok();
    }

    @Override
    public R archiveAsset(Long id) {
        AuthPrincipal dp = AuthContext.getCurrentPrincipal();
        if (dp != null && !dp.canAccessAsset(id)) {
            return R.err("无权操作该资产");
        }
        AssetHost asset = getRequiredAsset(id);
        asset.setStatus(2);
        asset.setUpdatedTime(System.currentTimeMillis());
        this.updateById(asset);
        invalidateAssetViewCache();
        return R.ok();
    }

    @Override
    public R restoreAsset(Long id) {
        AssetHost asset = this.getById(id);
        if (asset == null) return R.err("资产不存在");
        if (asset.getStatus() == null || asset.getStatus() != 2) return R.err("该资产不在回收站中");
        asset.setStatus(0);
        asset.setUpdatedTime(System.currentTimeMillis());
        this.updateById(asset);
        invalidateAssetViewCache();
        return R.ok();
    }

    @Override
    public R getArchivedAssets() {
        List<AssetHost> assets = this.list(new LambdaQueryWrapper<AssetHost>()
                .eq(AssetHost::getStatus, 2)
                .orderByDesc(AssetHost::getUpdatedTime, AssetHost::getId));
        List<AssetHostViewDto> views = buildAssetViews(assets);
        return R.ok(views);
    }

    @Override
    public R batchUpdateField(Map<String, Object> params) {
        Object idsObj = params.get("ids");
        String field = (String) params.get("field");
        Object value = params.get("value");

        if (idsObj == null || field == null) {
            return R.err("参数不完整");
        }

        List<Long> ids;
        if (idsObj instanceof List) {
            ids = ((List<?>) idsObj).stream()
                    .map(o -> Long.valueOf(o.toString()))
                    .collect(Collectors.toList());
        } else {
            return R.err("ids 必须是数组");
        }

        if (ids.isEmpty()) {
            return R.err("请选择至少一个资产");
        }

        // Whitelist of allowed batch-update fields
        Set<String> allowedFields = Set.of(
                "tags", "region", "environment", "provider", "role", "purpose",
                "monthlyCost", "currency", "billingCycle", "bandwidthMbps",
                "monthlyTrafficGb", "sshPort", "os", "osCategory", "remark"
        );
        if (!allowedFields.contains(field)) {
            return R.err("不支持批量修改字段: " + field);
        }

        List<AssetHost> assets = this.listByIds(ids);
        if (assets.isEmpty()) {
            return R.err("未找到指定资产");
        }

        long now = System.currentTimeMillis();
        String strVal = value == null ? null : value.toString().trim();
        if (strVal != null && strVal.isEmpty()) strVal = null;

        for (AssetHost asset : assets) {
            switch (field) {
                case "tags":
                    // For tags: merge mode — append new tags to existing
                    if (strVal != null) {
                        String mode = params.get("mode") != null ? params.get("mode").toString() : "replace";
                        if ("merge".equals(mode) && StringUtils.hasText(asset.getTags())) {
                            LinkedHashSet<String> merged = new LinkedHashSet<>();
                            for (String t : asset.getTags().split(",")) {
                                String trimmed = t.trim();
                                if (!trimmed.isEmpty()) merged.add(trimmed);
                            }
                            for (String t : strVal.split(",")) {
                                String trimmed = t.trim();
                                if (!trimmed.isEmpty()) merged.add(trimmed);
                            }
                            asset.setTags(String.join(",", merged));
                        } else {
                            asset.setTags(strVal);
                        }
                    } else {
                        asset.setTags(null);
                    }
                    break;
                case "region": asset.setRegion(strVal); break;
                case "environment": asset.setEnvironment(strVal); break;
                case "provider": asset.setProvider(strVal); break;
                case "role": asset.setRole(strVal); break;
                case "monthlyCost": asset.setMonthlyCost(strVal); break;
                case "currency": asset.setCurrency(strVal); break;
                case "billingCycle":
                    asset.setBillingCycle(strVal != null ? Integer.valueOf(strVal) : null);
                    break;
                case "bandwidthMbps":
                    asset.setBandwidthMbps(strVal != null ? Integer.valueOf(strVal) : null);
                    break;
                case "monthlyTrafficGb":
                    asset.setMonthlyTrafficGb(strVal != null ? Integer.valueOf(strVal) : null);
                    break;
                case "sshPort":
                    asset.setSshPort(strVal != null ? Integer.valueOf(strVal) : null);
                    break;
                case "os": asset.setOs(strVal); break;
                case "osCategory": asset.setOsCategory(strVal); break;
                case "remark": asset.setRemark(strVal); break;
                case "purpose": asset.setPurpose(strVal); break;
                default: break;
            }
            asset.setUpdatedTime(now);
            // Track user-edited sync-protected fields
            Set<String> syncProtected = Set.of("tags", "os", "osCategory", "monthlyCost", "currency", "billingCycle");
            if (syncProtected.contains(field)) {
                mergeUserEditedFields(asset, Set.of(field));
            }
        }
        this.updateBatchById(assets);
        invalidateAssetViewCache();
        return R.ok("已批量更新 " + assets.size() + " 个资产");
    }

    // ==================== Private Helpers ====================

    /** 根据当前用户的资产范围过滤资产列表 */
    private List<AssetHostViewDto> filterByAssetScope(List<AssetHostViewDto> views) {
        AuthPrincipal principal = AuthContext.getCurrentPrincipal();
        if (principal == null) {
            return views;
        }
        Set<Long> effectiveIds = principal.getEffectiveAssetIds();
        if (effectiveIds == null) {
            return views; // null = no restriction
        }
        return views.stream()
                .filter(v -> v.getId() != null && effectiveIds.contains(v.getId()))
                .collect(Collectors.toList());
    }

    private AssetHost getRequiredAsset(Long id) {
        AssetHost asset = this.getById(id);
        if (asset == null) {
            throw new IllegalStateException("资产不存在");
        }
        return asset;
    }

    private void validateDuplicate(String name, String label, Long ignoreId) {
        String normalizedName = trimToNull(name);
        if (!StringUtils.hasText(normalizedName)) {
            throw new IllegalStateException("资产名称不能为空");
        }
        LambdaQueryWrapper<AssetHost> nameQuery = new LambdaQueryWrapper<AssetHost>()
                .eq(AssetHost::getName, normalizedName);
        if (ignoreId != null) {
            nameQuery.ne(AssetHost::getId, ignoreId);
        }
        if (assetHostMapper.selectCount(nameQuery) > 0) {
            throw new IllegalStateException("已存在同名资产");
        }

        String normalizedLabel = trimToNull(label);
        if (StringUtils.hasText(normalizedLabel)) {
            LambdaQueryWrapper<AssetHost> labelQuery = new LambdaQueryWrapper<AssetHost>()
                    .eq(AssetHost::getLabel, normalizedLabel);
            if (ignoreId != null) {
                labelQuery.ne(AssetHost::getId, ignoreId);
            }
            if (assetHostMapper.selectCount(labelQuery) > 0) {
                throw new IllegalStateException("已存在同标识资产");
            }
        }
    }

    private void applyAssetDto(AssetHost asset, AssetHostDto dto) {
        asset.setName(trimToNull(dto.getName()));
        asset.setLabel(trimToNull(dto.getLabel()));
        asset.setPrimaryIp(trimToNull(dto.getPrimaryIp()));
        asset.setIpv6(trimToNull(dto.getIpv6()));
        asset.setEnvironment(trimToNull(dto.getEnvironment()));
        asset.setProvider(trimToNull(dto.getProvider()));
        asset.setRegion(trimToNull(dto.getRegion()));
        asset.setRole(trimToNull(dto.getRole()));
        asset.setOs(trimToNull(dto.getOs()));
        asset.setCpuCores(dto.getCpuCores());
        asset.setMemTotalMb(dto.getMemTotalMb());
        asset.setDiskTotalGb(dto.getDiskTotalGb());
        asset.setBandwidthMbps(dto.getBandwidthMbps());
        asset.setMonthlyTrafficGb(dto.getMonthlyTrafficGb());
        asset.setSshPort(dto.getSshPort());
        asset.setPurchaseDate(dto.getPurchaseDate());
        asset.setExpireDate(dto.getExpireDate());
        asset.setMonthlyCost(trimToNull(dto.getMonthlyCost()));
        asset.setCurrency(trimToNull(dto.getCurrency()));
        asset.setTags(trimToNull(dto.getTags()));
        asset.setGostNodeId(dto.getGostNodeId());
        asset.setMonitorNodeUuid(trimToNull(dto.getMonitorNodeUuid()));
        asset.setPikaNodeId(trimToNull(dto.getPikaNodeId()));
        asset.setPurpose(trimToNull(dto.getPurpose()));
        asset.setRemark(trimToNull(dto.getRemark()));
        asset.setPanelUrl(trimToNull(dto.getPanelUrl()));
        asset.setBillingCycle(dto.getBillingCycle());
    }

    private void applyAssetDtoFromUpdate(AssetHost asset, AssetHostUpdateDto dto) {
        asset.setName(trimToNull(dto.getName()));
        asset.setLabel(trimToNull(dto.getLabel()));
        asset.setPrimaryIp(trimToNull(dto.getPrimaryIp()));
        asset.setIpv6(trimToNull(dto.getIpv6()));
        asset.setEnvironment(trimToNull(dto.getEnvironment()));
        asset.setProvider(trimToNull(dto.getProvider()));
        asset.setRegion(trimToNull(dto.getRegion()));
        asset.setRole(trimToNull(dto.getRole()));
        asset.setOs(trimToNull(dto.getOs()));
        asset.setOsCategory(trimToNull(dto.getOsCategory()));
        asset.setCpuCores(dto.getCpuCores());
        asset.setMemTotalMb(dto.getMemTotalMb());
        asset.setDiskTotalGb(dto.getDiskTotalGb());
        asset.setBandwidthMbps(dto.getBandwidthMbps());
        asset.setMonthlyTrafficGb(dto.getMonthlyTrafficGb());
        asset.setSshPort(dto.getSshPort());
        asset.setPurchaseDate(dto.getPurchaseDate());
        asset.setExpireDate(dto.getExpireDate());
        asset.setMonthlyCost(trimToNull(dto.getMonthlyCost()));
        asset.setCurrency(trimToNull(dto.getCurrency()));
        asset.setTags(trimToNull(dto.getTags()));
        asset.setGostNodeId(dto.getGostNodeId());
        asset.setMonitorNodeUuid(trimToNull(dto.getMonitorNodeUuid()));
        asset.setPikaNodeId(trimToNull(dto.getPikaNodeId()));
        asset.setCpuName(trimToNull(dto.getCpuName()));
        asset.setArch(trimToNull(dto.getArch()));
        asset.setVirtualization(trimToNull(dto.getVirtualization()));
        asset.setKernelVersion(trimToNull(dto.getKernelVersion()));
        asset.setGpuName(trimToNull(dto.getGpuName()));
        asset.setSwapTotalMb(dto.getSwapTotalMb());
        asset.setPurpose(trimToNull(dto.getPurpose()));
        asset.setRemark(trimToNull(dto.getRemark()));
        asset.setPanelUrl(trimToNull(dto.getPanelUrl()));
        asset.setBillingCycle(dto.getBillingCycle());
    }

    /**
     * Detect which sync-protected fields the user is changing compared to the current DB value.
     * Only tracks fields that probe sync might overwrite.
     */
    private Set<String> detectUserEditedFields(AssetHost current, AssetHostUpdateDto dto) {
        Set<String> edited = new HashSet<>();
        // Fields that probe sync overwrites: os, osCategory, hardware, tags, label, billing
        if (!Objects.equals(trimToNull(dto.getLabel()), current.getLabel())) edited.add("label");
        if (!Objects.equals(trimToNull(dto.getTags()), current.getTags())) edited.add("tags");
        if (!Objects.equals(trimToNull(dto.getOs()), current.getOs())) edited.add("os");
        if (!Objects.equals(trimToNull(dto.getOsCategory()), current.getOsCategory())) edited.add("osCategory");
        if (!Objects.equals(dto.getCpuCores(), current.getCpuCores())) edited.add("cpuCores");
        if (!Objects.equals(dto.getMemTotalMb(), current.getMemTotalMb())) edited.add("memTotalMb");
        if (!Objects.equals(dto.getDiskTotalGb(), current.getDiskTotalGb())) edited.add("diskTotalGb");
        if (!Objects.equals(trimToNull(dto.getMonthlyCost()), current.getMonthlyCost())) edited.add("monthlyCost");
        if (!Objects.equals(trimToNull(dto.getCurrency()), current.getCurrency())) edited.add("currency");
        if (!Objects.equals(dto.getBillingCycle(), current.getBillingCycle())) edited.add("billingCycle");
        if (!Objects.equals(dto.getExpireDate(), current.getExpireDate())) edited.add("expireDate");
        return edited;
    }

    /**
     * Merge newly edited fields into the asset's userEditedFields JSON array.
     */
    private void mergeUserEditedFields(AssetHost asset, Set<String> newEdited) {
        if (newEdited.isEmpty()) return;
        Set<String> existing = parseUserEditedFields(asset.getUserEditedFields());
        existing.addAll(newEdited);
        asset.setUserEditedFields(toJsonArray(existing));
    }

    /** Parse JSON array string like ["tags","label"] into a Set */
    static Set<String> parseUserEditedFields(String json) {
        Set<String> result = new HashSet<>();
        if (json == null || json.isBlank()) return result;
        // Simple JSON array parser: ["a","b"] → Set("a","b")
        String trimmed = json.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            trimmed = trimmed.substring(1, trimmed.length() - 1);
            for (String part : trimmed.split(",")) {
                String field = part.trim().replace("\"", "");
                if (!field.isEmpty()) result.add(field);
            }
        }
        return result;
    }

    private static String toJsonArray(Set<String> fields) {
        if (fields == null || fields.isEmpty()) return null;
        return "[" + fields.stream().sorted().map(f -> "\"" + f + "\"").collect(Collectors.joining(",")) + "]";
    }

    private List<AssetHostViewDto> buildAssetViews(List<AssetHost> assets) {
        if (assets == null || assets.isEmpty()) {
            return Collections.emptyList();
        }
        List<Long> assetIds = assets.stream().map(AssetHost::getId).collect(Collectors.toList());

        // XUI data
        List<XuiInstance> instances = xuiInstanceMapper.selectList(new LambdaQueryWrapper<XuiInstance>()
                .in(XuiInstance::getAssetId, assetIds));
        Map<Long, List<XuiInstance>> instancesByAsset = instances.stream()
                .collect(Collectors.groupingBy(XuiInstance::getAssetId));

        List<Long> instanceIds = instances.stream().map(XuiInstance::getId).collect(Collectors.toList());
        List<XuiInboundSnapshot> inbounds = instanceIds.isEmpty()
                ? Collections.emptyList()
                : xuiInboundSnapshotMapper.selectList(new LambdaQueryWrapper<XuiInboundSnapshot>()
                .in(XuiInboundSnapshot::getInstanceId, instanceIds));
        Map<Long, List<XuiInboundSnapshot>> inboundsByInstance = inbounds.stream()
                .collect(Collectors.groupingBy(XuiInboundSnapshot::getInstanceId));

        List<Forward> forwards = forwardMapper.selectList(new LambdaQueryWrapper<Forward>()
                .in(Forward::getRemoteSourceAssetId, assetIds));
        Map<Long, Long> forwardCountMap = forwards.stream()
                .filter(item -> item.getRemoteSourceAssetId() != null)
                .collect(Collectors.groupingBy(Forward::getRemoteSourceAssetId, Collectors.counting()));

        List<OnePanelInstance> onePanelInstances = onePanelInstanceMapper.selectList(new LambdaQueryWrapper<OnePanelInstance>()
                .in(OnePanelInstance::getAssetId, assetIds)
                .eq(OnePanelInstance::getStatus, 0)
                .orderByDesc(OnePanelInstance::getUpdatedTime, OnePanelInstance::getId));
        Map<Long, OnePanelInstance> onePanelByAsset = new LinkedHashMap<>();
        for (OnePanelInstance instance : onePanelInstances) {
            if (instance.getAssetId() != null && !onePanelByAsset.containsKey(instance.getAssetId())) {
                onePanelByAsset.put(instance.getAssetId(), instance);
            }
        }

        // GOST node names
        Set<Long> gostNodeIds = assets.stream()
                .map(AssetHost::getGostNodeId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, String> gostNodeNameMap = gostNodeIds.isEmpty()
                ? Collections.emptyMap()
                : nodeMapper.selectBatchIds(gostNodeIds).stream()
                .collect(Collectors.toMap(Node::getId, Node::getName, (a, b) -> a));

        // Monitor data - lookup by monitorNodeUuid and pikaNodeId
        List<String> monitorUuids = new ArrayList<>();
        for (AssetHost a : assets) {
            if (StringUtils.hasText(a.getMonitorNodeUuid())) monitorUuids.add(a.getMonitorNodeUuid());
            if (StringUtils.hasText(a.getPikaNodeId())) monitorUuids.add(a.getPikaNodeId());
        }
        Map<String, MonitorNodeSnapshot> nodeSnapshotByUuid = Collections.emptyMap();
        Map<String, MonitorMetricLatest> metricByUuid = Collections.emptyMap();
        if (!monitorUuids.isEmpty()) {
            List<MonitorNodeSnapshot> snapshots = monitorNodeSnapshotMapper.selectList(
                    new LambdaQueryWrapper<MonitorNodeSnapshot>()
                            .in(MonitorNodeSnapshot::getRemoteNodeUuid, monitorUuids));
            nodeSnapshotByUuid = snapshots.stream()
                    .collect(Collectors.toMap(MonitorNodeSnapshot::getRemoteNodeUuid, s -> s, (a, b) -> a));

            List<MonitorMetricLatest> metrics = monitorMetricLatestMapper.selectList(
                    new LambdaQueryWrapper<MonitorMetricLatest>()
                            .in(MonitorMetricLatest::getRemoteNodeUuid, monitorUuids));
            metricByUuid = metrics.stream()
                    .collect(Collectors.toMap(MonitorMetricLatest::getRemoteNodeUuid, m -> m, (a, b) -> a));
        }

        List<AssetHostViewDto> result = new ArrayList<>();
        for (AssetHost asset : assets) {
            AssetHostViewDto dto = new AssetHostViewDto();
            BeanUtils.copyProperties(asset, dto);

            // GOST node name
            if (asset.getGostNodeId() != null) {
                dto.setGostNodeName(gostNodeNameMap.get(asset.getGostNodeId()));
            }

            // XUI aggregation
            List<XuiInstance> assetInstances = instancesByAsset.getOrDefault(asset.getId(), Collections.emptyList());
            Set<String> protocols = new HashSet<>();
            int totalInbounds = 0;
            int totalClients = 0;
            int onlineClients = 0;
            long lastObservedAt = 0L;

            for (XuiInstance instance : assetInstances) {
                lastObservedAt = Math.max(lastObservedAt, safeLong(instance.getLastSyncAt()));
                lastObservedAt = Math.max(lastObservedAt, safeLong(instance.getLastTestAt()));
                for (XuiInboundSnapshot inbound : inboundsByInstance.getOrDefault(instance.getId(), Collections.emptyList())) {
                    if (inbound.getStatus() != null && inbound.getStatus() == 1) {
                        continue;
                    }
                    totalInbounds += 1;
                    totalClients += safeInteger(inbound.getClientCount());
                    onlineClients += safeInteger(inbound.getOnlineClientCount());
                    if (StringUtils.hasText(inbound.getProtocol())) {
                        protocols.add(inbound.getProtocol().trim().toLowerCase(Locale.ROOT));
                    }
                }
            }

            dto.setTotalXuiInstances(assetInstances.size());
            dto.setTotalProtocols(protocols.size());
            dto.setTotalInbounds(totalInbounds);
            dto.setTotalClients(totalClients);
            dto.setOnlineClients(onlineClients);
            dto.setTotalForwards(forwardCountMap.getOrDefault(asset.getId(), 0L).intValue());
            dto.setLastObservedAt(lastObservedAt == 0L ? null : lastObservedAt);

            OnePanelInstance onePanelInstance = onePanelByAsset.get(asset.getId());
            if (onePanelInstance != null) {
                dto.setOnePanelInstanceId(onePanelInstance.getId());
                dto.setOnePanelInstanceName(onePanelInstance.getName());
                dto.setOnePanelReportEnabled(onePanelInstance.getReportEnabled());
                dto.setOnePanelLastReportStatus(onePanelInstance.getLastReportStatus());
                dto.setOnePanelLastReportAt(onePanelInstance.getLastReportAt());
                dto.setOnePanelLastReportError(onePanelInstance.getLastReportError());
                dto.setOnePanelExporterVersion(onePanelInstance.getExporterVersion());
                dto.setOnePanelPanelVersion(onePanelInstance.getPanelVersion());
            }

            // Monitor enrichment - check Komari first, then Pika, merge best data
            {
                MonitorNodeSnapshot bestSnapshot = null;
                MonitorMetricLatest bestMetric = null;

                // Komari probe
                if (StringUtils.hasText(asset.getMonitorNodeUuid())) {
                    MonitorNodeSnapshot ks = nodeSnapshotByUuid.get(asset.getMonitorNodeUuid());
                    MonitorMetricLatest km = metricByUuid.get(asset.getMonitorNodeUuid());
                    if (ks != null) bestSnapshot = ks;
                    if (km != null) bestMetric = km;
                }
                // Pika probe - use if no Komari data, or if Pika data is more recent
                if (StringUtils.hasText(asset.getPikaNodeId())) {
                    MonitorNodeSnapshot ps = nodeSnapshotByUuid.get(asset.getPikaNodeId());
                    MonitorMetricLatest pm = metricByUuid.get(asset.getPikaNodeId());
                    if (ps != null) {
                        if (bestSnapshot == null) {
                            bestSnapshot = ps;
                        } else if (ps.getOnline() != null && ps.getOnline() == 1 && (bestSnapshot.getOnline() == null || bestSnapshot.getOnline() == 0)) {
                            // Prefer online probe's data
                            bestSnapshot = ps;
                        }
                    }
                    if (pm != null) {
                        if (bestMetric == null) {
                            bestMetric = pm;
                        } else if (pm.getSampledAt() != null && (bestMetric.getSampledAt() == null || pm.getSampledAt() > bestMetric.getSampledAt())) {
                            bestMetric = pm;
                        }
                    }
                }

                if (bestSnapshot != null) {
                    dto.setMonitorOnline(bestSnapshot.getOnline());
                    dto.setMonitorLastSyncAt(bestSnapshot.getLastSyncAt());
                }
                if (bestMetric != null) {
                    dto.setMonitorCpuUsage(bestMetric.getCpuUsage());
                    dto.setMonitorMemUsed(bestMetric.getMemUsed());
                    dto.setMonitorMemTotal(bestMetric.getMemTotal());
                    dto.setMonitorNetIn(bestMetric.getNetIn());
                    dto.setMonitorNetOut(bestMetric.getNetOut());
                }

                // Aggregate probe traffic/expiry/tags from all linked probes
                Long maxSyncAt = null;
                for (String uuid : new String[]{asset.getMonitorNodeUuid(), asset.getPikaNodeId()}) {
                    if (!StringUtils.hasText(uuid)) continue;
                    MonitorNodeSnapshot snap = nodeSnapshotByUuid.get(uuid);
                    if (snap == null) continue;
                    if (maxSyncAt == null || (snap.getLastSyncAt() != null && snap.getLastSyncAt() > maxSyncAt)) {
                        maxSyncAt = snap.getLastSyncAt();
                    }
                    // Traffic: take the one with a limit configured
                    if (snap.getTrafficLimit() != null && snap.getTrafficLimit() > 0) {
                        dto.setProbeTrafficLimit(snap.getTrafficLimit());
                        dto.setProbeTrafficUsed(snap.getTrafficUsed());
                    }
                    // Expiry: take the latest (most relevant)
                    if (snap.getExpiredAt() != null && snap.getExpiredAt() > 0) {
                        if (dto.getProbeExpiredAt() == null || snap.getExpiredAt() > dto.getProbeExpiredAt()) {
                            dto.setProbeExpiredAt(snap.getExpiredAt());
                        }
                    }
                    // Tags: merge from probes
                    if (StringUtils.hasText(snap.getTags())) {
                        dto.setProbeTags(snap.getTags());
                    }
                }
                if (maxSyncAt != null) dto.setMonitorLastSyncAt(maxSyncAt);

                // Probe source
                boolean hasKomari = StringUtils.hasText(asset.getMonitorNodeUuid());
                boolean hasPika = StringUtils.hasText(asset.getPikaNodeId());
                if (hasKomari && hasPika) dto.setProbeSource("dual");
                else if (hasKomari) dto.setProbeSource("komari");
                else if (hasPika) dto.setProbeSource("pika");
                else dto.setProbeSource("local");
            }

            result.add(dto);
        }

        result.sort(Comparator.comparingLong((AssetHostViewDto item) -> safeLong(item.getLastObservedAt())).reversed()
                .thenComparing(AssetHostViewDto::getName, Comparator.nullsLast(String::compareTo)));
        return result;
    }

    private List<MonitorNodeSnapshotViewDto> buildMonitorNodesForAsset(AssetHost asset) {
        List<MonitorNodeSnapshot> nodes = new ArrayList<>();
        // Collect nodes from both Komari and Pika probe links
        List<String> probeUuids = new ArrayList<>();
        if (StringUtils.hasText(asset.getMonitorNodeUuid())) probeUuids.add(asset.getMonitorNodeUuid());
        if (StringUtils.hasText(asset.getPikaNodeId())) probeUuids.add(asset.getPikaNodeId());

        if (!probeUuids.isEmpty()) {
            nodes = monitorNodeSnapshotMapper.selectList(new LambdaQueryWrapper<MonitorNodeSnapshot>()
                    .in(MonitorNodeSnapshot::getRemoteNodeUuid, probeUuids));
        }
        if (nodes.isEmpty()) {
            nodes = monitorNodeSnapshotMapper.selectList(new LambdaQueryWrapper<MonitorNodeSnapshot>()
                    .eq(MonitorNodeSnapshot::getAssetId, asset.getId()));
        }

        if (nodes.isEmpty()) {
            return Collections.emptyList();
        }

        List<String> uuids = nodes.stream().map(MonitorNodeSnapshot::getRemoteNodeUuid).collect(Collectors.toList());
        Set<Long> mInstanceIds = nodes.stream().map(MonitorNodeSnapshot::getInstanceId).collect(Collectors.toSet());

        // Build instance type map
        Map<Long, MonitorInstance> instanceMap = new HashMap<>();
        if (!mInstanceIds.isEmpty()) {
            monitorInstanceMapper.selectBatchIds(mInstanceIds).forEach(i -> instanceMap.put(i.getId(), i));
        }

        List<MonitorMetricLatest> metrics = monitorMetricLatestMapper.selectList(
                new LambdaQueryWrapper<MonitorMetricLatest>()
                        .in(MonitorMetricLatest::getInstanceId, mInstanceIds)
                        .in(MonitorMetricLatest::getRemoteNodeUuid, uuids));
        Map<String, MonitorMetricLatest> metricMap = new HashMap<>();
        for (MonitorMetricLatest m : metrics) {
            metricMap.put(m.getInstanceId() + ":" + m.getRemoteNodeUuid(), m);
        }

        return nodes.stream().map(node -> {
            MonitorNodeSnapshotViewDto dto = new MonitorNodeSnapshotViewDto();
            BeanUtils.copyProperties(node, dto);
            dto.setAssetId(asset.getId());
            dto.setAssetName(asset.getName());
            // Fill instance type
            MonitorInstance inst = instanceMap.get(node.getInstanceId());
            if (inst != null) {
                dto.setInstanceName(inst.getName());
                dto.setInstanceType(inst.getType());
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

    private List<XuiInstanceViewDto> enrichInstanceCounts(List<XuiInstanceViewDto> instances, List<XuiInboundSnapshot> inbounds) {
        Map<Long, List<XuiInboundSnapshot>> byInstance = inbounds.stream()
                .collect(Collectors.groupingBy(XuiInboundSnapshot::getInstanceId));
        for (XuiInstanceViewDto instance : instances) {
            List<XuiInboundSnapshot> scoped = byInstance.getOrDefault(instance.getId(), Collections.emptyList());
            long inboundCount = scoped.stream().filter(item -> item.getStatus() == null || item.getStatus() == 0).count();
            long clientCount = scoped.stream()
                    .filter(item -> item.getStatus() == null || item.getStatus() == 0)
                    .mapToLong(item -> safeInteger(item.getClientCount()))
                    .sum();
            instance.setInboundCount(inboundCount);
            instance.setClientCount(clientCount);
        }
        return instances;
    }

    private List<XuiProtocolSummaryViewDto> buildProtocolSummaries(List<XuiInboundSnapshot> inbounds) {
        if (inbounds == null || inbounds.isEmpty()) {
            return Collections.emptyList();
        }

        Map<String, XuiProtocolSummaryViewDto> summaryMap = new LinkedHashMap<>();
        Map<String, LinkedHashSet<String>> portsByProtocol = new HashMap<>();
        Map<String, LinkedHashSet<String>> transportsByProtocol = new HashMap<>();

        for (XuiInboundSnapshot inbound : inbounds) {
            String protocol = StringUtils.hasText(inbound.getProtocol()) ? inbound.getProtocol().trim().toLowerCase(Locale.ROOT) : "unknown";
            XuiProtocolSummaryViewDto summary = summaryMap.computeIfAbsent(protocol, key -> {
                XuiProtocolSummaryViewDto dto = new XuiProtocolSummaryViewDto();
                dto.setProtocol(key);
                dto.setInboundCount(0);
                dto.setActiveInboundCount(0);
                dto.setEnabledInboundCount(0);
                dto.setDisabledInboundCount(0);
                dto.setDeletedInboundCount(0);
                dto.setClientCount(0);
                dto.setOnlineClientCount(0);
                dto.setUp(0L);
                dto.setDown(0L);
                dto.setAllTime(0L);
                dto.setPortSummary("-");
                dto.setTransportSummary("-");
                return dto;
            });

            summary.setInboundCount(summary.getInboundCount() + 1);
            if (inbound.getStatus() != null && inbound.getStatus() == 1) {
                summary.setDeletedInboundCount(summary.getDeletedInboundCount() + 1);
            } else {
                summary.setActiveInboundCount(summary.getActiveInboundCount() + 1);
                if (inbound.getEnable() != null && inbound.getEnable() == 0) {
                    summary.setDisabledInboundCount(summary.getDisabledInboundCount() + 1);
                } else {
                    summary.setEnabledInboundCount(summary.getEnabledInboundCount() + 1);
                }
            }
            summary.setClientCount(summary.getClientCount() + safeInteger(inbound.getClientCount()));
            summary.setOnlineClientCount(summary.getOnlineClientCount() + safeInteger(inbound.getOnlineClientCount()));
            summary.setUp(summary.getUp() + safeLong(inbound.getUp()));
            summary.setDown(summary.getDown() + safeLong(inbound.getDown()));
            summary.setAllTime(summary.getAllTime() + safeLong(inbound.getAllTime()));

            if (inbound.getPort() != null) {
                String portValue = StringUtils.hasText(inbound.getListen())
                        ? inbound.getListen() + ":" + inbound.getPort()
                        : String.valueOf(inbound.getPort());
                portsByProtocol.computeIfAbsent(protocol, key -> new LinkedHashSet<>()).add(portValue);
            }
            if (StringUtils.hasText(inbound.getTransportSummary()) && !"-".equals(inbound.getTransportSummary())) {
                transportsByProtocol.computeIfAbsent(protocol, key -> new LinkedHashSet<>()).add(inbound.getTransportSummary());
            }
        }

        for (XuiProtocolSummaryViewDto summary : summaryMap.values()) {
            summary.setPortSummary(compactPreview(portsByProtocol.get(summary.getProtocol()), 4));
            summary.setTransportSummary(compactPreview(transportsByProtocol.get(summary.getProtocol()), 3));
        }

        return summaryMap.values().stream()
                .sorted(Comparator.comparingLong((XuiProtocolSummaryViewDto item) -> safeLong(item.getAllTime())).reversed())
                .collect(Collectors.toList());
    }

    private List<AssetForwardLinkViewDto> buildForwardLinks(List<Forward> forwards) {
        if (forwards == null || forwards.isEmpty()) {
            return Collections.emptyList();
        }
        Set<Integer> tunnelIds = forwards.stream()
                .map(Forward::getTunnelId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Integer, String> tunnelNameMap = tunnelIds.isEmpty()
                ? Collections.emptyMap()
                : tunnelService.listByIds(tunnelIds).stream().collect(Collectors.toMap(item -> item.getId().intValue(), Tunnel::getName));

        return forwards.stream().map(forward -> {
            AssetForwardLinkViewDto dto = new AssetForwardLinkViewDto();
            dto.setId(forward.getId());
            dto.setName(forward.getName());
            dto.setTunnelId(forward.getTunnelId());
            dto.setTunnelName(tunnelNameMap.get(forward.getTunnelId()));
            dto.setStatus(forward.getStatus());
            dto.setRemoteAddr(forward.getRemoteAddr());
            dto.setRemoteSourceType(forward.getRemoteSourceType());
            dto.setRemoteSourceLabel(forward.getRemoteSourceLabel());
            dto.setRemoteSourceProtocol(forward.getRemoteSourceProtocol());
            dto.setCreatedTime(forward.getCreatedTime());
            dto.setUpdatedTime(forward.getUpdatedTime());
            return dto;
        }).collect(Collectors.toList());
    }

    private OnePanelInstanceViewDto toOnePanelInstanceView(OnePanelInstance instance, AssetHost asset) {
        if (instance == null) {
            return null;
        }
        OnePanelInstanceViewDto dto = new OnePanelInstanceViewDto();
        BeanUtils.copyProperties(instance, dto);
        if (asset != null) {
            dto.setAssetId(asset.getId());
            dto.setAssetName(asset.getName());
            dto.setAssetPrimaryIp(asset.getPrimaryIp());
            dto.setAssetEnvironment(asset.getEnvironment());
            dto.setAssetRegion(asset.getRegion());
            dto.setPanelUrl(trimToNull(asset.getPanelUrl()));
        }
        return dto;
    }

    private int safeInteger(Integer value) {
        return value == null ? 0 : value;
    }

    private long safeLong(Long value) {
        return value == null ? 0L : value;
    }

    private String compactPreview(LinkedHashSet<String> values, int limit) {
        if (values == null || values.isEmpty()) {
            return "-";
        }
        List<String> ordered = new ArrayList<>(values);
        if (ordered.size() <= limit) {
            return String.join(", ", ordered);
        }
        return String.join(", ", ordered.subList(0, limit)) + " +" + (ordered.size() - limit);
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }
}
