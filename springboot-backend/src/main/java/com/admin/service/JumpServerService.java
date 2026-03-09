package com.admin.service;

import com.admin.common.lang.R;

public interface JumpServerService {

    /** 检查 JumpServer 集成是否已启用并配置 */
    R getStatus();

    /** 为指定资产创建 ConnectionToken 并返回跳转 URL */
    R createConnectionToken(Long assetId, String protocol, String account);
}
