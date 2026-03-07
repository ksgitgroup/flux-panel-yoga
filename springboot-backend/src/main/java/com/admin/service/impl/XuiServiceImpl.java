package com.admin.service.impl;

import com.admin.common.dto.*;
import com.admin.common.lang.R;
import com.admin.entity.XuiClientSnapshot;
import com.admin.entity.XuiInboundSnapshot;
import com.admin.entity.XuiInstance;
import com.admin.entity.XuiSyncLog;
import com.admin.entity.XuiTrafficDeltaEvent;
import com.admin.mapper.XuiClientSnapshotMapper;
import com.admin.mapper.XuiInboundSnapshotMapper;
import com.admin.mapper.XuiInstanceMapper;
import com.admin.mapper.XuiSyncLogMapper;
import com.admin.mapper.XuiTrafficDeltaEventMapper;
import com.admin.service.XuiService;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.apache.http.NameValuePair;
import org.apache.http.HttpHeaders;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.entity.UrlEncodedFormEntity;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.client.methods.HttpUriRequest;
import org.apache.http.conn.ssl.NoopHostnameVerifier;
import org.apache.http.entity.ContentType;
import org.apache.http.impl.client.BasicCookieStore;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.message.BasicNameValuePair;
import org.apache.http.ssl.SSLContexts;
import org.apache.http.ssl.TrustStrategy;
import org.apache.http.util.EntityUtils;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import javax.annotation.Resource;
import javax.net.ssl.SSLContext;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
public class XuiServiceImpl extends ServiceImpl<XuiInstanceMapper, XuiInstance> implements XuiService {

    private static final String STATUS_NEVER = "never";
    private static final String STATUS_SUCCESS = "success";
    private static final String STATUS_FAILED = "failed";
    private static final String MODE_OBSERVE = "observe";
    private static final String MODE_FLUX_MANAGED = "flux_managed";
    private static final String API_FLAVOR_3XUI = "3x-ui";
    private static final String API_FLAVOR_PANEL_API = "panel-api";
    private static final String API_FLAVOR_XUI_API = "xui-api";
    private static final int FLAG_TRUE = 1;
    private static final int FLAG_FALSE = 0;
    private static final Pattern BASE_PATH_PATTERN = Pattern.compile("basePath\\s*=\\s*['\"]([^'\"]+)['\"]");
    private static final String AJAX_HEADER = "X-Requested-With";
    private static final String AJAX_HEADER_VALUE = "XMLHttpRequest";
    private static final String AJAX_ACCEPT = "application/json, text/plain, */*";

    private final Set<Long> runningSyncInstanceIds = ConcurrentHashMap.newKeySet();

    @Resource
    private XuiInstanceMapper xuiInstanceMapper;

    @Resource
    private XuiInboundSnapshotMapper xuiInboundSnapshotMapper;

    @Resource
    private XuiClientSnapshotMapper xuiClientSnapshotMapper;

    @Resource
    private XuiSyncLogMapper xuiSyncLogMapper;

    @Resource
    private XuiTrafficDeltaEventMapper xuiTrafficDeltaEventMapper;

    @Resource
    private XuiCredentialCryptoService xuiCredentialCryptoService;

    @Override
    public R getAllInstances() {
        List<XuiInstance> instances = this.list(new LambdaQueryWrapper<XuiInstance>()
                .orderByDesc(XuiInstance::getUpdatedTime, XuiInstance::getId));

        List<XuiInstanceViewDto> data = instances.stream()
                .map(this::toInstanceView)
                .collect(Collectors.toList());
        return R.ok(data);
    }

    @Override
    public R getInstanceDetail(Long id) {
        XuiInstance instance = getRequiredInstance(id);

        XuiInstanceDetailDto detail = new XuiInstanceDetailDto();
        detail.setInstance(toInstanceView(instance));
        detail.setInbounds(loadInboundViews(instance.getId()));
        detail.setClients(loadClientViews(instance.getId()));
        return R.ok(detail);
    }

    @Override
    public R createInstance(XuiInstanceDto dto) {
        String duplicateError = checkDuplicateName(dto.getName(), null);
        if (duplicateError != null) {
            return R.err(duplicateError);
        }

        long now = System.currentTimeMillis();
        NormalizedInstanceEndpoint endpoint = normalizeEndpointInput(dto.getBaseUrl(), dto.getWebBasePath());
        XuiInstance instance = new XuiInstance();
        instance.setName(dto.getName().trim());
        instance.setBaseUrl(endpoint.getBaseUrl());
        instance.setWebBasePath(endpoint.getWebBasePath());
        instance.setUsername(dto.getUsername().trim());
        instance.setEncryptedPassword(xuiCredentialCryptoService.encrypt(dto.getPassword()));
        instance.setEncryptedLoginSecret(encryptOptionalSecret(dto.getLoginSecret()));
        instance.setHostLabel(trimToNull(dto.getHostLabel()));
        instance.setManagementMode(normalizeManagementMode(dto.getManagementMode()));
        instance.setSyncEnabled(normalizeFlag(dto.getSyncEnabled()));
        instance.setSyncIntervalMinutes(dto.getSyncIntervalMinutes());
        instance.setAllowInsecureTls(normalizeFlag(dto.getAllowInsecureTls()));
        instance.setRemark(trimToNull(dto.getRemark()));
        instance.setTrafficToken(UUID.randomUUID().toString().replace("-", ""));
        instance.setLastSyncStatus(STATUS_NEVER);
        instance.setLastTestStatus(STATUS_NEVER);
        instance.setCreatedTime(now);
        instance.setUpdatedTime(now);
        instance.setStatus(0);

        this.save(instance);
        return R.ok(toInstanceView(instance));
    }

