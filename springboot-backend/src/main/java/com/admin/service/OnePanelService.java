package com.admin.service;

import com.admin.common.dto.OnePanelExporterReportDto;
import com.admin.common.dto.OnePanelInstanceDto;
import com.admin.common.dto.OnePanelInstanceIdDto;
import com.admin.common.dto.OnePanelInstanceUpdateDto;
import com.admin.common.lang.R;
import com.admin.entity.OnePanelInstance;
import com.baomidou.mybatisplus.extension.service.IService;

public interface OnePanelService extends IService<OnePanelInstance> {

    R getAllInstances();

    R getInstanceDetail(Long id);

    R createInstance(OnePanelInstanceDto dto);

    R updateInstance(OnePanelInstanceUpdateDto dto);

    R deleteInstance(Long id);

    R rotateToken(OnePanelInstanceIdDto dto);

    R receiveReport(String instanceKey, String token, OnePanelExporterReportDto dto, String remoteIp);
}
