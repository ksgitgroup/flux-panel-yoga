package com.admin.service.impl;

import com.admin.common.dto.*;
import com.admin.common.lang.R;
import com.admin.entity.AssetHost;
import com.admin.entity.Forward;
import com.admin.entity.Tunnel;
import com.admin.entity.XuiInboundSnapshot;
import com.admin.entity.XuiInstance;
import com.admin.mapper.AssetHostMapper;
import com.admin.mapper.ForwardMapper;
import com.admin.mapper.XuiInboundSnapshotMapper;
import com.admin.mapper.XuiInstanceMapper;
import com.admin.service.AssetHostService;
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

    @Resource
    private AssetHostMapper assetHostMapper;

    @Resource
    private XuiInstanceMapper xuiInstanceMapper;

    @Resource
    private XuiInboundSnapshotMapper xuiInboundSnapshotMapper;

    @Resource
    private ForwardMapper forwardMapper;

    @Resource
    private TunnelService tunnelService;

    @Override
    public R getAllAssets() {
        List<AssetHost> assets = this.list(new LambdaQueryWrapper<AssetHost>()
                .orderByDesc(AssetHost::getUpdatedTime, AssetHost::getId));
        return R.ok(buildAssetViews(assets));
    }

    @Override
    public R getAssetDetail(Long id) {
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

        AssetHostDetailDto detail = new AssetHostDetailDto();
        detail.setAsset(assetView);
        detail.setXuiInstances(enrichInstanceCounts(instanceViews, inbounds));
        detail.setProtocolSummaries(buildProtocolSummaries(inbounds));
        detail.setForwards(buildForwardLinks(forwards));
        return R.ok(detail);
    }

    @Override
    public R createAsset(AssetHostDto dto) {
        validateDuplicate(dto.getName(), dto.getLabel(), null);
        long now = System.currentTimeMillis();
        AssetHost asset = new AssetHost();
        applyAssetDto(asset, dto.getName(), dto.getLabel(), dto.getPrimaryIp(), dto.getEnvironment(), dto.getProvider(), dto.getRegion(), dto.getRemark());
        asset.setCreatedTime(now);
        asset.setUpdatedTime(now);
        asset.setStatus(0);
        this.save(asset);
        return R.ok(buildAssetViews(Collections.singletonList(asset)).stream().findFirst().orElse(null));
    }

    @Override
    public R updateAsset(AssetHostUpdateDto dto) {
        AssetHost asset = getRequiredAsset(dto.getId());
        validateDuplicate(dto.getName(), dto.getLabel(), dto.getId());
        applyAssetDto(asset, dto.getName(), dto.getLabel(), dto.getPrimaryIp(), dto.getEnvironment(), dto.getProvider(), dto.getRegion(), dto.getRemark());
        asset.setUpdatedTime(System.currentTimeMillis());
        this.updateById(asset);
        return R.ok(buildAssetViews(Collections.singletonList(asset)).stream().findFirst().orElse(null));
    }

    @Override
    public R deleteAsset(Long id) {
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
        this.removeById(asset.getId());
        return R.ok();
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

    private void applyAssetDto(AssetHost asset,
                               String name,
                               String label,
                               String primaryIp,
                               String environment,
                               String provider,
                               String region,
                               String remark) {
        asset.setName(trimToNull(name));
        asset.setLabel(trimToNull(label));
        asset.setPrimaryIp(trimToNull(primaryIp));
        asset.setEnvironment(trimToNull(environment));
        asset.setProvider(trimToNull(provider));
        asset.setRegion(trimToNull(region));
        asset.setRemark(trimToNull(remark));
    }

    private List<AssetHostViewDto> buildAssetViews(List<AssetHost> assets) {
        if (assets == null || assets.isEmpty()) {
            return Collections.emptyList();
        }
        List<Long> assetIds = assets.stream().map(AssetHost::getId).collect(Collectors.toList());

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

        List<AssetHostViewDto> result = new ArrayList<>();
        for (AssetHost asset : assets) {
            AssetHostViewDto dto = new AssetHostViewDto();
            BeanUtils.copyProperties(asset, dto);

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
            result.add(dto);
        }

        result.sort(Comparator.comparingLong((AssetHostViewDto item) -> safeLong(item.getLastObservedAt())).reversed()
                .thenComparing(AssetHostViewDto::getName, Comparator.nullsLast(String::compareTo)));
        return result;
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