    @Override
    public R updateInstance(XuiInstanceUpdateDto dto) {
        XuiInstance existing = getRequiredInstance(dto.getId());
        String duplicateError = checkDuplicateName(dto.getName(), dto.getId());
        if (duplicateError != null) {
            return R.err(duplicateError);
        }

        NormalizedInstanceEndpoint endpoint = normalizeEndpointInput(dto.getBaseUrl(), dto.getWebBasePath());
        existing.setName(dto.getName().trim());
        existing.setBaseUrl(endpoint.getBaseUrl());
        existing.setWebBasePath(endpoint.getWebBasePath());
        existing.setUsername(dto.getUsername().trim());
        if (StringUtils.hasText(dto.getPassword())) {
            existing.setEncryptedPassword(xuiCredentialCryptoService.encrypt(dto.getPassword()));
        }
        if (StringUtils.hasText(dto.getLoginSecret())) {
            existing.setEncryptedLoginSecret(encryptOptionalSecret(dto.getLoginSecret()));
        }
        existing.setHostLabel(trimToNull(dto.getHostLabel()));
        existing.setManagementMode(normalizeManagementMode(dto.getManagementMode()));
        existing.setSyncEnabled(normalizeFlag(dto.getSyncEnabled()));
        existing.setSyncIntervalMinutes(dto.getSyncIntervalMinutes());
        existing.setAllowInsecureTls(normalizeFlag(dto.getAllowInsecureTls()));
        existing.setRemark(trimToNull(dto.getRemark()));
        existing.setUpdatedTime(System.currentTimeMillis());

        this.updateById(existing);
        return R.ok(toInstanceView(existing));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R deleteInstance(Long id) {
        XuiInstance existing = getRequiredInstance(id);
        this.removeById(existing.getId());
        xuiInboundSnapshotMapper.delete(new LambdaQueryWrapper<XuiInboundSnapshot>().eq(XuiInboundSnapshot::getInstanceId, id));
        xuiClientSnapshotMapper.delete(new LambdaQueryWrapper<XuiClientSnapshot>().eq(XuiClientSnapshot::getInstanceId, id));
        xuiSyncLogMapper.delete(new LambdaQueryWrapper<XuiSyncLog>().eq(XuiSyncLog::getInstanceId, id));
        xuiTrafficDeltaEventMapper.delete(new LambdaQueryWrapper<XuiTrafficDeltaEvent>().eq(XuiTrafficDeltaEvent::getInstanceId, id));
        return R.ok();
    }

    @Override
    public R testInstance(XuiInstanceIdDto dto) {
        XuiInstance instance = getRequiredInstance(dto.getId());
        long startedAt = System.currentTimeMillis();

        try {
            XuiRemoteSnapshot remoteSnapshot = fetchRemoteSnapshot(instance);
            long finishedAt = System.currentTimeMillis();

            updateTestState(instance, STATUS_SUCCESS, null, finishedAt);
            saveSyncLog(instance.getId(), "test", true,
                    "连接测试成功",
                    String.format("读取到 %d 个入站、%d 个客户端", remoteSnapshot.getInbounds().size(), remoteSnapshot.getRemoteClientCount()),
                    startedAt,
                    finishedAt);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("instanceId", instance.getId());
            result.put("instanceName", instance.getName());
            result.put("remoteInboundCount", remoteSnapshot.getInbounds().size());
            result.put("remoteClientCount", remoteSnapshot.getRemoteClientCount());
            result.put("apiFlavor", remoteSnapshot.getApiFlavor());
            result.put("resolvedBasePath", remoteSnapshot.getResolvedBasePath());
            result.put("message", String.format("连接成功并拿到远端快照（%s，Base Path: %s）",
                    remoteSnapshot.getApiFlavor(),
                    remoteSnapshot.getResolvedBasePath()));
            return R.ok(result);
        } catch (Exception e) {
            long finishedAt = System.currentTimeMillis();
            String errorMessage = shortenError(e.getMessage());
            updateTestState(instance, STATUS_FAILED, errorMessage, finishedAt);
            saveSyncLog(instance.getId(), "test", false, "连接测试失败", errorMessage, startedAt, finishedAt);
            return R.err("连接测试失败: " + errorMessage);
        }
    }

    @Override
    public R syncInstance(XuiInstanceIdDto dto) {
        try {
            XuiSyncResultDto result = performSync(getRequiredInstance(dto.getId()), "manual");
            return R.ok(result);
        } catch (IllegalStateException e) {
            return R.err(e.getMessage());
        } catch (Exception e) {
            return R.err("同步失败: " + shortenError(e.getMessage()));
        }
    }

    @Override
    public R receiveTraffic(String token, String requestBody, String remoteIp) {
        if (!StringUtils.hasText(token)) {
            return R.err("缺少上报 token");
        }
        XuiInstance instance = xuiInstanceMapper.selectOne(new LambdaQueryWrapper<XuiInstance>()
                .eq(XuiInstance::getTrafficToken, token)
                .last("LIMIT 1"));
        if (instance == null) {
            return R.err("无效的 x-ui 上报 token");
        }

        long now = System.currentTimeMillis();
        XuiTrafficDeltaEvent event = new XuiTrafficDeltaEvent();
        event.setInstanceId(instance.getId());
        event.setSourceToken(token);
        event.setRequestBody(StringUtils.hasText(requestBody) ? requestBody : "{}");
        event.setReceivedIp(trimToNull(remoteIp));
        event.setCreatedTime(now);
        event.setUpdatedTime(now);
        event.setStatus(0);
        xuiTrafficDeltaEventMapper.insert(event);

        instance.setLastTrafficPushAt(now);
        instance.setUpdatedTime(now);
        xuiInstanceMapper.updateById(instance);
        return R.ok();
    }

    @Override
    public void autoSyncEligibleInstances() {
        List<XuiInstance> instances = this.list(new LambdaQueryWrapper<XuiInstance>()
                .eq(XuiInstance::getSyncEnabled, FLAG_TRUE));
        long now = System.currentTimeMillis();

        for (XuiInstance instance : instances) {
            if (!shouldAutoSync(instance, now)) {
                continue;
            }
            try {
                performSync(instance, "auto");
            } catch (Exception e) {
                log.warn("[XuiSync] 自动同步实例 {} 失败: {}", instance.getName(), e.getMessage());
            }
        }
    }

    private boolean shouldAutoSync(XuiInstance instance, long now) {
        if (instance.getSyncIntervalMinutes() == null || instance.getSyncIntervalMinutes() <= 0) {
            return false;
        }
        Long lastSyncAt = instance.getLastSyncAt();
        if (lastSyncAt == null || lastSyncAt <= 0) {
            return true;
        }
        long intervalMs = instance.getSyncIntervalMinutes() * 60L * 1000L;
        return now - lastSyncAt >= intervalMs;
    }

    private XuiSyncResultDto performSync(XuiInstance instance, String trigger) throws Exception {
        if (!runningSyncInstanceIds.add(instance.getId())) {
            throw new IllegalStateException("该 x-ui 实例正在同步中，请稍后重试");
        }

        long startedAt = System.currentTimeMillis();
        try {
            XuiRemoteSnapshot remoteSnapshot = fetchRemoteSnapshot(instance);
            XuiSyncResultDto result = persistRemoteSnapshot(instance, remoteSnapshot, trigger, startedAt);
            long finishedAt = result.getFinishedAt() == null ? System.currentTimeMillis() : result.getFinishedAt();
            saveSyncLog(instance.getId(),
                    trigger,
                    true,
                    "同步完成",
                    result.getMessage(),
                    startedAt,
                    finishedAt);
            return result;
        } catch (Exception e) {
            long finishedAt = System.currentTimeMillis();
            String errorMessage = shortenError(e.getMessage());
            updateSyncState(instance, STATUS_FAILED, trigger, errorMessage, finishedAt);
            saveSyncLog(instance.getId(), trigger, false, "同步失败", errorMessage, startedAt, finishedAt);
            throw e;
        } finally {
            runningSyncInstanceIds.remove(instance.getId());
        }
    }

    private XuiRemoteSnapshot fetchRemoteSnapshot(XuiInstance instance) throws Exception {
        try (XuiRemoteSession session = openRemoteSession(instance)) {
            RemoteApiProbe apiProbe = resolveRemoteApiProfile(session);
            JSONArray inboundArray = ensureSuccessArray(apiProbe.getResponse(), "读取入站列表失败");

            Set<String> onlineEmails = Collections.emptySet();
            Map<String, Long> lastOnlineMap = Collections.emptyMap();

            if (StringUtils.hasText(apiProbe.getProfile().getOnlinesPath())) {
                try {
                    JSONObject onlineResponse = executeJson(session.getHttpClient(),
                            buildFormPost(session, apiProbe.getProfile().getOnlinesPath(), Collections.emptyMap()));
                    onlineEmails = ensureSuccessArray(onlineResponse, "读取在线客户端失败")
                            .toJavaList(String.class)
                            .stream()
                            .filter(StringUtils::hasText)
                            .map(this::normalizeEmail)
                            .collect(Collectors.toSet());
                } catch (Exception e) {
                    log.warn("[XuiSync] 读取在线客户端失败，将继续同步基础快照: {}", e.getMessage());
                }
            }

            if (StringUtils.hasText(apiProbe.getProfile().getLastOnlinePath())) {
                try {
                    JSONObject lastOnlineResponse = executeJson(session.getHttpClient(),
                            buildFormPost(session, apiProbe.getProfile().getLastOnlinePath(), Collections.emptyMap()));
                    JSONObject lastOnlineObject = ensureSuccessObject(lastOnlineResponse, "读取最后在线时间失败");
                    Map<String, Long> lastOnlineTemp = new HashMap<>();
                    for (String key : lastOnlineObject.keySet()) {
                        lastOnlineTemp.put(normalizeEmail(key), lastOnlineObject.getLongValue(key));
                    }
                    lastOnlineMap = lastOnlineTemp;
                } catch (Exception e) {
                    log.warn("[XuiSync] 读取最后在线时间失败，将继续同步基础快照: {}", e.getMessage());
                }
            }

            XuiRemoteSnapshot remoteSnapshot = new XuiRemoteSnapshot();
            remoteSnapshot.setInbounds(inboundArray.toList(JSONObject.class));
            remoteSnapshot.setOnlineEmails(onlineEmails);
            remoteSnapshot.setLastOnlineMap(lastOnlineMap);
            remoteSnapshot.setRemoteClientCount(countRemoteClients(remoteSnapshot.getInbounds()));
            remoteSnapshot.setApiFlavor(apiProbe.getProfile().getFlavor());
            remoteSnapshot.setResolvedBasePath(session.getResolvedBasePath());
            return remoteSnapshot;
        }
    }

    private XuiRemoteSession openRemoteSession(XuiInstance instance) throws Exception {
        BasicCookieStore cookieStore = new BasicCookieStore();
        RequestConfig requestConfig = RequestConfig.custom()
                .setConnectTimeout(10_000)
                .setConnectionRequestTimeout(10_000)
                .setSocketTimeout(10_000)
                .build();

        CloseableHttpClient httpClient = buildHttpClient(instance, cookieStore, requestConfig);
        ResolvedRemoteBootstrap bootstrap = resolveRemoteBootstrap(instance, httpClient);

        Boolean remoteTwoFactorEnabled = probeFlagEndpoint(httpClient,
                buildFormPost(instance.getBaseUrl(), bootstrap.getResolvedBasePath(), "/getTwoFactorEnable", Collections.emptyMap()));
        if (Boolean.TRUE.equals(remoteTwoFactorEnabled)) {
            httpClient.close();
            throw new IllegalStateException("远端 x-ui 登录启用了 2FA，请为 Flux 使用未启用 2FA 的专用同步账号");
        }

        Boolean remoteSecretRequired = probeFlagEndpoint(httpClient,
                buildFormPost(instance.getBaseUrl(), bootstrap.getResolvedBasePath(), "/getSecretStatus", Collections.emptyMap()));
        if (Boolean.TRUE.equals(remoteSecretRequired) && !StringUtils.hasText(instance.getEncryptedLoginSecret())) {
            httpClient.close();
            throw new IllegalStateException("远端 x-ui 启用了 Secret Token，请在 Flux 中补充 Secret Token 后再测试连接");
        }

        HttpPost loginRequest = buildFormPost(instance.getBaseUrl(), bootstrap.getResolvedBasePath(), "/login", buildLoginPayload(instance));
        JSONObject loginResponse = executeJson(httpClient, loginRequest);
        boolean success = Boolean.TRUE.equals(loginResponse.getBoolean("success"));
        if (!success) {
            httpClient.close();
            throw new IllegalStateException(extractRemoteError(loginResponse, "登录 x-ui 失败"));
        }
        verifyRemoteSession(httpClient, instance.getBaseUrl(), bootstrap.getResolvedBasePath());
        return new XuiRemoteSession(httpClient,
                instance.getBaseUrl(),
                bootstrap.getResolvedBasePath(),
                bootstrap.getSecretStatusSupported(),
                bootstrap.getTwoFactorSupported());
    }

    private CloseableHttpClient buildHttpClient(XuiInstance instance,
                                                BasicCookieStore cookieStore,
                                                RequestConfig requestConfig) throws Exception {
        if (normalizeFlag(instance.getAllowInsecureTls()) == FLAG_TRUE) {
            TrustStrategy trustStrategy = (chain, authType) -> true;
            SSLContext sslContext = SSLContexts.custom().loadTrustMaterial(null, trustStrategy).build();
            return HttpClients.custom()
                    .setDefaultCookieStore(cookieStore)
                    .setDefaultRequestConfig(requestConfig)
                    .setSSLContext(sslContext)
                    .setSSLHostnameVerifier(NoopHostnameVerifier.INSTANCE)
                    .build();
        }
        return HttpClients.custom()
                .setDefaultCookieStore(cookieStore)
                .setDefaultRequestConfig(requestConfig)
                .build();
    }

    private Map<String, String> buildLoginPayload(XuiInstance instance) {
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("username", instance.getUsername());
        payload.put("password", xuiCredentialCryptoService.decrypt(instance.getEncryptedPassword()));
        if (StringUtils.hasText(instance.getEncryptedLoginSecret())) {
            payload.put("loginSecret", xuiCredentialCryptoService.decrypt(instance.getEncryptedLoginSecret()));
        }
        return payload;
    }

    @Transactional(rollbackFor = Exception.class)
    protected XuiSyncResultDto persistRemoteSnapshot(XuiInstance instance,
                                                     XuiRemoteSnapshot remoteSnapshot,
                                                     String trigger,
                                                     long startedAt) {
        long now = System.currentTimeMillis();
        XuiSyncResultDto result = new XuiSyncResultDto();
        result.setInstanceId(instance.getId());
        result.setInstanceName(instance.getName());
        result.setTrigger(trigger);
        result.setRemoteInboundCount(remoteSnapshot.getInbounds().size());
        result.setRemoteClientCount(remoteSnapshot.getRemoteClientCount());
        result.setApiFlavor(remoteSnapshot.getApiFlavor());
        result.setResolvedBasePath(remoteSnapshot.getResolvedBasePath());

        Map<Integer, XuiInboundSnapshot> localInboundMap = xuiInboundSnapshotMapper.selectList(
                        new LambdaQueryWrapper<XuiInboundSnapshot>().eq(XuiInboundSnapshot::getInstanceId, instance.getId()))
                .stream()
                .collect(Collectors.toMap(XuiInboundSnapshot::getRemoteInboundId, inbound -> inbound, (a, b) -> a));

        Map<String, XuiClientSnapshot> localClientMap = xuiClientSnapshotMapper.selectList(
                        new LambdaQueryWrapper<XuiClientSnapshot>().eq(XuiClientSnapshot::getInstanceId, instance.getId()))
                .stream()
                .collect(Collectors.toMap(XuiClientSnapshot::getRemoteClientKey, client -> client, (a, b) -> a));

        Set<Integer> activeInboundIds = new HashSet<>();
        Set<String> activeClientKeys = new HashSet<>();

        for (JSONObject inboundObject : remoteSnapshot.getInbounds()) {
            int remoteInboundId = inboundObject.getIntValue("id");
            activeInboundIds.add(remoteInboundId);

            Map<String, JSONObject> clientConfigMap = extractClientConfigMap(inboundObject.getString("settings"));
            JSONArray clientStats = inboundObject.getJSONArray("clientStats");

            XuiInboundSnapshot incomingInbound = buildInboundSnapshot(instance.getId(), inboundObject, clientStats, remoteSnapshot.getOnlineEmails(), now);
            XuiInboundSnapshot existingInbound = localInboundMap.get(remoteInboundId);

            if (existingInbound == null) {
                xuiInboundSnapshotMapper.insert(incomingInbound);
                result.setCreatedInboundCount(safeIncrement(result.getCreatedInboundCount()));
            } else if (hasInboundChanged(existingInbound, incomingInbound)) {
                incomingInbound.setId(existingInbound.getId());
                incomingInbound.setCreatedTime(existingInbound.getCreatedTime());
                xuiInboundSnapshotMapper.updateById(incomingInbound);
                result.setUpdatedInboundCount(safeIncrement(result.getUpdatedInboundCount()));
            }

            if (clientStats == null) {
                continue;
            }

            for (int i = 0; i < clientStats.size(); i++) {
                JSONObject clientStat = clientStats.getJSONObject(i);
                JSONObject clientConfig = clientConfigMap.get(normalizeEmail(clientStat.getString("email")));
                XuiClientSnapshot incomingClient = buildClientSnapshot(instance.getId(),
                        remoteInboundId,
                        clientStat,
                        clientConfig,
                        remoteSnapshot.getOnlineEmails(),
                        remoteSnapshot.getLastOnlineMap(),
                        now);

                activeClientKeys.add(incomingClient.getRemoteClientKey());
                XuiClientSnapshot existingClient = localClientMap.get(incomingClient.getRemoteClientKey());

                if (existingClient == null) {
                    xuiClientSnapshotMapper.insert(incomingClient);
                    result.setCreatedClientCount(safeIncrement(result.getCreatedClientCount()));
                } else if (hasClientChanged(existingClient, incomingClient)) {
                    incomingClient.setId(existingClient.getId());
                    incomingClient.setCreatedTime(existingClient.getCreatedTime());
                    xuiClientSnapshotMapper.updateById(incomingClient);
                    result.setUpdatedClientCount(safeIncrement(result.getUpdatedClientCount()));
                }
            }
        }

        for (XuiInboundSnapshot localInbound : localInboundMap.values()) {
            if (activeInboundIds.contains(localInbound.getRemoteInboundId())) {
                continue;
            }
            if (!Objects.equals(localInbound.getStatus(), 1)) {
                localInbound.setStatus(1);
                localInbound.setLastSyncAt(now);
                localInbound.setUpdatedTime(now);
                xuiInboundSnapshotMapper.updateById(localInbound);
                result.setDeletedInboundCount(safeIncrement(result.getDeletedInboundCount()));
            }
        }

        for (XuiClientSnapshot localClient : localClientMap.values()) {
            if (activeClientKeys.contains(localClient.getRemoteClientKey())) {
                continue;
            }
            if (!Objects.equals(localClient.getStatus(), 1)) {
                localClient.setStatus(1);
                localClient.setOnline(FLAG_FALSE);
                localClient.setLastSyncAt(now);
                localClient.setUpdatedTime(now);
                xuiClientSnapshotMapper.updateById(localClient);
                result.setDeletedClientCount(safeIncrement(result.getDeletedClientCount()));
            }
        }

        updateSyncState(instance, STATUS_SUCCESS, trigger, null, now);

        result.setFinishedAt(now);
        result.setMessage(String.format("同步到 %d 个入站、%d 个客户端，新增 %d/%d，更新 %d/%d，移除 %d/%d",
                result.getRemoteInboundCount(),
                result.getRemoteClientCount(),
                defaultZero(result.getCreatedInboundCount()),
                defaultZero(result.getCreatedClientCount()),
                defaultZero(result.getUpdatedInboundCount()),
                defaultZero(result.getUpdatedClientCount()),
                defaultZero(result.getDeletedInboundCount()),
                defaultZero(result.getDeletedClientCount())));
        return result;
    }

    private XuiInboundSnapshot buildInboundSnapshot(Long instanceId,
                                                    JSONObject inboundObject,
                                                    JSONArray clientStats,
                                                    Set<String> onlineEmails,
                                                    long now) {
        XuiInboundSnapshot snapshot = new XuiInboundSnapshot();
        snapshot.setInstanceId(instanceId);
        snapshot.setRemoteInboundId(inboundObject.getIntValue("id"));
        snapshot.setRemark(trimToNull(inboundObject.getString("remark")));
        snapshot.setTag(trimToNull(inboundObject.getString("tag")));
        snapshot.setProtocol(trimToNull(inboundObject.getString("protocol")));
        snapshot.setListen(trimToNull(inboundObject.getString("listen")));
        snapshot.setPort(inboundObject.getInteger("port"));
        snapshot.setEnable(booleanToFlag(inboundObject.getBoolean("enable")));
        snapshot.setExpiryTime(inboundObject.getLong("expiryTime"));
        snapshot.setTotal(inboundObject.getLong("total"));
        snapshot.setUp(inboundObject.getLong("up"));
        snapshot.setDown(inboundObject.getLong("down"));
        snapshot.setAllTime(inboundObject.getLong("allTime"));
        snapshot.setClientCount(clientStats == null ? 0 : clientStats.size());
        snapshot.setOnlineClientCount(countOnlineClients(clientStats, onlineEmails));
        snapshot.setTransportSummary(extractTransportSummary(inboundObject.getString("streamSettings")));
        snapshot.setSettingsDigest(sha256Hex(inboundObject.getString("settings")));
        snapshot.setStreamSettingsDigest(sha256Hex(inboundObject.getString("streamSettings")));
        snapshot.setSniffingDigest(sha256Hex(inboundObject.getString("sniffing")));
        snapshot.setLastSyncAt(now);
        snapshot.setCreatedTime(now);
        snapshot.setUpdatedTime(now);
        snapshot.setStatus(0);
        return snapshot;
    }

    private XuiClientSnapshot buildClientSnapshot(Long instanceId,
                                                  Integer remoteInboundId,
                                                  JSONObject clientStat,
                                                  JSONObject clientConfig,
                                                  Set<String> onlineEmails,
                                                  Map<String, Long> lastOnlineMap,
                                                  long now) {
        String email = normalizeEmail(clientStat.getString("email"));
        String remoteClientKey = buildRemoteClientKey(clientStat, clientConfig, email);

        XuiClientSnapshot snapshot = new XuiClientSnapshot();
        snapshot.setInstanceId(instanceId);
        snapshot.setRemoteInboundId(remoteInboundId);
        snapshot.setRemoteClientId(clientStat.getInteger("id"));
        snapshot.setRemoteClientKey(remoteClientKey);
        snapshot.setEmail(trimToNull(email));
        snapshot.setEnable(booleanToFlag(clientStat.getBoolean("enable")));
        snapshot.setExpiryTime(clientStat.getLong("expiryTime"));
        snapshot.setTotal(clientStat.getLong("total"));
        snapshot.setUp(clientStat.getLong("up"));
        snapshot.setDown(clientStat.getLong("down"));
        snapshot.setAllTime(clientStat.getLong("allTime"));
        snapshot.setOnline(onlineEmails.contains(email) ? FLAG_TRUE : FLAG_FALSE);
        snapshot.setLastOnlineAt(resolveLastOnline(email, clientStat.getLong("lastOnline"), lastOnlineMap));
        snapshot.setComment(clientConfig == null ? null : trimToNull(clientConfig.getString("comment")));
        snapshot.setSubId(clientConfig == null ? null : trimToNull(clientConfig.getString("subId")));
        snapshot.setLimitIp(clientConfig == null ? null : clientConfig.getInteger("limitIp"));
        snapshot.setResetDays(clientConfig == null ? null : clientConfig.getInteger("reset"));
        snapshot.setLastSyncAt(now);
        snapshot.setCreatedTime(now);
        snapshot.setUpdatedTime(now);
        snapshot.setStatus(0);
        return snapshot;
    }

    private Map<String, JSONObject> extractClientConfigMap(String settings) {
        Map<String, JSONObject> configMap = new HashMap<>();
        if (!StringUtils.hasText(settings)) {
            return configMap;
        }
        try {
            JSONObject settingsObject = JSON.parseObject(settings);
            if (settingsObject == null) {
                return configMap;
            }
            JSONArray clients = settingsObject.getJSONArray("clients");
            if (clients == null) {
                return configMap;
            }
            for (int i = 0; i < clients.size(); i++) {
                JSONObject client = clients.getJSONObject(i);
                String email = normalizeEmail(client.getString("email"));
                if (StringUtils.hasText(email)) {
                    configMap.put(email, client);
                }
            }
        } catch (Exception ignored) {
            log.warn("[XuiSync] 解析 client settings 失败，跳过扩展字段");
        }
        return configMap;
    }

    private int countOnlineClients(JSONArray clientStats, Set<String> onlineEmails) {
        if (clientStats == null || clientStats.isEmpty() || onlineEmails == null || onlineEmails.isEmpty()) {
            return 0;
        }
        int count = 0;
        for (int i = 0; i < clientStats.size(); i++) {
            String email = normalizeEmail(clientStats.getJSONObject(i).getString("email"));
            if (onlineEmails.contains(email)) {
                count++;
            }
        }
        return count;
    }

    private int countRemoteClients(List<JSONObject> inbounds) {
        int count = 0;
        for (JSONObject inbound : inbounds) {
            JSONArray clientStats = inbound.getJSONArray("clientStats");
            count += clientStats == null ? 0 : clientStats.size();
        }
        return count;
    }

    private boolean hasInboundChanged(XuiInboundSnapshot existing, XuiInboundSnapshot incoming) {
        return !Objects.equals(existing.getRemark(), incoming.getRemark())
                || !Objects.equals(existing.getTag(), incoming.getTag())
                || !Objects.equals(existing.getProtocol(), incoming.getProtocol())
                || !Objects.equals(existing.getListen(), incoming.getListen())
                || !Objects.equals(existing.getPort(), incoming.getPort())
                || !Objects.equals(existing.getEnable(), incoming.getEnable())
                || !Objects.equals(existing.getExpiryTime(), incoming.getExpiryTime())
                || !Objects.equals(existing.getTotal(), incoming.getTotal())
                || !Objects.equals(existing.getUp(), incoming.getUp())
                || !Objects.equals(existing.getDown(), incoming.getDown())
                || !Objects.equals(existing.getAllTime(), incoming.getAllTime())
                || !Objects.equals(existing.getClientCount(), incoming.getClientCount())
                || !Objects.equals(existing.getOnlineClientCount(), incoming.getOnlineClientCount())
                || !Objects.equals(existing.getTransportSummary(), incoming.getTransportSummary())
                || !Objects.equals(existing.getSettingsDigest(), incoming.getSettingsDigest())
                || !Objects.equals(existing.getStreamSettingsDigest(), incoming.getStreamSettingsDigest())
                || !Objects.equals(existing.getSniffingDigest(), incoming.getSniffingDigest())
                || !Objects.equals(existing.getStatus(), incoming.getStatus());
    }

    private boolean hasClientChanged(XuiClientSnapshot existing, XuiClientSnapshot incoming) {
        return !Objects.equals(existing.getRemoteInboundId(), incoming.getRemoteInboundId())
                || !Objects.equals(existing.getRemoteClientId(), incoming.getRemoteClientId())
                || !Objects.equals(existing.getEmail(), incoming.getEmail())
                || !Objects.equals(existing.getEnable(), incoming.getEnable())
                || !Objects.equals(existing.getExpiryTime(), incoming.getExpiryTime())
                || !Objects.equals(existing.getTotal(), incoming.getTotal())
                || !Objects.equals(existing.getUp(), incoming.getUp())
                || !Objects.equals(existing.getDown(), incoming.getDown())
                || !Objects.equals(existing.getAllTime(), incoming.getAllTime())
                || !Objects.equals(existing.getOnline(), incoming.getOnline())
                || !Objects.equals(existing.getLastOnlineAt(), incoming.getLastOnlineAt())
                || !Objects.equals(existing.getComment(), incoming.getComment())
                || !Objects.equals(existing.getSubId(), incoming.getSubId())
                || !Objects.equals(existing.getLimitIp(), incoming.getLimitIp())
                || !Objects.equals(existing.getResetDays(), incoming.getResetDays())
                || !Objects.equals(existing.getStatus(), incoming.getStatus());
    }

    private void updateSyncState(XuiInstance instance, String status, String trigger, String errorMessage, long timestamp) {
        instance.setLastSyncAt(timestamp);
        instance.setLastSyncStatus(status);
        instance.setLastSyncTrigger(trigger);
        instance.setLastSyncError(trimToNull(errorMessage));
        instance.setUpdatedTime(timestamp);
        xuiInstanceMapper.updateById(instance);
    }

    private void updateTestState(XuiInstance instance, String status, String errorMessage, long timestamp) {
        instance.setLastTestAt(timestamp);
        instance.setLastTestStatus(status);
        instance.setLastTestError(trimToNull(errorMessage));
        instance.setUpdatedTime(timestamp);
        xuiInstanceMapper.updateById(instance);
    }

    private void saveSyncLog(Long instanceId,
                             String syncType,
                             boolean success,
                             String message,
                             String detail,
                             long startedAt,
                             long finishedAt) {
        XuiSyncLog logRecord = new XuiSyncLog();
        logRecord.setInstanceId(instanceId);
        logRecord.setSyncType(syncType);
        logRecord.setSuccess(success ? FLAG_TRUE : FLAG_FALSE);
        logRecord.setMessage(trimToNull(message));
        logRecord.setDetailText(trimToNull(detail));
        logRecord.setStartedAt(startedAt);
        logRecord.setFinishedAt(finishedAt);
        logRecord.setDurationMs(Math.max(0, finishedAt - startedAt));
        logRecord.setCreatedTime(finishedAt);
        logRecord.setUpdatedTime(finishedAt);
        logRecord.setStatus(0);
        xuiSyncLogMapper.insert(logRecord);
    }

    private ResolvedRemoteBootstrap resolveRemoteBootstrap(XuiInstance instance, CloseableHttpClient httpClient) throws Exception {
        String configuredBasePath = normalizeBasePath(instance.getWebBasePath());
        RemoteHttpResponse response = executeRequest(httpClient, new HttpGet(buildRemoteUrl(instance.getBaseUrl(), configuredBasePath, "")));
        if (response.getStatusCode() >= 400) {
            throw new IllegalStateException("无法访问远端 x-ui 登录页: HTTP " + response.getStatusCode());
        }
        String resolvedBasePath = normalizeBasePath(extractBasePathFromHtml(response.getBody()));
        if (!StringUtils.hasText(resolvedBasePath) || "/".equals(resolvedBasePath)) {
            resolvedBasePath = configuredBasePath;
        }

        ResolvedRemoteBootstrap bootstrap = new ResolvedRemoteBootstrap();
        bootstrap.setResolvedBasePath(resolvedBasePath);
        bootstrap.setSecretStatusSupported(response.getBody() != null && response.getBody().contains("getSecretStatus"));
        bootstrap.setTwoFactorSupported(response.getBody() != null && response.getBody().contains("getTwoFactorEnable"));
        return bootstrap;
    }

    private String extractBasePathFromHtml(String html) {
        if (!StringUtils.hasText(html)) {
            return null;
        }
        Matcher matcher = BASE_PATH_PATTERN.matcher(html);
        if (!matcher.find()) {
            return null;
        }
        String raw = matcher.group(1);
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        return raw.replace("\\/", "/");
    }

    private Boolean probeFlagEndpoint(CloseableHttpClient httpClient, HttpPost request) {
        try {
            RemoteJsonProbe probe = executeJsonProbe(httpClient, request);
            if (!probe.isSuccess()) {
                return null;
            }
            JSONObject json = probe.getJson();
            if (!Boolean.TRUE.equals(json.getBoolean("success"))) {
                return null;
            }
            return json.getBoolean("obj");
        } catch (Exception e) {
            return null;
        }
    }

    private RemoteApiProbe resolveRemoteApiProfile(XuiRemoteSession session) throws Exception {
        List<RemoteApiProfile> candidateProfiles = new ArrayList<>();
        if (session.getSecretStatusSupported() && !session.getTwoFactorSupported()) {
            candidateProfiles.add(new RemoteApiProfile(API_FLAVOR_PANEL_API, "/panel/api/inbounds/", "/panel/api/inbounds/onlines", "/panel/api/inbounds/lastOnline"));
            candidateProfiles.add(new RemoteApiProfile(API_FLAVOR_XUI_API, "/xui/API/inbounds/", "/xui/API/inbounds/onlines", null));
            candidateProfiles.add(new RemoteApiProfile(API_FLAVOR_3XUI, "/panel/api/inbounds/list", "/panel/api/inbounds/onlines", "/panel/api/inbounds/lastOnline"));
        } else {
            candidateProfiles.add(new RemoteApiProfile(API_FLAVOR_3XUI, "/panel/api/inbounds/list", "/panel/api/inbounds/onlines", "/panel/api/inbounds/lastOnline"));
            candidateProfiles.add(new RemoteApiProfile(API_FLAVOR_PANEL_API, "/panel/api/inbounds/", "/panel/api/inbounds/onlines", "/panel/api/inbounds/lastOnline"));
            candidateProfiles.add(new RemoteApiProfile(API_FLAVOR_XUI_API, "/xui/API/inbounds/", "/xui/API/inbounds/onlines", null));
        }

        List<String> failures = new ArrayList<>();
        Set<String> deduplicatedPaths = new LinkedHashSet<>();
        for (RemoteApiProfile profile : candidateProfiles) {
            if (!deduplicatedPaths.add(profile.getListPath())) {
                continue;
            }
            RemoteJsonProbe probe = executeJsonProbe(session.getHttpClient(), buildGet(session, profile.getListPath()));
            if (probe.isSuccess() && Boolean.TRUE.equals(probe.getJson().getBoolean("success"))) {
                return new RemoteApiProbe(profile, probe.getJson());
            }
            failures.add(profile.getFlavor() + " -> " + probe.getErrorMessage());
        }

        throw new IllegalStateException("无法识别远端 x-ui API 风格，已尝试: " + String.join("；", failures));
    }

    private JSONObject executeJson(CloseableHttpClient httpClient, HttpUriRequest request) throws Exception {
        RemoteJsonProbe probe = executeJsonProbe(httpClient, request);
        if (!probe.isSuccess()) {
            throw new IllegalStateException(probe.getErrorMessage());
        }
        return probe.getJson();
    }

    private RemoteJsonProbe executeJsonProbe(CloseableHttpClient httpClient, HttpUriRequest request) throws Exception {
        applyAjaxHeaders(request);
        RemoteHttpResponse response = executeRequest(httpClient, request);
        if (response.getStatusCode() >= 400) {
            String hint = response.getStatusCode() == 404
                    ? "，新版 3x-ui 在未登录或会话失效时也可能返回 404，请同时检查用户名、密码、Secret Token、2FA 与反代会话"
                    : "";
            return RemoteJsonProbe.failure(response.getRequestUri(),
                    "远端接口 " + response.getRequestUri() + " 返回 HTTP " + response.getStatusCode() + hint);
        }
        if (!StringUtils.hasText(response.getBody())) {
            return RemoteJsonProbe.failure(response.getRequestUri(),
                    "远端接口 " + response.getRequestUri() + " 返回空响应");
        }
        if (looksLikeHtml(response)) {
            return RemoteJsonProbe.failure(response.getRequestUri(),
                    "远端接口 " + response.getRequestUri() + " 返回 HTML 登录页，说明当前会话未建立，或该实例需要不同兼容路径");
        }
        try {
            JSONObject json = JSON.parseObject(response.getBody());
            if (json == null) {
                return RemoteJsonProbe.failure(response.getRequestUri(),
                        "远端接口 " + response.getRequestUri() + " 返回了无法识别的 JSON 响应");
            }
            return RemoteJsonProbe.success(response.getRequestUri(), json);
        } catch (Exception e) {
            return RemoteJsonProbe.failure(response.getRequestUri(),
                    "远端接口 " + response.getRequestUri() + " 返回非 JSON 内容: " + shortenError(response.getBody()));
        }
    }

    private RemoteHttpResponse executeRequest(CloseableHttpClient httpClient, HttpUriRequest request) throws Exception {
        try (CloseableHttpResponse response = httpClient.execute(request)) {
            String body = response.getEntity() == null ? "" : EntityUtils.toString(response.getEntity(), StandardCharsets.UTF_8);
            String contentType = response.getEntity() == null || response.getEntity().getContentType() == null
                    ? ""
                    : response.getEntity().getContentType().getValue();
            return new RemoteHttpResponse(
                    request.getURI().toString(),
                    response.getStatusLine().getStatusCode(),
                    contentType,
                    body
            );
        }
    }

    private boolean looksLikeHtml(RemoteHttpResponse response) {
        String body = response.getBody() == null ? "" : response.getBody().trim().toLowerCase(Locale.ROOT);
        String contentType = response.getContentType() == null ? "" : response.getContentType().toLowerCase(Locale.ROOT);
        return contentType.contains("text/html")
                || body.startsWith("<!doctype html")
                || body.startsWith("<html");
    }

    private boolean looksLikeLoginPage(RemoteHttpResponse response) {
        if (!looksLikeHtml(response)) {
            return false;
        }
        String body = response.getBody() == null ? "" : response.getBody().toLowerCase(Locale.ROOT);
        return (body.contains("id=\"login\"") || body.contains("id='login'"))
                && body.contains("/login")
                && (body.contains("placeholder='username'")
                || body.contains("placeholder=\"username\"")
                || body.contains("getsecretstatus")
                || body.contains("gettwofactorenable"));
    }

    private JSONArray ensureSuccessArray(JSONObject response, String defaultMessage) {
        boolean success = Boolean.TRUE.equals(response.getBoolean("success"));
        if (!success) {
            throw new IllegalStateException(extractRemoteError(response, defaultMessage));
        }
        JSONArray array = response.getJSONArray("obj");
        return array == null ? new JSONArray() : array;
    }

    private JSONObject ensureSuccessObject(JSONObject response, String defaultMessage) {
        boolean success = Boolean.TRUE.equals(response.getBoolean("success"));
        if (!success) {
            throw new IllegalStateException(extractRemoteError(response, defaultMessage));
        }
        JSONObject object = response.getJSONObject("obj");
        return object == null ? new JSONObject() : object;
    }

    private HttpGet buildGet(XuiInstance instance, String path) {
        return buildGet(instance.getBaseUrl(), instance.getWebBasePath(), path);
    }

    private HttpGet buildGet(XuiRemoteSession session, String path) {
        return buildGet(session.getBaseUrl(), session.getResolvedBasePath(), path);
    }

    private HttpGet buildGet(String baseUrl, String basePath, String path) {
        HttpGet request = new HttpGet(buildRemoteUrl(baseUrl, basePath, path));
        applyAjaxHeaders(request);
        return request;
    }

    private HttpPost buildFormPost(XuiInstance instance, String path, Map<String, String> formData) {
        return buildFormPost(instance.getBaseUrl(), instance.getWebBasePath(), path, formData);
    }

    private HttpPost buildFormPost(XuiRemoteSession session, String path, Map<String, String> formData) {
        return buildFormPost(session.getBaseUrl(), session.getResolvedBasePath(), path, formData);
    }

    private HttpPost buildFormPost(String baseUrl, String basePath, String path, Map<String, String> formData) {
        HttpPost post = new HttpPost(buildRemoteUrl(baseUrl, basePath, path));
        applyAjaxHeaders(post);
        List<NameValuePair> parameters = new ArrayList<>();
        if (formData != null) {
            for (Map.Entry<String, String> entry : formData.entrySet()) {
                if (entry.getValue() == null) {
                    continue;
                }
                parameters.add(new BasicNameValuePair(entry.getKey(), entry.getValue()));
            }
        }
        post.setEntity(new UrlEncodedFormEntity(parameters, StandardCharsets.UTF_8));
        return post;
    }

    private void applyAjaxHeaders(HttpUriRequest request) {
        request.setHeader(HttpHeaders.ACCEPT, AJAX_ACCEPT);
        request.setHeader(AJAX_HEADER, AJAX_HEADER_VALUE);
    }

    private String buildRemoteUrl(XuiInstance instance, String path) {
        return buildRemoteUrl(instance.getBaseUrl(), instance.getWebBasePath(), path);
    }

    private String buildRemoteUrl(String baseUrl, String webBasePath, String path) {
        String basePath = normalizeBasePath(webBasePath);
        String normalizedPath = StringUtils.hasText(path)
                ? (path.startsWith("/") ? path : "/" + path)
                : "";
        if (!StringUtils.hasText(normalizedPath)) {
            return "/".equals(basePath) ? baseUrl + "/" : baseUrl + basePath;
        }
        if ("/".equals(basePath)) {
            return baseUrl + normalizedPath;
        }
        return baseUrl + basePath.substring(0, basePath.length() - 1) + normalizedPath;
    }

    private XuiInstanceViewDto toInstanceView(XuiInstance instance) {
        XuiInstanceViewDto dto = new XuiInstanceViewDto();
        BeanUtils.copyProperties(instance, dto);
        dto.setPasswordConfigured(StringUtils.hasText(instance.getEncryptedPassword()));
        dto.setLoginSecretConfigured(StringUtils.hasText(instance.getEncryptedLoginSecret()));
        dto.setTrafficCallbackPath("/api/v1/xui/traffic/" + instance.getTrafficToken());
        Integer inboundCount = xuiInboundSnapshotMapper.selectCount(new LambdaQueryWrapper<XuiInboundSnapshot>()
                .eq(XuiInboundSnapshot::getInstanceId, instance.getId())
                .eq(XuiInboundSnapshot::getStatus, 0));
        Integer clientCount = xuiClientSnapshotMapper.selectCount(new LambdaQueryWrapper<XuiClientSnapshot>()
                .eq(XuiClientSnapshot::getInstanceId, instance.getId())
                .eq(XuiClientSnapshot::getStatus, 0));
        dto.setInboundCount(inboundCount == null ? 0L : inboundCount.longValue());
        dto.setClientCount(clientCount == null ? 0L : clientCount.longValue());
        return dto;
    }

    private List<XuiInboundSnapshotViewDto> loadInboundViews(Long instanceId) {
        return xuiInboundSnapshotMapper.selectList(new LambdaQueryWrapper<XuiInboundSnapshot>()
                        .eq(XuiInboundSnapshot::getInstanceId, instanceId)
                        .orderByAsc(XuiInboundSnapshot::getStatus)
                        .orderByAsc(XuiInboundSnapshot::getRemark, XuiInboundSnapshot::getTag, XuiInboundSnapshot::getRemoteInboundId))
                .stream()
                .map(item -> {
                    XuiInboundSnapshotViewDto dto = new XuiInboundSnapshotViewDto();
                    BeanUtils.copyProperties(item, dto);
                    return dto;
                })
                .collect(Collectors.toList());
    }

    private List<XuiClientSnapshotViewDto> loadClientViews(Long instanceId) {
        return xuiClientSnapshotMapper.selectList(new LambdaQueryWrapper<XuiClientSnapshot>()
                        .eq(XuiClientSnapshot::getInstanceId, instanceId)
                        .orderByAsc(XuiClientSnapshot::getStatus)
                        .orderByDesc(XuiClientSnapshot::getOnline)
                        .orderByAsc(XuiClientSnapshot::getEmail))
                .stream()
                .map(item -> {
                    XuiClientSnapshotViewDto dto = new XuiClientSnapshotViewDto();
                    BeanUtils.copyProperties(item, dto);
                    return dto;
                })
                .collect(Collectors.toList());
    }

    private XuiInstance getRequiredInstance(Long id) {
        XuiInstance instance = this.getById(id);
        if (instance == null) {
            throw new IllegalStateException("x-ui 实例不存在");
        }
        return instance;
    }

    private String checkDuplicateName(String name, Long ignoreId) {
        if (!StringUtils.hasText(name)) {
            return "实例名称不能为空";
        }
        LambdaQueryWrapper<XuiInstance> queryWrapper = new LambdaQueryWrapper<XuiInstance>()
                .eq(XuiInstance::getName, name.trim());
        if (ignoreId != null) {
            queryWrapper.ne(XuiInstance::getId, ignoreId);
        }
        long count = xuiInstanceMapper.selectCount(queryWrapper);
        return count > 0 ? "已存在同名的 x-ui 实例" : null;
    }

    private NormalizedInstanceEndpoint normalizeEndpointInput(String baseUrlInput, String webBasePathInput) {
        if (!StringUtils.hasText(baseUrlInput)) {
            throw new IllegalStateException("实例地址不能为空");
        }
        try {
            URI uri = new URI(baseUrlInput.trim());
            String scheme = uri.getScheme();
            if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
                throw new IllegalStateException("实例地址只支持 http 或 https");
            }
            if (!StringUtils.hasText(uri.getHost()) && !StringUtils.hasText(uri.getRawAuthority())) {
                throw new IllegalStateException("实例地址缺少主机名");
            }
            String authority = StringUtils.hasText(uri.getRawAuthority()) ? uri.getRawAuthority() : uri.getHost();
            String normalizedBaseUrl = scheme.toLowerCase(Locale.ROOT) + "://" + authority;
            String pathFromBaseUrl = normalizeBasePath(uri.getPath());
            String pathFromField = normalizeBasePath(webBasePathInput);
            String normalizedBasePath = !"/".equals(pathFromBaseUrl) ? pathFromBaseUrl : pathFromField;
            return new NormalizedInstanceEndpoint(normalizedBaseUrl, normalizedBasePath);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("实例地址格式不正确");
        }
    }

