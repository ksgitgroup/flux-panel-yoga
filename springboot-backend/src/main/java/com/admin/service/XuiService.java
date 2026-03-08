package com.admin.service;

import com.admin.common.dto.XuiInstanceDto;
import com.admin.common.dto.XuiInstanceIdDto;
import com.admin.common.dto.XuiInstanceUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.XuiInstance;
import com.baomidou.mybatisplus.extension.service.IService;

public interface XuiService extends IService<XuiInstance> {

    R getAllInstances();

    R getInstanceDetail(Long id);

    R getInboundDirectory();

    R createInstance(XuiInstanceDto dto);

    R updateInstance(XuiInstanceUpdateDto dto);

    R deleteInstance(Long id);

    R testInstance(XuiInstanceIdDto dto);

    R syncInstance(XuiInstanceIdDto dto);

    R getForwardTargets();

    R receiveTraffic(String token, String requestBody, String remoteIp);

    void autoSyncEligibleInstances();
}
