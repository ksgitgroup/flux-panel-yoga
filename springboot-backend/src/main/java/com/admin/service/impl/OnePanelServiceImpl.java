package com.admin.service.impl;

import com.admin.common.dto.*;
import com.admin.common.lang.R;
import com.admin.entity.AssetHost;
import com.admin.entity.OnePanelInstance;
import com.admin.entity.OnePanelSnapshotLatest;
import com.admin.mapper.AssetHostMapper;
import com.admin.mapper.OnePanelInstanceMapper;
import com.admin.mapper.OnePanelSnapshotLatestMapper;
import com.admin.service.OnePanelService;
import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import javax.annotation.Resource;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class OnePanelServiceImpl extends ServiceImpl<OnePanelInstanceMapper, OnePanelInstance> implements OnePanelService {

    private static final String STATUS_NEVER = "never";
    private static final String STATUS_SUCCESS = "success";
    private static final String STATUS_FAILED = "failed";
    private static final int FLAG_TRUE = 1;
    private static final int FLAG_FALSE = 0;
    private static final int MAX_APPS = 200;
    private static final int MAX_WEBSITES = 200;
    private static final int MAX_CONTAINERS = 400;
    private static final int MAX_CRONJOBS = 200;
    private static final int MAX_BACKUPS = 200;

    @Resource
    private OnePanelInstanceMapper onePanelInstanceMapper;

    @Resource
    private OnePanelSnapshotLatestMapper onePanelSnapshotLatestMapper;

    @Resource
    private AssetHostMapper assetHostMapper;

    @Override
    public R getAllInstances() {
        List<OnePanelInstance> instances = this.list(new LambdaQueryWrapper<OnePanelInstance>()
                .orderByDesc(OnePanelInstance::getUpdatedTime, OnePanelInstance::getId));
        Map<Long, AssetHost> assetMap = loadAssetHostMap(instances.stream()
                .map(OnePanelInstance::getAssetId)
                .collect(Collectors.toSet()));
        List<OnePanelInstanceViewDto> data = instances.stream()
                .map(item -> toInstanceView(item, assetMap))
                .collect(Collectors.toList());
        return R.ok(data);
    }

    @Override
    public R getInstanceDetail(Long id) {
        OnePanelInstance instance = getRequiredInstance(id);
        Map<Long, AssetHost> assetMap = loadAssetHostMap(Collections.singleton(instance.getAssetId()));
        OnePanelInstanceDetailDto dto = new OnePanelInstanceDetailDto();
        dto.setInstance(toInstanceView(instance, assetMap));

        OnePanelSnapshotLatest latest = onePanelSnapshotLatestMapper.selectOne(new LambdaQueryWrapper<OnePanelSnapshotLatest>()
                .eq(OnePanelSnapshotLatest::getInstanceId, id)
                .orderByDesc(OnePanelSnapshotLatest::getUpdatedTime)
                .last("LIMIT 1"));
        if (latest != null) {
            dto.setLatestReport(parseReportPayload(latest.getPayloadJson()));
            dto.setLatestReportTime(latest.getReportTime());
            dto.setLatestReportRemoteIp(latest.getRemoteIp());
        }
        return R.ok(dto);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R createInstance(OnePanelInstanceDto dto) {
        String duplicateError = checkDuplicateName(dto.getName(), null);
        if (duplicateError != null) {
            return R.err(duplicateError);
        }
        String duplicateAssetError = checkDuplicateAssetBinding(dto.getAssetId(), null);
        if (duplicateAssetError != null) {
            return R.err(duplicateAssetError);
        }

        long now = System.currentTimeMillis();
        OnePanelInstance instance = new OnePanelInstance();
        instance.setName(dto.getName().trim());
        instance.setAssetId(resolveAssetId(dto.getAssetId()));
        instance.setPanelUrl(resolvePanelUrl(dto.getPanelUrl(), instance.getAssetId()));
        instance.setInstanceKey(generateUniqueInstanceKey());
        String token = generateNodeToken();
        instance.setExporterTokenHash(sha256Hex(token));
        instance.setReportEnabled(normalizeFlag(dto.getReportEnabled()));
        instance.setRemark(trimToNull(dto.getRemark()));
        instance.setTokenIssuedAt(now);
        instance.setLastReportStatus(STATUS_NEVER);
        instance.setAppCount(0);
        instance.setWebsiteCount(0);
        instance.setContainerCount(0);
        instance.setCronjobCount(0);
        instance.setBackupCount(0);
        instance.setCreatedTime(now);
        instance.setUpdatedTime(now);
        instance.setStatus(0);
        this.save(instance);
        return R.ok(buildBootstrapDto(instance, token));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R updateInstance(OnePanelInstanceUpdateDto dto) {
        OnePanelInstance existing = getRequiredInstance(dto.getId());
        String duplicateError = checkDuplicateName(dto.getName(), dto.getId());
        if (duplicateError != null) {
            return R.err(duplicateError);
        }
        String duplicateAssetError = checkDuplicateAssetBinding(dto.getAssetId(), dto.getId());
        if (duplicateAssetError != null) {
            return R.err(duplicateAssetError);
        }

        existing.setName(dto.getName().trim());
        existing.setAssetId(resolveAssetId(dto.getAssetId()));
        existing.setPanelUrl(resolvePanelUrl(dto.getPanelUrl(), existing.getAssetId()));
        existing.setReportEnabled(normalizeFlag(dto.getReportEnabled()));
        existing.setRemark(trimToNull(dto.getRemark()));
        existing.setUpdatedTime(System.currentTimeMillis());
        this.updateById(existing);
        return R.ok(toInstanceView(existing, loadAssetHostMap(Collections.singleton(existing.getAssetId()))));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R deleteInstance(Long id) {
        OnePanelInstance existing = getRequiredInstance(id);
        this.removeById(id);
        onePanelSnapshotLatestMapper.delete(new LambdaQueryWrapper<OnePanelSnapshotLatest>()
                .eq(OnePanelSnapshotLatest::getInstanceId, id));
        return R.ok();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R rotateToken(OnePanelInstanceIdDto dto) {
        OnePanelInstance instance = getRequiredInstance(dto.getId());
        String token = generateNodeToken();
        long now = System.currentTimeMillis();
        instance.setExporterTokenHash(sha256Hex(token));
        instance.setTokenIssuedAt(now);
        instance.setUpdatedTime(now);
        this.updateById(instance);
        return R.ok(buildBootstrapDto(instance, token));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R receiveReport(String instanceKey, String token, OnePanelExporterReportDto dto, String remoteIp) {
        if (!StringUtils.hasText(instanceKey) || !StringUtils.hasText(token)) {
            return R.err("缺少 exporter 鉴权头");
        }
        if (dto == null) {
            return R.err("缺少上报数据");
        }

        OnePanelInstance instance = onePanelInstanceMapper.selectOne(new LambdaQueryWrapper<OnePanelInstance>()
                .eq(OnePanelInstance::getInstanceKey, instanceKey)
                .eq(OnePanelInstance::getStatus, 0)
                .last("LIMIT 1"));
        if (instance == null) {
            return R.err("1Panel 实例不存在");
        }
        if (!Objects.equals(instance.getReportEnabled(), FLAG_TRUE)) {
            return R.err("该实例未启用上报");
        }
        if (!Objects.equals(instance.getExporterTokenHash(), sha256Hex(token))) {
            return R.err("exporter 鉴权失败");
        }

        long now = System.currentTimeMillis();
        OnePanelExporterReportDto sanitized = sanitizeReport(instance, dto, now);
        String payloadJson = JSON.toJSONString(sanitized);
        long reportTime = sanitized.getReportTime() != null ? sanitized.getReportTime() : now;

        OnePanelSnapshotLatest latest = onePanelSnapshotLatestMapper.selectOne(new LambdaQueryWrapper<OnePanelSnapshotLatest>()
                .eq(OnePanelSnapshotLatest::getInstanceId, instance.getId())
                .last("LIMIT 1"));
        if (latest == null) {
            latest = new OnePanelSnapshotLatest();
            latest.setInstanceId(instance.getId());
            latest.setAssetId(instance.getAssetId());
            latest.setCreatedTime(now);
            latest.setStatus(0);
        }
        latest.setAssetId(instance.getAssetId());
        latest.setReportTime(reportTime);
        latest.setRemoteIp(trimToNull(remoteIp));
        latest.setExporterVersion(trimToNull(sanitized.getExporterVersion()));
        latest.setPanelVersion(trimToNull(sanitized.getPanelVersion()));
        latest.setPanelEdition(trimToNull(sanitized.getPanelEdition()));
        latest.setPayloadJson(payloadJson);
        latest.setUpdatedTime(now);
        if (latest.getId() == null) {
            onePanelSnapshotLatestMapper.insert(latest);
        } else {
            onePanelSnapshotLatestMapper.updateById(latest);
        }

        instance.setLastReportAt(reportTime);
        instance.setLastReportStatus(STATUS_SUCCESS);
        instance.setLastReportError(null);
        instance.setLastReportRemoteIp(trimToNull(remoteIp));
        instance.setExporterVersion(trimToNull(sanitized.getExporterVersion()));
        instance.setPanelVersion(trimToNull(sanitized.getPanelVersion()));
        instance.setPanelEdition(trimToNull(sanitized.getPanelEdition()));
        instance.setAppCount(sizeOf(sanitized.getApps()));
        instance.setWebsiteCount(sizeOf(sanitized.getWebsites()));
        instance.setContainerCount(sizeOf(sanitized.getContainers()));
        instance.setCronjobCount(sizeOf(sanitized.getCronjobs()));
        instance.setBackupCount(sizeOf(sanitized.getBackups()));
        instance.setUpdatedTime(now);
        this.updateById(instance);

        Map<String, Object> ack = new LinkedHashMap<>();
        ack.put("instanceId", instance.getId());
        ack.put("reportedAt", reportTime);
        ack.put("apps", instance.getAppCount());
        ack.put("websites", instance.getWebsiteCount());
        ack.put("containers", instance.getContainerCount());
        return R.ok(ack);
    }

    @Override
    public R diagnoseConnectivity(Long id) {
        OnePanelInstance instance = getRequiredInstance(id);
        Map<String, Object> diag = new LinkedHashMap<>();
        diag.put("instanceId", instance.getId());
        diag.put("instanceName", instance.getName());
        diag.put("instanceKey", instance.getInstanceKey());
        diag.put("reportEnabled", Objects.equals(instance.getReportEnabled(), FLAG_TRUE));
        diag.put("tokenIssuedAt", instance.getTokenIssuedAt());
        diag.put("lastReportAt", instance.getLastReportAt());
        diag.put("lastReportStatus", instance.getLastReportStatus());
        diag.put("lastReportError", instance.getLastReportError());
        diag.put("lastReportRemoteIp", instance.getLastReportRemoteIp());
        diag.put("exporterVersion", instance.getExporterVersion());
        diag.put("panelVersion", instance.getPanelVersion());

        List<String> checks = new ArrayList<>();
        List<String> suggestions = new ArrayList<>();

        if (!Objects.equals(instance.getReportEnabled(), FLAG_TRUE)) {
            checks.add("FAIL: 上报已关闭");
            suggestions.add("请在实例设置中开启 exporter 上报");
        } else {
            checks.add("PASS: 上报已开启");
        }

        if (instance.getTokenIssuedAt() == null || instance.getTokenIssuedAt() == 0) {
            checks.add("FAIL: Token 尚未颁发");
            suggestions.add("请重新创建实例或轮换 Token");
        } else {
            checks.add("PASS: Token 已颁发 (" + formatTs(instance.getTokenIssuedAt()) + ")");
        }

        String reportStatus = instance.getLastReportStatus();
        if (STATUS_NEVER.equals(reportStatus) || reportStatus == null) {
            checks.add("FAIL: 从未收到过上报");
            suggestions.add("请在目标服务器运行: systemctl start flux-1panel-sync.service");
            suggestions.add("查看 exporter 日志: journalctl -u flux-1panel-sync.service -n 30 --no-pager");
            suggestions.add("确认 .env 中 FLUX_URL 可从目标服务器访问");
            suggestions.add("确认 .env 中 FLUX_NODE_TOKEN 与创建时一致");
        } else if (STATUS_FAILED.equals(reportStatus)) {
            checks.add("FAIL: 最近一次上报失败");
            if (StringUtils.hasText(instance.getLastReportError())) {
                checks.add("错误: " + instance.getLastReportError());
            }
            suggestions.add("查看 exporter 日志: journalctl -u flux-1panel-sync.service -n 30 --no-pager");
        } else if (STATUS_SUCCESS.equals(reportStatus)) {
            checks.add("PASS: 最近一次上报成功 (" + formatTs(instance.getLastReportAt()) + ")");
            long elapsed = System.currentTimeMillis() - (instance.getLastReportAt() != null ? instance.getLastReportAt() : 0);
            if (elapsed > 600_000) {
                checks.add("WARN: 距离上次上报已超过 10 分钟 (定时器间隔为 5 分钟)");
                suggestions.add("检查定时器: systemctl status flux-1panel-sync.timer");
                suggestions.add("手动触发: systemctl start flux-1panel-sync.service");
            }
        }

        diag.put("checks", checks);
        diag.put("suggestions", suggestions);

        String triggerCmd = "systemctl start flux-1panel-sync.service && journalctl -u flux-1panel-sync.service -n 20 --no-pager";
        diag.put("triggerCommand", triggerCmd);

        return R.ok(diag);
    }

    private String formatTs(Long ts) {
        if (ts == null || ts == 0) return "-";
        return new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new java.util.Date(ts));
    }

    private OnePanelInstance getRequiredInstance(Long id) {
        OnePanelInstance instance = this.getById(id);
        if (instance == null || instance.getStatus() == 1) {
            throw new IllegalArgumentException("1Panel 实例不存在");
        }
        return instance;
    }

    private String checkDuplicateName(String name, Long excludeId) {
        if (!StringUtils.hasText(name)) {
            return "实例名称不能为空";
        }
        LambdaQueryWrapper<OnePanelInstance> wrapper = new LambdaQueryWrapper<OnePanelInstance>()
                .eq(OnePanelInstance::getName, name.trim())
                .eq(OnePanelInstance::getStatus, 0);
        if (excludeId != null) {
            wrapper.ne(OnePanelInstance::getId, excludeId);
        }
        Integer count = onePanelInstanceMapper.selectCount(wrapper);
        return count != null && count > 0 ? "实例名称已存在" : null;
    }

    private Long resolveAssetId(Long assetId) {
        if (assetId == null) {
            return null;
        }
        AssetHost asset = assetHostMapper.selectById(assetId);
        if (asset == null || asset.getStatus() == 1) {
            throw new IllegalArgumentException("绑定的服务器资产不存在");
        }
        return asset.getId();
    }

    private String resolvePanelUrl(String panelUrl, Long assetId) {
        if (assetId == null) {
            return trimToNull(panelUrl);
        }
        AssetHost asset = assetHostMapper.selectById(assetId);
        if (asset == null || asset.getStatus() == 1) {
            throw new IllegalStateException("绑定的服务器资产不存在");
        }
        String assetPanelUrl = trimToNull(asset.getPanelUrl());
        if (!StringUtils.hasText(assetPanelUrl)) {
            throw new IllegalStateException("绑定的服务器资产尚未录入 1Panel 地址");
        }
        return assetPanelUrl;
    }

    private String checkDuplicateAssetBinding(Long assetId, Long excludeId) {
        if (assetId == null) {
            return null;
        }
        LambdaQueryWrapper<OnePanelInstance> wrapper = new LambdaQueryWrapper<OnePanelInstance>()
                .eq(OnePanelInstance::getAssetId, assetId)
                .eq(OnePanelInstance::getStatus, 0);
        if (excludeId != null) {
            wrapper.ne(OnePanelInstance::getId, excludeId);
        }
        Integer count = onePanelInstanceMapper.selectCount(wrapper);
        return count != null && count > 0 ? "该服务器资产已存在 1Panel 摘要实例" : null;
    }

    private Map<Long, AssetHost> loadAssetHostMap(Set<Long> assetIds) {
        Set<Long> validIds = assetIds.stream().filter(Objects::nonNull).collect(Collectors.toSet());
        if (validIds.isEmpty()) {
            return Collections.emptyMap();
        }
        List<AssetHost> assets = assetHostMapper.selectBatchIds(validIds);
        return assets.stream().collect(Collectors.toMap(AssetHost::getId, item -> item, (left, right) -> left));
    }

    private OnePanelInstanceViewDto toInstanceView(OnePanelInstance instance, Map<Long, AssetHost> assetMap) {
        OnePanelInstanceViewDto dto = new OnePanelInstanceViewDto();
        BeanUtils.copyProperties(instance, dto);
        AssetHost asset = instance.getAssetId() == null ? null : assetMap.get(instance.getAssetId());
        if (asset != null) {
            dto.setAssetName(asset.getName());
            dto.setAssetPrimaryIp(asset.getPrimaryIp());
            dto.setAssetEnvironment(asset.getEnvironment());
            dto.setAssetRegion(asset.getRegion());
            dto.setPanelUrl(trimToNull(asset.getPanelUrl()));
        }
        return dto;
    }

    private OnePanelBootstrapDto buildBootstrapDto(OnePanelInstance instance, String token) {
        Map<Long, AssetHost> assetMap = loadAssetHostMap(Collections.singleton(instance.getAssetId()));
        OnePanelBootstrapDto dto = new OnePanelBootstrapDto();
        dto.setInstance(toInstanceView(instance, assetMap));
        dto.setNodeToken(token);

        String fluxBase = resolveFluxBaseUrl();
        String localPanelUrl = resolveLocalPanelBaseUrl(instance.getPanelUrl());
        String envTemplate = String.join("\n",
                "FLUX_URL=" + fluxBase,
                "FLUX_INSTANCE_KEY=" + instance.getInstanceKey(),
                "FLUX_NODE_TOKEN=" + token,
                "PANEL_BASE_URL=" + localPanelUrl,
                "PANEL_API_KEY=（安装脚本会交互式填入，无需手动修改）",
                "PANEL_VERIFY_TLS=false",
                "PANEL_TIMEOUT_MS=8000",
                "SYNC_INTERVAL=300",
                "ASSET_BIND_KEY=" + (instance.getAssetId() == null ? "" : instance.getAssetId()),
                "SITE_ENVIRONMENT=",
                "EXPORTER_LOG_LEVEL=info");
        dto.setEnvTemplate(envTemplate);
        String exporterBase = fluxBase + "/api/v1/onepanel/exporter";
        dto.setInstallSnippet(String.join("\n",
                "#!/usr/bin/env bash",
                "set -euo pipefail",
                "",
                "# ============================================================",
                "# Flux 1Panel Exporter 一键安装脚本",
                "# 运行方式：SSH 登录到目标服务器，以 root 身份执行本脚本",
                "# ============================================================",
                "",
                "# --- 第 1 步：交互式输入 1Panel API Key ---",
                "# 获取方式：登录你的 1Panel 面板 → 左下角「面板设置」→「API 接口」",
                "#          → 开启 API 接口 → 复制「API 密钥」",
                "echo ''",
                "echo '================================================'",
                "echo '  Flux 1Panel Exporter 安装向导'",
                "echo '================================================'",
                "echo ''",
                "echo '需要你的 1Panel API Key 才能同步面板数据。'",
                "echo ''",
                "echo '获取方式：'",
                "echo '  1. 登录你的 1Panel 面板（通常 https://你的IP:端口）'",
                "echo '  2. 点击左下角「面板设置」'",
                "echo '  3. 找到「API 接口」选项卡'",
                "echo '  4. 开启 API 接口（如未开启）'",
                "echo '  5. 复制显示的「API 密钥」'",
                "echo ''",
                "printf '请输入 1Panel API Key: '",
                "read -r PANEL_API_KEY_INPUT",
                "if [ -z \"$PANEL_API_KEY_INPUT\" ]; then",
                "  echo '错误：API Key 不能为空，安装已取消。'",
                "  exit 1",
                "fi",
                "",
                "# --- 第 2 步：写入环境变量 ---",
                "mkdir -p /etc/flux-1panel-sync",
                "cat >/etc/flux-1panel-sync/.env <<EOF",
                "FLUX_URL=" + fluxBase,
                "FLUX_INSTANCE_KEY=" + instance.getInstanceKey(),
                "FLUX_NODE_TOKEN=" + token,
                "PANEL_BASE_URL=" + localPanelUrl,
                "PANEL_API_KEY=$PANEL_API_KEY_INPUT",
                "PANEL_VERIFY_TLS=false",
                "PANEL_TIMEOUT_MS=8000",
                "SYNC_INTERVAL=300",
                "ASSET_BIND_KEY=" + (instance.getAssetId() == null ? "" : instance.getAssetId()),
                "SITE_ENVIRONMENT=",
                "EXPORTER_LOG_LEVEL=info",
                "EOF",
                "chmod 600 /etc/flux-1panel-sync/.env",
                "",
                "# --- 第 3 步：从 Flux 面板下载 exporter 脚本和 systemd 配置 ---",
                "curl -fsSL " + exporterBase + "/flux-1panel-sync.sh -o /usr/local/bin/flux-1panel-sync && chmod +x /usr/local/bin/flux-1panel-sync",
                "curl -fsSL " + exporterBase + "/flux-1panel-sync.service -o /etc/systemd/system/flux-1panel-sync.service",
                "curl -fsSL " + exporterBase + "/flux-1panel-sync.timer -o /etc/systemd/system/flux-1panel-sync.timer",
                "",
                "# --- 第 4 步：启用定时同步 ---",
                "systemctl daemon-reload && systemctl enable --now flux-1panel-sync.timer",
                "systemctl start flux-1panel-sync.service",
                "",
                "echo ''",
                "echo '================================================'",
                "echo '  安装完成！Exporter 已启动并将每 5 分钟同步一次'",
                "echo '================================================'",
                "echo ''",
                "echo '常用命令：'",
                "echo '  查看同步状态：systemctl status flux-1panel-sync.timer'",
                "echo '  手动触发同步：systemctl start flux-1panel-sync.service'",
                "echo '  查看同步日志：journalctl -u flux-1panel-sync.service -n 20'",
                "echo '  修改配置文件：nano /etc/flux-1panel-sync/.env'",
                "echo ''"));
        return dto;
    }

    /**
     * 从 panelUrl (e.g. https://1.2.3.4:12345) 提取端口，构建本机访问地址 https://127.0.0.1:{port}
     */
    private String resolveLocalPanelBaseUrl(String panelUrl) {
        if (!StringUtils.hasText(panelUrl)) {
            return "https://127.0.0.1:10086";
        }
        try {
            java.net.URI uri = java.net.URI.create(panelUrl.trim());
            int port = uri.getPort();
            String scheme = uri.getScheme() != null ? uri.getScheme() : "https";
            if (port <= 0) {
                port = "http".equals(scheme) ? 80 : 443;
            }
            return scheme + "://127.0.0.1:" + port;
        } catch (Exception e) {
            return "https://127.0.0.1:10086";
        }
    }

    private String resolveFluxBaseUrl() {
        try {
            return ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
        } catch (Exception ignored) {
            return "https://your-flux-domain";
        }
    }

    private OnePanelExporterReportDto sanitizeReport(OnePanelInstance instance, OnePanelExporterReportDto dto, long now) {
        OnePanelExporterReportDto sanitized = new OnePanelExporterReportDto();
        sanitized.setSchemaVersion(dto.getSchemaVersion() == null || dto.getSchemaVersion() <= 0 ? 1 : dto.getSchemaVersion());
        sanitized.setInstanceKey(instance.getInstanceKey());
        sanitized.setAssetId(instance.getAssetId());
        sanitized.setExporterVersion(trimToNull(dto.getExporterVersion()));
        sanitized.setReportTime(dto.getReportTime() == null || dto.getReportTime() <= 0 ? now : dto.getReportTime());
        sanitized.setPanelVersion(trimToNull(dto.getPanelVersion()));
        sanitized.setPanelEdition(trimToNull(dto.getPanelEdition()));
        sanitized.setPanelBaseUrl(trimToNull(dto.getPanelBaseUrl()));
        sanitized.setSystem(dto.getSystem());
        sanitized.setAudit(dto.getAudit());
        sanitized.setApps(capList(dto.getApps(), MAX_APPS));
        sanitized.setWebsites(capList(dto.getWebsites(), MAX_WEBSITES));
        sanitized.setContainers(capList(dto.getContainers(), MAX_CONTAINERS));
        sanitized.setCronjobs(capList(dto.getCronjobs(), MAX_CRONJOBS));
        sanitized.setBackups(capList(dto.getBackups(), MAX_BACKUPS));
        return sanitized;
    }

    private OnePanelExporterReportDto parseReportPayload(String payloadJson) {
        if (!StringUtils.hasText(payloadJson)) {
            return null;
        }
        try {
            return JSON.parseObject(payloadJson, OnePanelExporterReportDto.class);
        } catch (Exception e) {
            log.warn("[OnePanel] 解析最新快照失败: {}", e.getMessage());
            return null;
        }
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private Integer normalizeFlag(Integer value) {
        return Objects.equals(value, FLAG_FALSE) ? FLAG_FALSE : FLAG_TRUE;
    }

    private String generateUniqueInstanceKey() {
        for (int i = 0; i < 10; i++) {
            String candidate = "op_" + UUID.randomUUID().toString().replace("-", "");
            Integer count = onePanelInstanceMapper.selectCount(new LambdaQueryWrapper<OnePanelInstance>()
                    .eq(OnePanelInstance::getInstanceKey, candidate));
            if (count == null || count == 0) {
                return candidate;
            }
        }
        throw new IllegalStateException("生成 1Panel 实例 Key 失败");
    }

    private String generateNodeToken() {
        return UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "");
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] encodedHash = digest.digest((value == null ? "" : value).getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(encodedHash.length * 2);
            for (byte item : encodedHash) {
                builder.append(String.format("%02x", item));
            }
            return builder.toString();
        } catch (Exception e) {
            throw new IllegalStateException("计算 SHA-256 失败", e);
        }
    }

    private <T> List<T> capList(List<T> items, int maxSize) {
        if (items == null || items.isEmpty()) {
            return Collections.emptyList();
        }
        if (items.size() <= maxSize) {
            return items;
        }
        return new ArrayList<>(items.subList(0, maxSize));
    }

    private int sizeOf(List<?> items) {
        return items == null ? 0 : items.size();
    }
}