    private String normalizeBasePath(String webBasePath) {
        if (!StringUtils.hasText(webBasePath)) {
            return "/";
        }
        String value = webBasePath.trim();
        if (value.startsWith("http://") || value.startsWith("https://")) {
            try {
                value = new URI(value).getPath();
            } catch (Exception ignored) {
                value = "/";
            }
        }
        if (!StringUtils.hasText(value)) {
            return "/";
        }
        value = value.replaceAll("/{2,}", "/");
        if (!value.startsWith("/")) {
            value = "/" + value;
        }
        if ("/panel".equalsIgnoreCase(value) || "/panel/".equalsIgnoreCase(value)) {
            return "/";
        }
        if (value.endsWith("/panel")) {
            value = value.substring(0, value.length() - "/panel".length());
        } else if (value.endsWith("/panel/")) {
            value = value.substring(0, value.length() - "/panel/".length());
        }
        if ("/login".equalsIgnoreCase(value) || "/login/".equalsIgnoreCase(value)) {
            return "/";
        }
        if (value.endsWith("/login")) {
            value = value.substring(0, value.length() - "/login".length());
        } else if (value.endsWith("/login/")) {
            value = value.substring(0, value.length() - "/login/".length());
        }
        if (!StringUtils.hasText(value)) {
            return "/";
        }
        if (!value.endsWith("/")) {
            value = value + "/";
        }
        return value.replaceAll("/{2,}", "/");
    }

