package com.admin.service;

import com.admin.common.lang.R;

public interface ShopAccountService {
    R list(int page, int size, String keyword, String platform, String accountStatus, String browserType);
    R create(com.admin.entity.ShopAccount entity);
    R update(com.admin.entity.ShopAccount entity);
    R delete(Long id);
    R detail(Long id);
    R bindIp(Long shopId, Long ipPoolId);
    R unbindIp(Long shopId);
    R exportBrowserProfile(Long shopId);
    R stats();
}
