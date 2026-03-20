package com.admin.service;

import com.admin.common.lang.R;

public interface IpPoolService {
    R list(int page, int size, String keyword, String ipType, String healthStatus, String countryCode);
    R create(com.admin.entity.IpPool entity);
    R update(com.admin.entity.IpPool entity);
    R delete(Long id);
    R healthCheck(Long id);
    R batchHealthCheck();
    R bindToShop(Long ipPoolId, Long shopId);
    R unbind(Long ipPoolId);
    R exportProxyConfig(Long id, String browserType);
    R stats();
}