    private String encryptOptionalSecret(String loginSecret) {
        if (loginSecret == null) {
            return null;
        }
        if (!StringUtils.hasText(loginSecret)) {
            return null;
        }
        return xuiCredentialCryptoService.encrypt(loginSecret);
    }

    private String normalizeManagementMode(String mode) {
        if (!StringUtils.hasText(mode)) {
            return MODE_OBSERVE;
        }
        String normalized = mode.trim().toLowerCase(Locale.ROOT);
        if (!MODE_OBSERVE.equals(normalized) && !MODE_FLUX_MANAGED.equals(normalized)) {
            throw new IllegalStateException("管理模式只支持 observe 或 flux_managed");
        }
        return normalized;
    }

    private Integer normalizeFlag(Integer value) {
        return value != null && value != 0 ? FLAG_TRUE : FLAG_FALSE;
    }

    private Integer booleanToFlag(Boolean value) {
        return Boolean.TRUE.equals(value) ? FLAG_TRUE : FLAG_FALSE;
    }

    private Long resolveLastOnline(String email, Long clientLastOnline, Map<String, Long> lastOnlineMap) {
        if (lastOnlineMap != null && lastOnlineMap.containsKey(email)) {
            return lastOnlineMap.get(email);
        }
        return clientLastOnline;
    }

