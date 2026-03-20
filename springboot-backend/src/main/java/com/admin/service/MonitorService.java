package com.admin.service;

import com.admin.common.dto.MonitorInstanceDto;
import com.admin.common.dto.MonitorInstanceUpdateDto;
import com.admin.common.dto.MonitorProvisionDto;
import com.admin.common.dto.MonitorRecordsDto;
import com.admin.common.lang.R;
import com.admin.entity.MonitorInstance;
import com.baomidou.mybatisplus.extension.service.IService;

public interface MonitorService extends IService<MonitorInstance> {

    R getAllInstances();

    R getInstanceDetail(Long id);

    R createInstance(MonitorInstanceDto dto);

    R updateInstance(MonitorInstanceUpdateDto dto);

    R deleteInstance(Long id);

    R testConnection(Long id);

    R syncInstance(Long id);

    void autoSyncEligibleInstances();

    R getNodesByAssetId(Long assetId);

    R getAllUnboundNodes();

    R provisionAgent(MonitorProvisionDto dto);

    R getDashboardNodes();

    R deleteNodeSnapshot(Long nodeId);

    R getNodeRecords(MonitorRecordsDto dto);

    R getTerminalAccessUrl(Long nodeId);

    R getNodeStatusByUuid(Long instanceId, String uuid);

    R provisionDualAgent(Long komariInstanceId, Long pikaInstanceId, String name);

    R provisionAllAgents(Long komariInstanceId, Long pikaInstanceId, java.util.Map<String, Object> gostConfig, String name, String osPlatform, Long assetId);

    R getNodeProviderDetail(Long nodeId);

    R getKomariPingTaskDetail(Long nodeId, Long taskId, Integer hours);

    /**
     * Push asset label/name back to linked probes (Komari + Pika).
     * Called after user edits asset name in Flux.
     */
    void pushNameToProbes(Long assetId, String newName);

    /** Execute a remote command on a Komari node, returns task info */
    R executeKomariCommand(Long nodeId, String command);

    /** Get Komari command task result */
    R getKomariTaskResult(Long nodeId, String taskId);

    /** Trigger VPS security audit on a Pika node */
    R triggerPikaAudit(Long nodeId);

    /** Get Pika SSH login events for a node */
    R getPikaSshLoginEvents(Long nodeId, Integer pageSize);
}
