package com.admin.service;

import com.admin.common.dto.MonitorInstanceDto;
import com.admin.common.dto.MonitorInstanceUpdateDto;
import com.admin.common.dto.MonitorProvisionDto;
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
}