    private String extractTransportSummary(String streamSettingsJson) {
        if (!StringUtils.hasText(streamSettingsJson)) {
            return "-";
        }
        try {
            JSONObject stream = JSON.parseObject(streamSettingsJson);
            if (stream == null) {
                return "-";
            }
            String network = trimToNull(stream.getString("network"));
            String security = trimToNull(stream.getString("security"));
            if (network == null && security == null) {
                return "-";
            }
            if (network == null) {
                return security;
            }
            if (security == null) {
                return network;
            }
            return network + " / " + security;
        } catch (Exception e) {
            return "configured";
        }
    }

    private String buildRemoteClientKey(JSONObject clientStat, JSONObject clientConfig, String email) {
        if (StringUtils.hasText(email)) {
            return email;
        }
        if (clientConfig != null && StringUtils.hasText(clientConfig.getString("subId"))) {
            return "sub:" + clientConfig.getString("subId").trim();
        }
        Integer remoteClientId = clientStat.getInteger("id");
        if (remoteClientId != null) {
            return "id:" + remoteClientId;
        }
        return "anonymous:" + sha256Hex(clientStat.toJSONString());
    }

    private String normalizeEmail(String email) {
        if (!StringUtils.hasText(email)) {
            return "";
        }
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private String shortenError(String message) {
        String safeMessage = trimToNull(message);
        if (safeMessage == null) {
            return "未知错误";
        }
        return safeMessage.length() > 300 ? safeMessage.substring(0, 300) : safeMessage;
    }

    private String extractRemoteError(JSONObject response, String defaultMessage) {
        String remoteMessage = trimToNull(response.getString("msg"));
        return remoteMessage != null ? remoteMessage : defaultMessage;
    }

    private void verifyRemoteSession(CloseableHttpClient httpClient, String baseUrl, String basePath) throws Exception {
        RemoteHttpResponse response = executeRequest(httpClient, buildGet(baseUrl, basePath, "/panel/"));
        if (response.getStatusCode() >= 400) {
            throw new IllegalStateException("登录后访问远端面板失败: HTTP " + response.getStatusCode());
        }
        if (looksLikeLoginPage(response)) {
            throw new IllegalStateException("远端仍返回登录页，说明登录会话未建立。请检查用户名、密码、Secret Token、2FA 或远端反代配置");
        }
    }

    private String sha256Hex(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                builder.append(String.format("%02x", b));
            }
            return builder.toString();
        } catch (Exception e) {
            throw new IllegalStateException("计算配置摘要失败");
        }
    }

    private Integer safeIncrement(Integer value) {
        return value == null ? 1 : value + 1;
    }

    private int defaultZero(Integer value) {
        return value == null ? 0 : value;
    }

    @Getter
    @Setter
    private static class XuiRemoteSnapshot {
        private List<JSONObject> inbounds = new ArrayList<>();
        private Set<String> onlineEmails = Collections.emptySet();
        private Map<String, Long> lastOnlineMap = Collections.emptyMap();
        private Integer remoteClientCount = 0;
        private String apiFlavor;
        private String resolvedBasePath;
    }

    @Getter
    private static class RemoteApiProfile {
        private final String flavor;
        private final String listPath;
        private final String onlinesPath;
        private final String lastOnlinePath;

        private RemoteApiProfile(String flavor, String listPath, String onlinesPath, String lastOnlinePath) {
            this.flavor = flavor;
            this.listPath = listPath;
            this.onlinesPath = onlinesPath;
            this.lastOnlinePath = lastOnlinePath;
        }
    }

    @Getter
    private static class RemoteApiProbe {
        private final RemoteApiProfile profile;
        private final JSONObject response;

        private RemoteApiProbe(RemoteApiProfile profile, JSONObject response) {
            this.profile = profile;
            this.response = response;
        }
    }

    @Getter
    @Setter
    private static class ResolvedRemoteBootstrap {
        private String resolvedBasePath;
        private Boolean secretStatusSupported = false;
        private Boolean twoFactorSupported = false;
    }

    @Getter
    private static class RemoteHttpResponse {
        private final String requestUri;
        private final int statusCode;
        private final String contentType;
        private final String body;

        private RemoteHttpResponse(String requestUri, int statusCode, String contentType, String body) {
            this.requestUri = requestUri;
            this.statusCode = statusCode;
            this.contentType = contentType;
            this.body = body;
        }
    }

    @Getter
    private static class RemoteJsonProbe {
        private final String requestUri;
        private final JSONObject json;
        private final String errorMessage;

        private RemoteJsonProbe(String requestUri, JSONObject json, String errorMessage) {
            this.requestUri = requestUri;
            this.json = json;
            this.errorMessage = errorMessage;
        }

        private static RemoteJsonProbe success(String requestUri, JSONObject json) {
            return new RemoteJsonProbe(requestUri, json, null);
        }

        private static RemoteJsonProbe failure(String requestUri, String errorMessage) {
            return new RemoteJsonProbe(requestUri, null, errorMessage);
        }

        private boolean isSuccess() {
            return json != null;
        }
    }

    @Getter
    private static class NormalizedInstanceEndpoint {
        private final String baseUrl;
        private final String webBasePath;

        private NormalizedInstanceEndpoint(String baseUrl, String webBasePath) {
            this.baseUrl = baseUrl;
            this.webBasePath = webBasePath;
        }
    }

    private static class XuiRemoteSession implements AutoCloseable {
        private final CloseableHttpClient httpClient;
        private final String baseUrl;
        private final String resolvedBasePath;
        private final Boolean secretStatusSupported;
        private final Boolean twoFactorSupported;

        private XuiRemoteSession(CloseableHttpClient httpClient,
                                 String baseUrl,
                                 String resolvedBasePath,
                                 Boolean secretStatusSupported,
                                 Boolean twoFactorSupported) {
            this.httpClient = httpClient;
            this.baseUrl = baseUrl;
            this.resolvedBasePath = resolvedBasePath;
            this.secretStatusSupported = secretStatusSupported;
            this.twoFactorSupported = twoFactorSupported;
        }

        public CloseableHttpClient getHttpClient() {
            return httpClient;
        }

        public String getBaseUrl() {
            return baseUrl;
        }

        public String getResolvedBasePath() {
            return resolvedBasePath;
        }

        public Boolean getSecretStatusSupported() {
            return secretStatusSupported;
        }

        public Boolean getTwoFactorSupported() {
            return twoFactorSupported;
        }

        @Override
        public void close() throws Exception {
            httpClient.close();
        }
    }
}
