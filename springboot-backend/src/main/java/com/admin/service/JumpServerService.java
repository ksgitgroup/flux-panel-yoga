package com.admin.service;

import com.admin.common.lang.R;

import java.util.List;
import java.util.Map;

public interface JumpServerService {

    /** 检查 JumpServer 集成是否已启用并配置 */
    R getStatus();

    /** 为指定资产创建 ConnectionToken 并返回跳转 URL */
    R createConnectionToken(Long assetId, String protocol, String account);

    /** 拉取 JumpServer 主机列表（用于编辑资产时绑定），search 可选 */
    R listHosts(String search);

    /** 按当前资产主 IP 在 JumpServer 中匹配主机，返回匹配到的 JS 资产 id/name/address；若 save 为 true 则写回资产 */
    R matchByIp(Long assetId, boolean save);
}
