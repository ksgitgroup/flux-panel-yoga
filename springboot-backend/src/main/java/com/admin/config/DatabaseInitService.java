package com.admin.config;

import com.admin.common.utils.DiagnosisAlertTemplateUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

@Slf4j
@Component
public class DatabaseInitService {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void initDatabase() {
        log.info(">>>>>> [DatabaseInit] 启动全自动数据库版本检测与同步 (Phase 4.3) <<<<<<");

        // 0. Create Diagnosis Record Table (Priority)
        try {
            String createDiagnosisTable = "CREATE TABLE IF NOT EXISTS `diagnosis_record` (" +
                    "`id` int(10) NOT NULL AUTO_INCREMENT," +
                    "`target_type` varchar(20) DEFAULT NULL COMMENT 'forward 或 tunnel'," +
                    "`target_id` int(10) DEFAULT NULL COMMENT '关联ID'," +
                    "`target_name` varchar(100) DEFAULT NULL COMMENT '名称快照'," +
                    "`overall_success` tinyint(1) DEFAULT NULL COMMENT '整体是否成功'," +
                    "`results_json` text DEFAULT NULL COMMENT '详细结果'," +
                    "`average_time` double DEFAULT NULL COMMENT '延迟(ms)'," +
                    "`packet_loss` double DEFAULT NULL COMMENT '丢包率(%)'," +
                    "`created_time` bigint(20) DEFAULT NULL COMMENT '时间戳'," +
                    "PRIMARY KEY (`id`)," +
                    "KEY `idx_target` (`target_type`, `target_id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='诊断历史记录表'";
            jdbcTemplate.execute(createDiagnosisTable);
            log.info("[DatabaseInit] DiagnosisRecord 表校验成功");
        } catch (Exception e) {
            log.error("[DatabaseInit] DiagnosisRecord 表创建失败: {}", e.getMessage());
        }

        // 1. Create Protocol Table
        try {
            String createProtocolTable = "CREATE TABLE IF NOT EXISTS `protocol` (" +
                    "`id` int(10) NOT NULL AUTO_INCREMENT," +
                    "`name` varchar(100) NOT NULL COMMENT '协议名称'," +
                    "`description` varchar(255) DEFAULT NULL COMMENT '描述'," +
                    "`config_schema` text DEFAULT NULL COMMENT 'JSON Schema'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "PRIMARY KEY (`id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='转发协议表'";
            jdbcTemplate.execute(createProtocolTable);
            
            // Try to insert defaults
            jdbcTemplate.execute("INSERT IGNORE INTO `protocol` (`id`, `name`, `description`, `created_time`) VALUES " +
                    "(1, 'TCP', '标准TCP转发', UNIX_TIMESTAMP() * 1000), " +
                    "(2, 'UDP', '标准UDP转发', UNIX_TIMESTAMP() * 1000), " +
                    "(3, 'Socks5', 'Socks5代理协议', UNIX_TIMESTAMP() * 1000), " +
                    "(4, 'Vless', 'Vless代理协议', UNIX_TIMESTAMP() * 1000), " +
                    "(5, 'Vmess', 'Vmess代理协议', UNIX_TIMESTAMP() * 1000), " +
                    "(6, 'Trojan', 'Trojan代理协议', UNIX_TIMESTAMP() * 1000), " +
                    "(7, 'HTTP', 'HTTP代理协议', UNIX_TIMESTAMP() * 1000)");
            log.info("[DatabaseInit] Protocol 表校验及初始数据同步成功");
        } catch (Exception e) {
            log.error("[DatabaseInit] Protocol 表升级失败: {}", e.getMessage());
        }

        // 2. Create Tag Table
        try {
            String createTagTable = "CREATE TABLE IF NOT EXISTS `tag` (" +
                    "`id` int(10) NOT NULL AUTO_INCREMENT," +
                    "`name` varchar(50) NOT NULL COMMENT '标签名称'," +
                    "`color` varchar(50) DEFAULT 'primary' COMMENT '标签颜色款式'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "PRIMARY KEY (`id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='标签管理表'";
            jdbcTemplate.execute(createTagTable);

            jdbcTemplate.execute("INSERT IGNORE INTO `tag` (`id`, `name`, `color`, `created_time`) VALUES " +
                    "(1, '游戏加速', 'success', UNIX_TIMESTAMP() * 1000), " +
                    "(2, '海外节点', 'primary', UNIX_TIMESTAMP() * 1000), " +
                    "(3, '内网穿透', 'warning', UNIX_TIMESTAMP() * 1000), " +
                    "(4, '测试节点', 'default', UNIX_TIMESTAMP() * 1000)");
            log.info("[DatabaseInit] Tag 表校验及初始数据同步成功");
        } catch (Exception e) {
            log.error("[DatabaseInit] Tag 表升级失败: {}", e.getMessage());
        }

        // 3. Modify Forward Table (Incremental Update)
        try {
            // Robustly add columns only if they don't exist
            updateColumn("forward", "protocol_id", "int(10) DEFAULT NULL COMMENT '关联的协议ID'");
            updateColumn("forward", "tag_ids", "varchar(255) DEFAULT NULL COMMENT '关联的标签ID列表(逗号分隔)'");
            updateColumn("forward", "remote_source_type", "varchar(20) DEFAULT 'manual' COMMENT '目标来源类型：manual / xui'");
            updateColumn("forward", "remote_source_asset_id", "bigint(20) DEFAULT NULL COMMENT '关联的资产ID'");
            updateColumn("forward", "remote_source_instance_id", "bigint(20) DEFAULT NULL COMMENT '关联的 x-ui 实例ID'");
            updateColumn("forward", "remote_source_inbound_id", "bigint(20) DEFAULT NULL COMMENT '关联的 x-ui inbound 快照ID'");
            updateColumn("forward", "remote_source_label", "varchar(255) DEFAULT NULL COMMENT '远端来源标签'");
            updateColumn("forward", "remote_source_protocol", "varchar(40) DEFAULT NULL COMMENT '远端来源协议'");
            log.info("[DatabaseInit] Forward 表字段增量升级检测完成");
        } catch (Exception e) {
            log.error("[DatabaseInit] Forward 表属性升级失败: {}", e.getMessage());
        }

        // 3.1 Modify User Table for 2FA
        try {
            updateColumn("user", "two_factor_enabled", "tinyint(1) DEFAULT 0 COMMENT '是否启用TOTP二步验证'");
            updateColumn("user", "two_factor_secret", "varchar(128) DEFAULT NULL COMMENT 'TOTP密钥，仅启用2FA时保存'");
            updateColumn("user", "two_factor_bound_at", "bigint(20) DEFAULT NULL COMMENT '2FA绑定完成时间'");
            log.info("[DatabaseInit] User 表 2FA 字段增量升级检测完成");
        } catch (Exception e) {
            log.error("[DatabaseInit] User 表 2FA 字段升级失败: {}", e.getMessage());
        }

        // 4. Initialize vite_config diagnosis and alert settings
        try {
            updateColumn("vite_config", "description", "varchar(255) DEFAULT NULL COMMENT '配置描述'");
            modifyColumn("vite_config", "value", "TEXT NULL COMMENT '配置值'");

            ensureConfig("auto_diagnosis_enabled", "true", "是否开启后台自动诊断任务");
            ensureConfig("auto_diagnosis_interval", "30", "自动诊断间隔时间(分钟)");
            ensureConfig("site_environment_name", "默认环境", "当前部署环境名称，例如 LOCAL / DEV / PROD");
            ensureConfig("two_factor_enforcement_scope", "disabled", "二步验证强制范围：disabled/admin/all");
            ensureConfig("wechat_webhook_enabled", "false", "是否启用企业微信机器人告警");
            ensureConfig("wechat_webhook_url", "", "企业微信机器人 Webhook 地址");
            ensureConfig("wechat_webhook_cooldown_minutes", "30", "两次异常通知之间的最短间隔(分钟)");
            ensureConfig("wechat_webhook_max_failures", "8", "单次通知中最多展示的异常条目数");
            ensureConfig("wechat_notify_recovery_enabled", "true", "异常恢复后是否发送恢复通知");
            ensureConfig("wechat_webhook_template",
                    DiagnosisAlertTemplateUtil.DEFAULT_ALERT_TEMPLATE,
                    "企业微信异常通知模板，支持占位符变量");
            ensureConfig("wechat_recovery_template",
                    DiagnosisAlertTemplateUtil.DEFAULT_RECOVERY_TEMPLATE,
                    "企业微信恢复通知模板，支持占位符变量");
            ensureConfig("wechat_webhook_last_sent_at", "0", "系统内部使用：最近一次告警发送时间");
            ensureConfig("wechat_webhook_last_status", "healthy", "系统内部使用：最近一次告警状态");
            ensureConfig("portal_nav_links", "[]", "自定义导航入口配置(JSON)");
            log.info("[DatabaseInit] 自动诊断与告警配置项初始化成功");
        } catch (Exception e) {
            log.warn("[DatabaseInit] 尝试初始化诊断配置项时发生异常: {}", e.getMessage());
        }

        // 5. Create Asset Host table
        try {
            String createAssetHostTable = "CREATE TABLE IF NOT EXISTS `asset_host` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`name` varchar(120) NOT NULL COMMENT '资产名称'," +
                    "`label` varchar(120) DEFAULT NULL COMMENT '资产标识'," +
                    "`primary_ip` varchar(128) DEFAULT NULL COMMENT '主公网 IP 或域名'," +
                    "`environment` varchar(40) DEFAULT NULL COMMENT '所属环境'," +
                    "`provider` varchar(80) DEFAULT NULL COMMENT '服务提供商'," +
                    "`region` varchar(80) DEFAULT NULL COMMENT '区域'," +
                    "`remark` varchar(255) DEFAULT NULL COMMENT '备注'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_asset_host_name` (`name`)," +
                    "UNIQUE KEY `uk_asset_host_label` (`label`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='服务器资产表'";
            jdbcTemplate.execute(createAssetHostTable);
            log.info("[DatabaseInit] AssetHost 表校验成功");
        } catch (Exception e) {
            log.error("[DatabaseInit] AssetHost 表创建失败: {}", e.getMessage());
        }

        // 6. Create X-UI integration tables
        try {
            String createXuiInstanceTable = "CREATE TABLE IF NOT EXISTS `xui_instance` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`name` varchar(120) NOT NULL COMMENT '实例名称'," +
                    "`provider` varchar(20) DEFAULT 'x-ui' COMMENT '提供方: x-ui / 3x-ui'," +
                    "`base_url` varchar(255) NOT NULL COMMENT 'x-ui 面板地址'," +
                    "`web_base_path` varchar(120) DEFAULT '/' COMMENT 'x-ui Web Base Path'," +
                    "`username` varchar(120) NOT NULL COMMENT '登录用户名'," +
                    "`encrypted_password` text NOT NULL COMMENT '加密后的登录密码'," +
                    "`encrypted_login_secret` text DEFAULT NULL COMMENT '加密后的 Secret Token'," +
                    "`asset_id` bigint(20) DEFAULT NULL COMMENT '关联资产 ID'," +
                    "`host_label` varchar(120) DEFAULT NULL COMMENT '资产主机标识'," +
                    "`management_mode` varchar(20) DEFAULT 'observe' COMMENT 'observe 或 flux_managed'," +
                    "`sync_enabled` tinyint(1) DEFAULT 1 COMMENT '是否自动同步'," +
                    "`sync_interval_minutes` int(10) DEFAULT 10 COMMENT '自动同步间隔（分钟）'," +
                    "`allow_insecure_tls` tinyint(1) DEFAULT 0 COMMENT '是否允许跳过 TLS 校验'," +
                    "`remark` varchar(255) DEFAULT NULL COMMENT '备注'," +
                    "`traffic_token` varchar(64) NOT NULL COMMENT 'x-ui 外部流量上报 token'," +
                    "`last_sync_at` bigint(20) DEFAULT NULL COMMENT '最后一次同步时间'," +
                    "`last_sync_status` varchar(20) DEFAULT 'never' COMMENT '最后同步状态'," +
                    "`last_sync_trigger` varchar(20) DEFAULT NULL COMMENT 'manual / auto'," +
                    "`last_sync_error` text DEFAULT NULL COMMENT '最后同步错误'," +
                    "`last_test_at` bigint(20) DEFAULT NULL COMMENT '最后一次测试时间'," +
                    "`last_test_status` varchar(20) DEFAULT 'never' COMMENT '最后测试状态'," +
                    "`last_test_error` text DEFAULT NULL COMMENT '最后测试错误'," +
                    "`last_traffic_push_at` bigint(20) DEFAULT NULL COMMENT '最后一次流量上报时间'," +
                    "`last_api_flavor` varchar(40) DEFAULT NULL COMMENT '最近一次识别的 API 风格'," +
                    "`last_resolved_base_path` varchar(120) DEFAULT NULL COMMENT '最近一次识别的 Base Path'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_xui_instance_name` (`name`)," +
                    "UNIQUE KEY `uk_xui_instance_traffic_token` (`traffic_token`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='x-ui 实例管理表'";
            jdbcTemplate.execute(createXuiInstanceTable);
            updateColumn("xui_instance", "provider", "varchar(20) DEFAULT 'x-ui' COMMENT '提供方: x-ui / 3x-ui'");
            updateColumn("xui_instance", "encrypted_login_secret", "text DEFAULT NULL COMMENT '加密后的 Secret Token'");
            updateColumn("xui_instance", "asset_id", "bigint(20) DEFAULT NULL COMMENT '关联资产 ID'");
            updateColumn("xui_instance", "last_api_flavor", "varchar(40) DEFAULT NULL COMMENT '最近一次识别的 API 风格'");
            updateColumn("xui_instance", "last_resolved_base_path", "varchar(120) DEFAULT NULL COMMENT '最近一次识别的 Base Path'");

            String createXuiInboundSnapshotTable = "CREATE TABLE IF NOT EXISTS `xui_inbound_snapshot` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`instance_id` bigint(20) NOT NULL COMMENT '所属 x-ui 实例'," +
                    "`remote_inbound_id` int(10) NOT NULL COMMENT '远端 inbound ID'," +
                    "`remark` varchar(255) DEFAULT NULL COMMENT '备注'," +
                    "`tag` varchar(255) DEFAULT NULL COMMENT 'xray tag'," +
                    "`protocol` varchar(40) DEFAULT NULL COMMENT '协议'," +
                    "`listen` varchar(120) DEFAULT NULL COMMENT '监听地址'," +
                    "`port` int(10) DEFAULT NULL COMMENT '监听端口'," +
                    "`enable` tinyint(1) DEFAULT 1 COMMENT '是否启用'," +
                    "`expiry_time` bigint(20) DEFAULT NULL COMMENT '到期时间'," +
                    "`total` bigint(20) DEFAULT NULL COMMENT '总流量上限'," +
                    "`up` bigint(20) DEFAULT NULL COMMENT '累计上传'," +
                    "`down` bigint(20) DEFAULT NULL COMMENT '累计下载'," +
                    "`all_time` bigint(20) DEFAULT NULL COMMENT '累计总流量'," +
                    "`client_count` int(10) DEFAULT 0 COMMENT '客户端数量'," +
                    "`online_client_count` int(10) DEFAULT 0 COMMENT '在线客户端数量'," +
                    "`transport_summary` varchar(255) DEFAULT NULL COMMENT '传输摘要'," +
                    "`settings_digest` varchar(64) DEFAULT NULL COMMENT 'settings 摘要'," +
                    "`stream_settings_digest` varchar(64) DEFAULT NULL COMMENT 'streamSettings 摘要'," +
                    "`sniffing_digest` varchar(64) DEFAULT NULL COMMENT 'sniffing 摘要'," +
                    "`last_sync_at` bigint(20) DEFAULT NULL COMMENT '最后同步时间'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：远端已删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_xui_inbound_instance_remote` (`instance_id`, `remote_inbound_id`)," +
                    "KEY `idx_xui_inbound_instance_status` (`instance_id`, `status`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='x-ui inbound 快照表'";
            jdbcTemplate.execute(createXuiInboundSnapshotTable);

            String createXuiClientSnapshotTable = "CREATE TABLE IF NOT EXISTS `xui_client_snapshot` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`instance_id` bigint(20) NOT NULL COMMENT '所属 x-ui 实例'," +
                    "`remote_inbound_id` int(10) NOT NULL COMMENT '所属 remote inbound ID'," +
                    "`remote_client_id` int(10) DEFAULT NULL COMMENT '远端 client 记录 ID'," +
                    "`remote_client_key` varchar(191) NOT NULL COMMENT '远端 client 稳定键'," +
                    "`email` varchar(191) DEFAULT NULL COMMENT '客户端 email'," +
                    "`enable` tinyint(1) DEFAULT 1 COMMENT '是否启用'," +
                    "`expiry_time` bigint(20) DEFAULT NULL COMMENT '到期时间'," +
                    "`total` bigint(20) DEFAULT NULL COMMENT '总流量上限'," +
                    "`up` bigint(20) DEFAULT NULL COMMENT '累计上传'," +
                    "`down` bigint(20) DEFAULT NULL COMMENT '累计下载'," +
                    "`all_time` bigint(20) DEFAULT NULL COMMENT '累计总流量'," +
                    "`online` tinyint(1) DEFAULT 0 COMMENT '是否在线'," +
                    "`last_online_at` bigint(20) DEFAULT NULL COMMENT '最后在线时间'," +
                    "`comment` varchar(255) DEFAULT NULL COMMENT '备注'," +
                    "`sub_id` varchar(191) DEFAULT NULL COMMENT '订阅 ID'," +
                    "`limit_ip` int(10) DEFAULT NULL COMMENT '限制 IP 数'," +
                    "`reset_days` int(10) DEFAULT NULL COMMENT '重置周期天数'," +
                    "`last_sync_at` bigint(20) DEFAULT NULL COMMENT '最后同步时间'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：远端已删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_xui_client_instance_key` (`instance_id`, `remote_client_key`)," +
                    "KEY `idx_xui_client_instance_status` (`instance_id`, `status`)," +
                    "KEY `idx_xui_client_instance_inbound` (`instance_id`, `remote_inbound_id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='x-ui client 快照表'";
            jdbcTemplate.execute(createXuiClientSnapshotTable);

            String createXuiSyncLogTable = "CREATE TABLE IF NOT EXISTS `xui_sync_log` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`instance_id` bigint(20) NOT NULL COMMENT '所属 x-ui 实例'," +
                    "`sync_type` varchar(20) NOT NULL COMMENT 'test / manual / auto'," +
                    "`success` tinyint(1) DEFAULT 0 COMMENT '是否成功'," +
                    "`message` varchar(255) DEFAULT NULL COMMENT '摘要消息'," +
                    "`detail_text` text DEFAULT NULL COMMENT '详细内容'," +
                    "`started_at` bigint(20) DEFAULT NULL COMMENT '开始时间'," +
                    "`finished_at` bigint(20) DEFAULT NULL COMMENT '结束时间'," +
                    "`duration_ms` bigint(20) DEFAULT NULL COMMENT '耗时（毫秒）'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "KEY `idx_xui_sync_log_instance` (`instance_id`, `created_time`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='x-ui 同步日志表'";
            jdbcTemplate.execute(createXuiSyncLogTable);

            String createXuiTrafficDeltaEventTable = "CREATE TABLE IF NOT EXISTS `xui_traffic_delta_event` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`instance_id` bigint(20) NOT NULL COMMENT '所属 x-ui 实例'," +
                    "`source_token` varchar(64) NOT NULL COMMENT '上报 token'," +
                    "`request_body` longtext DEFAULT NULL COMMENT '原始上报体'," +
                    "`received_ip` varchar(128) DEFAULT NULL COMMENT '来源 IP'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "KEY `idx_xui_traffic_event_instance` (`instance_id`, `created_time`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='x-ui 流量增量事件表'";
            jdbcTemplate.execute(createXuiTrafficDeltaEventTable);

            log.info("[DatabaseInit] X-UI 集成表校验成功");
        } catch (Exception e) {
            log.error("[DatabaseInit] X-UI 集成表创建失败: {}", e.getMessage());
        }

        // 7. Backfill Asset Host bindings from X-UI hostLabel
        try {
            bootstrapAssetHostsFromXuiInstances();
            log.info("[DatabaseInit] AssetHost 与 X-UI 历史数据回填完成");
        } catch (Exception e) {
            log.warn("[DatabaseInit] 回填 AssetHost 与 X-UI 关联时发生异常: {}", e.getMessage());
        }

        // 8. Extend Asset Host with VPS management fields (P0 incremental)
        try {
            updateColumn("asset_host", "ipv6", "varchar(128) DEFAULT NULL COMMENT 'IPv6 地址'");
            updateColumn("asset_host", "role", "varchar(40) DEFAULT NULL COMMENT '角色：entry / relay / landing / standalone'");
            updateColumn("asset_host", "os", "varchar(80) DEFAULT NULL COMMENT '操作系统'");
            updateColumn("asset_host", "os_category", "varchar(20) DEFAULT NULL COMMENT '操作系统类别'");
            updateColumn("asset_host", "cpu_cores", "int(10) DEFAULT NULL COMMENT 'CPU 核心数'");
            updateColumn("asset_host", "mem_total_mb", "int(10) DEFAULT NULL COMMENT '总内存 (MB)'");
            updateColumn("asset_host", "disk_total_gb", "int(10) DEFAULT NULL COMMENT '总磁盘 (GB)'");
            updateColumn("asset_host", "bandwidth_mbps", "int(10) DEFAULT NULL COMMENT '带宽 (Mbps)'");
            updateColumn("asset_host", "monthly_traffic_gb", "int(10) DEFAULT NULL COMMENT '月流量限额 (GB)'");
            updateColumn("asset_host", "ssh_port", "int(10) DEFAULT NULL COMMENT 'SSH 端口'");
            updateColumn("asset_host", "purchase_date", "bigint(20) DEFAULT NULL COMMENT '购买日期'");
            updateColumn("asset_host", "expire_date", "bigint(20) DEFAULT NULL COMMENT '到期日期'");
            updateColumn("asset_host", "monthly_cost", "varchar(40) DEFAULT NULL COMMENT '月费用'");
            updateColumn("asset_host", "currency", "varchar(10) DEFAULT NULL COMMENT '币种：CNY / USD'");
            updateColumn("asset_host", "tags", "varchar(500) DEFAULT NULL COMMENT '标签 (JSON 数组)'");
            updateColumn("asset_host", "gost_node_id", "bigint(20) DEFAULT NULL COMMENT '关联 GOST 节点 ID'");
            updateColumn("asset_host", "monitor_node_uuid", "varchar(64) DEFAULT NULL COMMENT '关联探针节点 UUID'");
            updateColumn("asset_host", "cpu_name", "varchar(120) DEFAULT NULL COMMENT 'CPU 型号名称（探针同步）'");
            updateColumn("asset_host", "arch", "varchar(30) DEFAULT NULL COMMENT '架构（探针同步）'");
            updateColumn("asset_host", "virtualization", "varchar(30) DEFAULT NULL COMMENT '虚拟化类型（探针同步）'");
            updateColumn("asset_host", "kernel_version", "varchar(120) DEFAULT NULL COMMENT '内核版本（探针同步）'");
            updateColumn("asset_host", "gpu_name", "varchar(120) DEFAULT NULL COMMENT 'GPU 型号（探针同步）'");
            updateColumn("asset_host", "swap_total_mb", "int(10) DEFAULT NULL COMMENT 'Swap 容量 (MB)（探针同步）'");
            updateColumn("node", "asset_id", "bigint(20) DEFAULT NULL COMMENT '关联资产 ID'");
            log.info("[DatabaseInit] AssetHost VPS 管理字段增量升级完成");
        } catch (Exception e) {
            log.warn("[DatabaseInit] AssetHost 字段升级异常: {}", e.getMessage());
        }

        // 9. Create Monitor integration tables (P0.5)
        try {
            String createMonitorInstanceTable = "CREATE TABLE IF NOT EXISTS `monitor_instance` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`name` varchar(120) NOT NULL COMMENT '实例名称'," +
                    "`type` varchar(40) NOT NULL DEFAULT 'komari' COMMENT '探针类型：komari / pika'," +
                    "`base_url` varchar(255) NOT NULL COMMENT '探针服务端地址'," +
                    "`api_key` varchar(255) DEFAULT NULL COMMENT 'API Key / Token'," +
                    "`sync_enabled` tinyint(1) DEFAULT 1 COMMENT '是否自动同步'," +
                    "`sync_interval_minutes` int(10) DEFAULT 5 COMMENT '同步间隔（分钟）'," +
                    "`allow_insecure_tls` tinyint(1) DEFAULT 0 COMMENT '是否允许跳过 TLS 校验'," +
                    "`remark` varchar(255) DEFAULT NULL COMMENT '备注'," +
                    "`last_sync_at` bigint(20) DEFAULT NULL COMMENT '最后同步时间'," +
                    "`last_sync_status` varchar(20) DEFAULT 'never' COMMENT '最后同步状态'," +
                    "`last_sync_error` text DEFAULT NULL COMMENT '最后同步错误'," +
                    "`node_count` int(10) DEFAULT 0 COMMENT '节点总数'," +
                    "`online_node_count` int(10) DEFAULT 0 COMMENT '在线节点数'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_monitor_instance_name` (`name`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='探针实例管理表'";
            jdbcTemplate.execute(createMonitorInstanceTable);

            String createMonitorNodeSnapshotTable = "CREATE TABLE IF NOT EXISTS `monitor_node_snapshot` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`instance_id` bigint(20) NOT NULL COMMENT '所属探针实例'," +
                    "`remote_node_uuid` varchar(64) NOT NULL COMMENT '远端节点 UUID'," +
                    "`asset_id` bigint(20) DEFAULT NULL COMMENT '关联资产 ID'," +
                    "`name` varchar(120) DEFAULT NULL COMMENT '节点名称'," +
                    "`ip` varchar(128) DEFAULT NULL COMMENT 'IPv4 地址'," +
                    "`ipv6` varchar(128) DEFAULT NULL COMMENT 'IPv6 地址'," +
                    "`os` varchar(120) DEFAULT NULL COMMENT '操作系统'," +
                    "`cpu_name` varchar(200) DEFAULT NULL COMMENT 'CPU 型号'," +
                    "`cpu_cores` int(10) DEFAULT NULL COMMENT 'CPU 核心数'," +
                    "`mem_total` bigint(20) DEFAULT NULL COMMENT '总内存 (bytes)'," +
                    "`disk_total` bigint(20) DEFAULT NULL COMMENT '总磁盘 (bytes)'," +
                    "`region` varchar(80) DEFAULT NULL COMMENT '区域'," +
                    "`version` varchar(40) DEFAULT NULL COMMENT 'Agent 版本'," +
                    "`online` tinyint(1) DEFAULT 0 COMMENT '是否在线'," +
                    "`last_active_at` bigint(20) DEFAULT NULL COMMENT '最后活跃时间'," +
                    "`last_sync_at` bigint(20) DEFAULT NULL COMMENT '最后同步时间'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：远端已移除）'," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_monitor_node_instance_uuid` (`instance_id`, `remote_node_uuid`)," +
                    "KEY `idx_monitor_node_asset` (`asset_id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='探针节点快照表'";
            jdbcTemplate.execute(createMonitorNodeSnapshotTable);

            String createMonitorMetricLatestTable = "CREATE TABLE IF NOT EXISTS `monitor_metric_latest` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`node_snapshot_id` bigint(20) NOT NULL COMMENT '关联节点快照'," +
                    "`instance_id` bigint(20) NOT NULL COMMENT '所属探针实例'," +
                    "`remote_node_uuid` varchar(64) NOT NULL COMMENT '远端节点 UUID'," +
                    "`cpu_usage` double DEFAULT NULL COMMENT 'CPU 使用率 (%)'," +
                    "`mem_used` bigint(20) DEFAULT NULL COMMENT '已用内存 (bytes)'," +
                    "`mem_total` bigint(20) DEFAULT NULL COMMENT '总内存 (bytes)'," +
                    "`disk_used` bigint(20) DEFAULT NULL COMMENT '已用磁盘 (bytes)'," +
                    "`disk_total` bigint(20) DEFAULT NULL COMMENT '总磁盘 (bytes)'," +
                    "`net_in` bigint(20) DEFAULT NULL COMMENT '当前入站速度 (bytes/s)'," +
                    "`net_out` bigint(20) DEFAULT NULL COMMENT '当前出站速度 (bytes/s)'," +
                    "`net_total_up` bigint(20) DEFAULT NULL COMMENT '累计上传 (bytes)'," +
                    "`net_total_down` bigint(20) DEFAULT NULL COMMENT '累计下载 (bytes)'," +
                    "`load1` double DEFAULT NULL COMMENT '1 分钟负载'," +
                    "`uptime` bigint(20) DEFAULT NULL COMMENT '运行时长 (秒)'," +
                    "`connections` int(10) DEFAULT NULL COMMENT 'TCP 连接数'," +
                    "`process_count` int(10) DEFAULT NULL COMMENT '进程数'," +
                    "`sampled_at` bigint(20) DEFAULT NULL COMMENT '采样时间'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态'," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_monitor_metric_instance_uuid` (`instance_id`, `remote_node_uuid`)," +
                    "KEY `idx_monitor_metric_node` (`node_snapshot_id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='探针最新指标表'";
            jdbcTemplate.execute(createMonitorMetricLatestTable);

            // Fix: ensure updated_time has a default value to prevent insert failures
            try {
                jdbcTemplate.execute("ALTER TABLE `monitor_node_snapshot` MODIFY COLUMN `updated_time` bigint(20) NOT NULL DEFAULT 0 COMMENT '更新时间'");
                jdbcTemplate.execute("ALTER TABLE `monitor_metric_latest` MODIFY COLUMN `updated_time` bigint(20) NOT NULL DEFAULT 0 COMMENT '更新时间'");
            } catch (Exception e) {
                log.debug("[DatabaseInit] updated_time default migration: {}", e.getMessage());
            }

            // Add new columns to monitor_node_snapshot (v2 expansion)
            updateColumn("monitor_node_snapshot", "virtualization", "varchar(50) DEFAULT NULL COMMENT '虚拟化类型'");
            updateColumn("monitor_node_snapshot", "arch", "varchar(50) DEFAULT NULL COMMENT 'CPU 架构'");
            updateColumn("monitor_node_snapshot", "kernel_version", "varchar(100) DEFAULT NULL COMMENT '内核版本'");
            updateColumn("monitor_node_snapshot", "gpu_name", "varchar(100) DEFAULT NULL COMMENT 'GPU 型号'");
            updateColumn("monitor_node_snapshot", "swap_total", "bigint(20) DEFAULT NULL COMMENT '总 Swap (bytes)'");
            updateColumn("monitor_node_snapshot", "hidden", "tinyint(1) DEFAULT 0 COMMENT '是否隐藏'");
            updateColumn("monitor_node_snapshot", "tags", "text DEFAULT NULL COMMENT '标签（分号分隔）'");
            updateColumn("monitor_node_snapshot", "node_group", "varchar(100) DEFAULT NULL COMMENT '分组'");
            updateColumn("monitor_node_snapshot", "weight", "int(10) DEFAULT NULL COMMENT '排序权重'");
            updateColumn("monitor_node_snapshot", "price", "double DEFAULT NULL COMMENT '价格'");
            updateColumn("monitor_node_snapshot", "billing_cycle", "int(10) DEFAULT NULL COMMENT '计费周期'");
            updateColumn("monitor_node_snapshot", "currency", "varchar(20) DEFAULT NULL COMMENT '货币符号'");
            updateColumn("monitor_node_snapshot", "expired_at", "bigint(20) DEFAULT NULL COMMENT '到期时间'");
            updateColumn("monitor_node_snapshot", "traffic_limit", "bigint(20) DEFAULT NULL COMMENT '流量限额 (bytes)'");
            updateColumn("monitor_node_snapshot", "traffic_limit_type", "varchar(10) DEFAULT NULL COMMENT '流量限额类型'");
            updateColumn("monitor_node_snapshot", "traffic_used", "bigint(20) DEFAULT NULL COMMENT '已用流量 (bytes)'");
            updateColumn("monitor_node_snapshot", "traffic_reset_day", "int(10) DEFAULT NULL COMMENT '流量重置日(1-31)'");

            // Sync control: prevent re-creation after user deletes asset/node
            updateColumn("monitor_node_snapshot", "asset_unlinked", "tinyint(1) DEFAULT 0 COMMENT '用户已取消关联资产(1=跳过自动创建)'");

            // Add new columns to monitor_metric_latest (v2 expansion)
            updateColumn("monitor_metric_latest", "swap_used", "bigint(20) DEFAULT NULL COMMENT '已用 Swap (bytes)'");
            updateColumn("monitor_metric_latest", "swap_total", "bigint(20) DEFAULT NULL COMMENT '总 Swap (bytes)'");
            updateColumn("monitor_metric_latest", "gpu_usage", "double DEFAULT NULL COMMENT 'GPU 使用率 (%)'");
            updateColumn("monitor_metric_latest", "temperature", "double DEFAULT NULL COMMENT '温度 (°C)'");
            updateColumn("monitor_metric_latest", "load5", "double DEFAULT NULL COMMENT '5 分钟负载'");
            updateColumn("monitor_metric_latest", "load15", "double DEFAULT NULL COMMENT '15 分钟负载'");
            updateColumn("monitor_metric_latest", "connections_udp", "int(10) DEFAULT NULL COMMENT 'UDP 连接数'");

            // Pika integration: add username to monitor_instance, pikaNodeId to asset_host
            updateColumn("monitor_instance", "username", "varchar(120) DEFAULT NULL COMMENT 'Pika 登录用户名'");
            updateColumn("asset_host", "pika_node_id", "varchar(64) DEFAULT NULL COMMENT 'Pika 探针节点 ID'");
            updateColumn("asset_host", "panel_url", "varchar(255) DEFAULT NULL COMMENT '1Panel 面板地址'");
            updateColumn("asset_host", "billing_cycle", "int(10) DEFAULT NULL COMMENT '付费周期 (天): 30=月付, 90=季付, 365=年付'");
            updateColumn("asset_host", "user_edited_fields", "varchar(500) DEFAULT NULL COMMENT '用户手动编辑过的字段 (JSON数组)'");
            updateColumn("asset_host", "purpose", "varchar(200) DEFAULT NULL COMMENT '核心用途 (简短描述)'");

            log.info("[DatabaseInit] Monitor 探针集成表校验成功");
        } catch (Exception e) {
            log.error("[DatabaseInit] Monitor 探针集成表创建失败: {}", e.getMessage());
        }

        // 10. Alert rules and logs
        try {
            String createAlertRuleTable = "CREATE TABLE IF NOT EXISTS `monitor_alert_rule` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`name` varchar(120) NOT NULL COMMENT '规则名称'," +
                    "`enabled` tinyint(1) DEFAULT 1 COMMENT '是否启用'," +
                    "`metric` varchar(40) NOT NULL COMMENT '指标: cpu, mem, disk, net_in, net_out, offline'," +
                    "`operator` varchar(10) NOT NULL DEFAULT 'gt' COMMENT '操作符: gt, lt, eq'," +
                    "`threshold` double NOT NULL DEFAULT 0 COMMENT '阈值'," +
                    "`duration_seconds` int(10) DEFAULT 0 COMMENT '持续时间(秒) 0=立即'," +
                    "`scope_type` varchar(20) DEFAULT 'all' COMMENT '范围: all, tag, node'," +
                    "`scope_value` varchar(255) DEFAULT NULL COMMENT '范围值: 标签名/节点ID'," +
                    "`notify_type` varchar(20) DEFAULT 'webhook' COMMENT '通知方式: webhook, log'," +
                    "`notify_target` text DEFAULT NULL COMMENT '通知目标: webhook URL'," +
                    "`cooldown_minutes` int(10) DEFAULT 5 COMMENT '冷却时间(分钟)'," +
                    "`last_triggered_at` bigint(20) DEFAULT NULL COMMENT '上次触发时间'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态'," +
                    "PRIMARY KEY (`id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='告警规则表'";
            jdbcTemplate.execute(createAlertRuleTable);

            String createAlertLogTable = "CREATE TABLE IF NOT EXISTS `monitor_alert_log` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`rule_id` bigint(20) NOT NULL COMMENT '规则 ID'," +
                    "`rule_name` varchar(120) DEFAULT NULL COMMENT '规则名称'," +
                    "`node_id` bigint(20) DEFAULT NULL COMMENT '节点 ID'," +
                    "`node_name` varchar(120) DEFAULT NULL COMMENT '节点名称'," +
                    "`metric` varchar(40) DEFAULT NULL COMMENT '告警指标'," +
                    "`current_value` double DEFAULT NULL COMMENT '当前值'," +
                    "`threshold` double DEFAULT NULL COMMENT '阈值'," +
                    "`message` text DEFAULT NULL COMMENT '告警消息'," +
                    "`notify_status` varchar(20) DEFAULT 'pending' COMMENT '通知状态: pending, sent, failed'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态'," +
                    "PRIMARY KEY (`id`)," +
                    "KEY `idx_alert_log_rule` (`rule_id`)," +
                    "KEY `idx_alert_log_time` (`created_time`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='告警日志表'";
            jdbcTemplate.execute(createAlertLogTable);

            updateColumn("monitor_alert_rule", "probe_condition", "varchar(20) DEFAULT 'any' COMMENT '探针条件: any, komari, pika, both'");
            updateColumn("monitor_alert_rule", "severity", "varchar(20) DEFAULT 'warning' COMMENT '严重等级: info, warning, critical'");
            updateColumn("monitor_alert_rule", "escalate_after_minutes", "int DEFAULT NULL COMMENT '升级间隔分钟: 持续触发后自动升级等级'");

            log.info("[DatabaseInit] 告警规则/日志表校验成功");
        } catch (Exception e) {
            log.error("[DatabaseInit] 告警表创建失败: {}", e.getMessage());
        }

        // 11. Enterprise IAM foundation (additive only, does not replace existing user login flow)
        try {
            String createSysRoleTable = "CREATE TABLE IF NOT EXISTS `sys_role` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`code` varchar(80) NOT NULL COMMENT '角色编码'," +
                    "`name` varchar(120) NOT NULL COMMENT '角色名称'," +
                    "`description` varchar(255) DEFAULT NULL COMMENT '角色描述'," +
                    "`role_scope` varchar(40) DEFAULT 'custom' COMMENT '角色范围'," +
                    "`builtin` tinyint(1) DEFAULT 0 COMMENT '是否内置角色'," +
                    "`sort_order` int(10) DEFAULT 100 COMMENT '排序权重'," +
                    "`enabled` tinyint(1) DEFAULT 1 COMMENT '是否启用'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_sys_role_code` (`code`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业IAM角色表'";
            jdbcTemplate.execute(createSysRoleTable);

            String createSysPermissionTable = "CREATE TABLE IF NOT EXISTS `sys_permission` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`code` varchar(120) NOT NULL COMMENT '权限编码'," +
                    "`name` varchar(120) NOT NULL COMMENT '权限名称'," +
                    "`module_key` varchar(80) DEFAULT NULL COMMENT '所属模块'," +
                    "`description` varchar(255) DEFAULT NULL COMMENT '权限描述'," +
                    "`sort_order` int(10) DEFAULT 100 COMMENT '排序权重'," +
                    "`enabled` tinyint(1) DEFAULT 1 COMMENT '是否启用'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_sys_permission_code` (`code`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业IAM权限表'";
            jdbcTemplate.execute(createSysPermissionTable);

            String createSysUserTable = "CREATE TABLE IF NOT EXISTS `sys_user` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`display_name` varchar(120) NOT NULL COMMENT '姓名'," +
                    "`email` varchar(191) NOT NULL COMMENT '企业邮箱'," +
                    "`auth_source` varchar(40) NOT NULL COMMENT '认证来源: local/dingtalk'," +
                    "`local_username` varchar(120) DEFAULT NULL COMMENT '本地登录名'," +
                    "`encrypted_password` text DEFAULT NULL COMMENT '本地登录密码（加密）'," +
                    "`mobile` varchar(40) DEFAULT NULL COMMENT '手机号'," +
                    "`job_title` varchar(120) DEFAULT NULL COMMENT '岗位'," +
                    "`dingtalk_user_id` varchar(120) DEFAULT NULL COMMENT '钉钉UserId'," +
                    "`dingtalk_union_id` varchar(120) DEFAULT NULL COMMENT '钉钉UnionId'," +
                    "`department_path` varchar(255) DEFAULT NULL COMMENT '部门路径'," +
                    "`org_active` tinyint(1) DEFAULT 1 COMMENT '是否仍在组织内'," +
                    "`enabled` tinyint(1) DEFAULT 1 COMMENT '是否启用'," +
                    "`last_org_sync_at` bigint(20) DEFAULT NULL COMMENT '最后组织同步时间'," +
                    "`last_login_at` bigint(20) DEFAULT NULL COMMENT '最后登录时间'," +
                    "`remark` varchar(255) DEFAULT NULL COMMENT '备注'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_sys_user_email` (`email`)," +
                    "UNIQUE KEY `uk_sys_user_local_username` (`local_username`)," +
                    "UNIQUE KEY `uk_sys_user_dingtalk_user_id` (`dingtalk_user_id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业IAM用户表'";
            jdbcTemplate.execute(createSysUserTable);

            String createSysUserRoleTable = "CREATE TABLE IF NOT EXISTS `sys_user_role` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`user_id` bigint(20) NOT NULL COMMENT 'IAM用户ID'," +
                    "`role_id` bigint(20) NOT NULL COMMENT '角色ID'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_sys_user_role` (`user_id`, `role_id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业IAM用户角色关系表'";
            jdbcTemplate.execute(createSysUserRoleTable);

            String createSysRolePermissionTable = "CREATE TABLE IF NOT EXISTS `sys_role_permission` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`role_id` bigint(20) NOT NULL COMMENT '角色ID'," +
                    "`permission_id` bigint(20) NOT NULL COMMENT '权限ID'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_sys_role_permission` (`role_id`, `permission_id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业IAM角色权限关系表'";
            jdbcTemplate.execute(createSysRolePermissionTable);

            String createSysSessionTable = "CREATE TABLE IF NOT EXISTS `sys_session` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`user_id` bigint(20) NOT NULL COMMENT 'IAM用户ID'," +
                    "`auth_source` varchar(40) NOT NULL COMMENT '认证来源'," +
                    "`login_channel` varchar(40) DEFAULT NULL COMMENT '登录渠道'," +
                    "`display_name` varchar(120) DEFAULT NULL COMMENT '登录时姓名快照'," +
                    "`email` varchar(191) DEFAULT NULL COMMENT '登录时邮箱快照'," +
                    "`ip_address` varchar(80) DEFAULT NULL COMMENT '登录IP'," +
                    "`user_agent` varchar(512) DEFAULT NULL COMMENT 'User-Agent'," +
                    "`expires_at` bigint(20) NOT NULL COMMENT '会话过期时间'," +
                    "`last_seen_at` bigint(20) DEFAULT NULL COMMENT '最后活跃时间'," +
                    "`revoked_at` bigint(20) DEFAULT NULL COMMENT '撤销时间'," +
                    "`revoke_reason` varchar(120) DEFAULT NULL COMMENT '撤销原因'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "KEY `idx_sys_session_user_id` (`user_id`)," +
                    "KEY `idx_sys_session_expires_at` (`expires_at`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业IAM会话表'";
            jdbcTemplate.execute(createSysSessionTable);

            String createSysLoginAuditTable = "CREATE TABLE IF NOT EXISTS `sys_login_audit` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`user_id` bigint(20) DEFAULT NULL COMMENT 'IAM用户ID'," +
                    "`auth_source` varchar(40) DEFAULT NULL COMMENT '认证来源'," +
                    "`login_channel` varchar(40) DEFAULT NULL COMMENT '登录渠道'," +
                    "`principal_name` varchar(120) DEFAULT NULL COMMENT '登录名/昵称'," +
                    "`principal_email` varchar(191) DEFAULT NULL COMMENT '企业邮箱'," +
                    "`dingtalk_union_id` varchar(120) DEFAULT NULL COMMENT '钉钉UnionId'," +
                    "`remote_ip` varchar(80) DEFAULT NULL COMMENT '来源IP'," +
                    "`user_agent` varchar(512) DEFAULT NULL COMMENT 'User-Agent'," +
                    "`success` tinyint(1) DEFAULT 0 COMMENT '是否成功'," +
                    "`result_code` varchar(80) DEFAULT NULL COMMENT '结果编码'," +
                    "`result_message` varchar(255) DEFAULT NULL COMMENT '结果信息'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "KEY `idx_sys_login_audit_user_id` (`user_id`)," +
                    "KEY `idx_sys_login_audit_created_time` (`created_time`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业IAM登录审计表'";
            jdbcTemplate.execute(createSysLoginAuditTable);

            String createOnePanelInstanceTable = "CREATE TABLE IF NOT EXISTS `onepanel_instance` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`name` varchar(120) NOT NULL COMMENT '实例名称'," +
                    "`asset_id` bigint(20) DEFAULT NULL COMMENT '绑定资产ID'," +
                    "`panel_url` varchar(255) DEFAULT NULL COMMENT '1Panel访问地址'," +
                    "`instance_key` varchar(120) NOT NULL COMMENT 'exporter实例Key'," +
                    "`exporter_token_hash` varchar(128) NOT NULL COMMENT 'exporter token哈希'," +
                    "`report_enabled` tinyint(1) DEFAULT 1 COMMENT '是否允许上报'," +
                    "`remark` varchar(255) DEFAULT NULL COMMENT '备注'," +
                    "`token_issued_at` bigint(20) DEFAULT NULL COMMENT 'token签发时间'," +
                    "`last_report_at` bigint(20) DEFAULT NULL COMMENT '最近上报时间'," +
                    "`last_report_status` varchar(40) DEFAULT NULL COMMENT '最近上报状态'," +
                    "`last_report_error` varchar(255) DEFAULT NULL COMMENT '最近上报错误'," +
                    "`last_report_remote_ip` varchar(80) DEFAULT NULL COMMENT '最近上报来源IP'," +
                    "`exporter_version` varchar(80) DEFAULT NULL COMMENT 'exporter版本'," +
                    "`panel_version` varchar(80) DEFAULT NULL COMMENT '1Panel版本'," +
                    "`panel_edition` varchar(80) DEFAULT NULL COMMENT '1Panel版本类型'," +
                    "`app_count` int(10) DEFAULT 0 COMMENT '应用数量'," +
                    "`website_count` int(10) DEFAULT 0 COMMENT '站点数量'," +
                    "`container_count` int(10) DEFAULT 0 COMMENT '容器数量'," +
                    "`cronjob_count` int(10) DEFAULT 0 COMMENT '任务数量'," +
                    "`backup_count` int(10) DEFAULT 0 COMMENT '备份数量'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_onepanel_instance_key` (`instance_key`)," +
                    "KEY `idx_onepanel_instance_asset_id` (`asset_id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='1Panel exporter实例表'";
            jdbcTemplate.execute(createOnePanelInstanceTable);

            String createOnePanelSnapshotLatestTable = "CREATE TABLE IF NOT EXISTS `onepanel_snapshot_latest` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`instance_id` bigint(20) NOT NULL COMMENT '实例ID'," +
                    "`asset_id` bigint(20) DEFAULT NULL COMMENT '绑定资产ID'," +
                    "`report_time` bigint(20) DEFAULT NULL COMMENT '上报时间'," +
                    "`remote_ip` varchar(80) DEFAULT NULL COMMENT '上报来源IP'," +
                    "`exporter_version` varchar(80) DEFAULT NULL COMMENT 'exporter版本'," +
                    "`panel_version` varchar(80) DEFAULT NULL COMMENT '1Panel版本'," +
                    "`panel_edition` varchar(80) DEFAULT NULL COMMENT '1Panel版本类型'," +
                    "`payload_json` longtext DEFAULT NULL COMMENT '最新摘要快照JSON'," +
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_onepanel_snapshot_instance_id` (`instance_id`)," +
                    "KEY `idx_onepanel_snapshot_asset_id` (`asset_id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='1Panel exporter最新快照表'";
            jdbcTemplate.execute(createOnePanelSnapshotLatestTable);

            ensureConfig("iam_auth_mode", "hybrid", "企业IAM认证模式：local_only/dingtalk_only/hybrid");
            ensureConfig("iam_local_admin_enabled", "true", "是否保留本地超级管理员登录入口");
            ensureConfig("dingtalk_oauth_enabled", "false", "是否启用钉钉OAuth登录");
            ensureConfig("dingtalk_client_id", "", "钉钉OAuth Client ID（支持环境变量 DINGTALK_CLIENT_ID 覆盖）");
            ensureConfig("dingtalk_client_secret", "", "钉钉OAuth Client Secret（生产建议使用环境变量 DINGTALK_CLIENT_SECRET）");
            ensureConfig("dingtalk_corp_id", "", "钉钉企业CorpId（支持环境变量 DINGTALK_CORP_ID 覆盖）");
            ensureConfig("dingtalk_redirect_uri", "", "钉钉OAuth回调地址（支持环境变量 DINGTALK_REDIRECT_URI 覆盖）");
            ensureConfig("dingtalk_allowed_org_ids", "[]", "允许登录的钉钉组织ID列表(JSON)，支持环境变量 DINGTALK_ALLOWED_ORG_IDS 覆盖");
            ensureConfig("dingtalk_required_email_domain", "", "钉钉登录用户必须满足的企业邮箱域名，支持环境变量 DINGTALK_REQUIRED_EMAIL_DOMAIN 覆盖");

            // JumpServer integration
            ensureConfig("jumpserver_enabled", "false", "是否启用 JumpServer 堡垒机集成");
            ensureConfig("jumpserver_url", "", "JumpServer 地址 (如 https://jump.example.com)");
            ensureConfig("jumpserver_access_key_id", "", "JumpServer Access Key ID");
            ensureConfig("jumpserver_access_key_secret", "", "JumpServer Access Key Secret");

            ensureIamRole("SUPER_ADMIN", "超级管理员", "企业平台最高权限角色", "system", 1, 0, 1);
            ensureIamRole("DEV_ADMIN", "开发管理员", "开发与运维管理角色", "system", 1, 10, 1);
            ensureIamRole("DEVELOPER", "普通开发", "只读或受限操作的开发角色", "system", 1, 20, 1);
            ensureIamRole("HR", "行政HR", "面向人员与组织信息的角色", "system", 1, 30, 1);
            ensureIamRole("OPS_ASSISTANT", "行政专员", "可新增和编辑但无删除权限的运维角色", "system", 1, 25, 1);

            ensureIamPermission("dashboard.read", "查看首页", "dashboard", "允许查看首页摘要与入口", 10, 1);
            ensureIamPermission("asset.read", "查看服务器资产", "asset", "允许查看服务器资产", 20, 1);
            ensureIamPermission("asset.write", "管理服务器资产", "asset", "允许增删改服务器资产", 21, 1);
            ensureIamPermission("xui.read", "查看X-UI", "xui", "允许查看X-UI与3X-UI登记信息", 30, 1);
            ensureIamPermission("xui.write", "管理X-UI", "xui", "允许维护X-UI与3X-UI实例", 31, 1);
            ensureIamPermission("xui.sync", "同步X-UI", "xui", "允许触发X-UI与3X-UI同步", 32, 1);
            ensureIamPermission("forward.read", "查看转发", "forward", "允许查看转发配置", 40, 1);
            ensureIamPermission("forward.write", "管理转发", "forward", "允许维护转发配置", 41, 1);
            ensureIamPermission("tunnel.read", "查看隧道", "tunnel", "允许查看隧道", 50, 1);
            ensureIamPermission("tunnel.write", "管理隧道", "tunnel", "允许维护隧道", 51, 1);
            ensureIamPermission("node.read", "查看节点", "node", "允许查看节点配置", 55, 1);
            ensureIamPermission("node.write", "管理节点", "node", "允许维护节点配置", 56, 1);
            ensureIamPermission("monitor.read", "查看监控", "monitor", "允许查看监控与探针数据", 60, 1);
            ensureIamPermission("monitor.write", "管理监控", "monitor", "允许管理探针与监控配置", 61, 1);
            ensureIamPermission("probe.read", "查看探针配置", "probe", "允许查看探针配置", 70, 1);
            ensureIamPermission("probe.write", "管理探针配置", "probe", "允许管理探针配置", 71, 1);
            ensureIamPermission("alert.read", "查看告警", "alert", "允许查看告警规则与日志", 80, 1);
            ensureIamPermission("alert.write", "管理告警", "alert", "允许管理告警规则", 81, 1);
            ensureIamPermission("portal.read", "查看自定义导航", "portal", "允许查看导航入口", 90, 1);
            ensureIamPermission("portal.write", "管理自定义导航", "portal", "允许维护导航入口", 91, 1);
            ensureIamPermission("server_dashboard.read", "查看服务器看板", "server_dashboard", "允许查看服务器看板", 100, 1);
            ensureIamPermission("site_config.read", "查看网站配置", "site_config", "允许查看站点配置", 110, 1);
            ensureIamPermission("site_config.write", "管理网站配置", "site_config", "允许修改站点配置", 111, 1);
            ensureIamPermission("protocol.read", "查看协议", "protocol", "允许查看协议字典", 120, 1);
            ensureIamPermission("protocol.write", "管理协议", "protocol", "允许维护协议字典", 121, 1);
            ensureIamPermission("tag.read", "查看标签", "tag", "允许查看标签", 130, 1);
            ensureIamPermission("tag.write", "管理标签", "tag", "允许维护标签", 131, 1);
            ensureIamPermission("speed_limit.read", "查看限速规则", "speed_limit", "允许查看限速规则", 140, 1);
            ensureIamPermission("speed_limit.write", "管理限速规则", "speed_limit", "允许维护限速规则", 141, 1);
            ensureIamPermission("biz_user.read", "查看业务用户", "biz_user", "允许查看现有业务用户模块", 150, 1);
            ensureIamPermission("biz_user.write", "管理业务用户", "biz_user", "允许维护现有业务用户模块", 151, 1);
            ensureIamPermission("iam_user.read", "查看组织用户", "iam_user", "允许查看企业IAM用户", 160, 1);
            ensureIamPermission("iam_user.write", "管理组织用户", "iam_user", "允许维护企业IAM用户", 161, 1);
            ensureIamPermission("iam_role.read", "查看角色", "iam_role", "允许查看企业IAM角色", 170, 1);
            ensureIamPermission("iam_role.write", "管理角色", "iam_role", "允许维护企业IAM角色与授权", 171, 1);
            ensureIamPermission("onepanel.read", "查看1Panel摘要", "onepanel", "允许查看1Panel exporter汇总信息", 180, 1);
            ensureIamPermission("onepanel.write", "管理1Panel实例", "onepanel", "允许维护1Panel exporter实例与token", 181, 1);

            // CRUD 细粒度权限（write 作为聚合权限保留，create/update/delete 可单独授予）
            String[][] crudModules = {
                    {"asset", "服务器资产", "22", "23", "24"},
                    {"xui", "X-UI实例", "33", "34", "35"},
                    {"forward", "转发配置", "42", "43", "44"},
                    {"tunnel", "隧道", "52", "53", "54"},
                    {"node", "节点", "57", "58", "59"},
                    {"monitor", "监控配置", "62", "63", "64"},
                    {"probe", "探针配置", "72", "73", "74"},
                    {"alert", "告警规则", "82", "83", "84"},
                    {"portal", "自定义导航", "92", "93", "94"},
                    {"site_config", "网站配置", "112", "113", "114"},
                    {"protocol", "协议字典", "122", "123", "124"},
                    {"tag", "标签", "132", "133", "134"},
                    {"speed_limit", "限速规则", "142", "143", "144"},
                    {"biz_user", "业务用户", "152", "153", "154"},
                    {"iam_user", "组织用户", "162", "163", "164"},
                    {"iam_role", "角色权限", "172", "173", "174"},
                    {"onepanel", "1Panel实例", "182", "183", "184"},
            };
            for (String[] m : crudModules) {
                ensureIamPermission(m[0] + ".create", "新增" + m[1], m[0], "允许新增" + m[1], Integer.parseInt(m[2]), 1);
                ensureIamPermission(m[0] + ".update", "编辑" + m[1], m[0], "允许编辑" + m[1], Integer.parseInt(m[3]), 1);
                ensureIamPermission(m[0] + ".delete", "删除" + m[1], m[0], "允许删除" + m[1], Integer.parseInt(m[4]), 1);
            }

            // ========== 角色权限分配（数据驱动） ==========

            // 所有业务模块
            String[] allModules = {"asset", "xui", "forward", "tunnel", "node", "monitor",
                    "probe", "alert", "portal", "site_config", "protocol", "tag",
                    "speed_limit", "biz_user", "iam_user", "iam_role", "onepanel"};

            // --- SUPER_ADMIN: 全部权限 (admin bypass 已覆盖, 这里显式授予用于 UI 展示) ---
            ensureIamRolePermission("SUPER_ADMIN", "dashboard.read");
            ensureIamRolePermission("SUPER_ADMIN", "server_dashboard.read");
            ensureIamRolePermission("SUPER_ADMIN", "xui.sync");
            for (String m : allModules) {
                ensureIamRolePermission("SUPER_ADMIN", m + ".read");
                ensureIamRolePermission("SUPER_ADMIN", m + ".write");
            }

            // --- DEV_ADMIN: 核心运维全权限 + 配置/用户管理只读 ---
            ensureIamRolePermission("DEV_ADMIN", "dashboard.read");
            ensureIamRolePermission("DEV_ADMIN", "server_dashboard.read");
            ensureIamRolePermission("DEV_ADMIN", "xui.sync");
            // 全 CRUD 模块
            String[] devFullModules = {"asset", "xui", "forward", "tunnel", "node", "monitor",
                    "probe", "alert", "portal", "onepanel"};
            for (String m : devFullModules) {
                ensureIamRolePermission("DEV_ADMIN", m + ".read");
                ensureIamRolePermission("DEV_ADMIN", m + ".write");
            }
            // 只读模块
            String[] devReadOnlyModules = {"site_config", "protocol", "tag", "speed_limit",
                    "biz_user", "iam_user", "iam_role"};
            for (String m : devReadOnlyModules) {
                ensureIamRolePermission("DEV_ADMIN", m + ".read");
            }

            // --- OPS_ASSISTANT (行政专员): 全模块 read + create + update，无 delete ---
            ensureIamRolePermission("OPS_ASSISTANT", "dashboard.read");
            ensureIamRolePermission("OPS_ASSISTANT", "server_dashboard.read");
            String[] opsFullReadModules = {"asset", "xui", "forward", "tunnel", "node", "monitor",
                    "probe", "alert", "portal", "site_config", "protocol", "tag",
                    "speed_limit", "biz_user", "onepanel"};
            for (String m : opsFullReadModules) {
                ensureIamRolePermission("OPS_ASSISTANT", m + ".read");
            }
            String[] opsCuModules = {"asset", "xui", "forward", "tunnel", "node", "monitor",
                    "probe", "alert", "portal", "protocol", "tag", "speed_limit", "onepanel"};
            for (String m : opsCuModules) {
                ensureIamRolePermission("OPS_ASSISTANT", m + ".create");
                ensureIamRolePermission("OPS_ASSISTANT", m + ".update");
            }

            // --- DEVELOPER (普通开发): 核心模块只读 ---
            ensureIamRolePermission("DEVELOPER", "dashboard.read");
            ensureIamRolePermission("DEVELOPER", "server_dashboard.read");
            String[] devReadModules = {"asset", "xui", "forward", "tunnel", "node", "monitor",
                    "probe", "alert", "portal", "onepanel"};
            for (String m : devReadModules) {
                ensureIamRolePermission("DEVELOPER", m + ".read");
            }

            // --- HR (行政HR): 仅首页 + 用户相关 ---
            ensureIamRolePermission("HR", "dashboard.read");
            ensureIamRolePermission("HR", "iam_user.read");
            ensureIamRolePermission("HR", "biz_user.read");

            log.info("[DatabaseInit] 企业IAM基础表与默认角色权限初始化成功");
        } catch (Exception e) {
            log.error("[DatabaseInit] 企业IAM基础表初始化失败: {}", e.getMessage());
        }

        // ==================== Phase 5: 新增功能模块表 ====================

        // 5.1 审计日志表
        try {
            jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS `audit_log` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`username` varchar(100) DEFAULT NULL COMMENT '用户名快照'," +
                    "`action` varchar(50) NOT NULL COMMENT 'create/update/delete/login/logout/export/import'," +
                    "`module` varchar(50) NOT NULL COMMENT 'asset/forward/tunnel/node/xui/user/iam/alert/backup'," +
                    "`target_id` bigint(20) DEFAULT NULL COMMENT '操作目标ID'," +
                    "`target_name` varchar(200) DEFAULT NULL COMMENT '目标名称快照'," +
                    "`detail` text DEFAULT NULL COMMENT 'JSON变更摘要'," +
                    "`ip` varchar(64) DEFAULT NULL COMMENT '操作IP'," +
                    "`user_agent` varchar(500) DEFAULT NULL," +
                    "`result` varchar(20) DEFAULT 'success' COMMENT 'success/fail'," +
                    "`error_msg` varchar(500) DEFAULT NULL," +
                    "`created_time` bigint(20) NOT NULL," +
                    "`updated_time` bigint(20) DEFAULT NULL," +
                    "`status` int(10) DEFAULT 0," +
                    "PRIMARY KEY (`id`)," +
                    "KEY `idx_module_action` (`module`,`action`)," +
                    "KEY `idx_created_time` (`created_time`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作审计日志'");
            log.info("[DatabaseInit] audit_log 表校验成功");
        } catch (Exception e) { log.error("[DatabaseInit] audit_log 表创建失败: {}", e.getMessage()); }

        // 5.2 到期提醒配置表
        try {
            jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS `expiry_reminder_config` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`enabled` tinyint(1) DEFAULT 1," +
                    "`remind_days_before` varchar(100) DEFAULT '30,14,7,3,1' COMMENT '提前天数(逗号分隔)'," +
                    "`notify_channel` varchar(50) DEFAULT 'in_app'," +
                    "`notify_target` varchar(500) DEFAULT NULL," +
                    "`last_check_at` bigint(20) DEFAULT NULL," +
                    "`created_time` bigint(20) NOT NULL," +
                    "`updated_time` bigint(20) DEFAULT NULL," +
                    "`status` int(10) DEFAULT 0," +
                    "PRIMARY KEY (`id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='到期提醒配置'");
            log.info("[DatabaseInit] expiry_reminder_config 表校验成功");
        } catch (Exception e) { log.error("[DatabaseInit] expiry_reminder_config 表创建失败: {}", e.getMessage()); }

        // 5.3 站内通知消息表
        try {
            jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS `notification` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`user_id` bigint(20) DEFAULT NULL COMMENT '目标用户ID,NULL=广播'," +
                    "`title` varchar(200) NOT NULL," +
                    "`content` text DEFAULT NULL," +
                    "`type` varchar(30) NOT NULL COMMENT 'expiry/alert/system/backup/ip_check/traffic'," +
                    "`severity` varchar(20) DEFAULT 'info'," +
                    "`source_module` varchar(50) DEFAULT NULL," +
                    "`source_id` bigint(20) DEFAULT NULL," +
                    "`read_status` tinyint(1) DEFAULT 0 COMMENT '0未读1已读'," +
                    "`read_at` bigint(20) DEFAULT NULL," +
                    "`created_time` bigint(20) NOT NULL," +
                    "`updated_time` bigint(20) DEFAULT NULL," +
                    "`status` int(10) DEFAULT 0," +
                    "PRIMARY KEY (`id`)," +
                    "KEY `idx_user_read` (`user_id`,`read_status`)," +
                    "KEY `idx_type` (`type`)," +
                    "KEY `idx_created_time` (`created_time`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内通知消息'");
            log.info("[DatabaseInit] notification 表校验成功");
        } catch (Exception e) { log.error("[DatabaseInit] notification 表创建失败: {}", e.getMessage()); }

        // 5.4 通知渠道配置表
        try {
            jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS `notify_channel` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`name` varchar(100) NOT NULL COMMENT '渠道名称'," +
                    "`type` varchar(30) NOT NULL COMMENT 'email/telegram/webhook/dingtalk'," +
                    "`config_json` text NOT NULL COMMENT 'JSON配置'," +
                    "`enabled` tinyint(1) DEFAULT 1," +
                    "`test_status` varchar(20) DEFAULT NULL COMMENT 'success/fail/untested'," +
                    "`last_test_at` bigint(20) DEFAULT NULL," +
                    "`created_time` bigint(20) NOT NULL," +
                    "`updated_time` bigint(20) DEFAULT NULL," +
                    "`status` int(10) DEFAULT 0," +
                    "PRIMARY KEY (`id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知渠道配置'");
            log.info("[DatabaseInit] notify_channel 表校验成功");
        } catch (Exception e) { log.error("[DatabaseInit] notify_channel 表创建失败: {}", e.getMessage()); }

        // 5.5 通知策略组表
        try {
            jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS `notify_policy` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`name` varchar(100) NOT NULL COMMENT '策略名称'," +
                    "`description` varchar(500) DEFAULT NULL," +
                    "`event_types` varchar(500) NOT NULL COMMENT '触发事件(逗号分隔)'," +
                    "`severity_filter` varchar(100) DEFAULT 'info,warning,critical'," +
                    "`channel_ids` varchar(200) NOT NULL COMMENT '关联渠道ID(逗号分隔)'," +
                    "`recipient_user_ids` varchar(500) DEFAULT NULL COMMENT '接收用户ID,NULL=所有管理员'," +
                    "`enabled` tinyint(1) DEFAULT 1," +
                    "`cooldown_minutes` int(10) DEFAULT 0," +
                    "`created_time` bigint(20) NOT NULL," +
                    "`updated_time` bigint(20) DEFAULT NULL," +
                    "`status` int(10) DEFAULT 0," +
                    "PRIMARY KEY (`id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知策略组'");
            log.info("[DatabaseInit] notify_policy 表校验成功");
        } catch (Exception e) { log.error("[DatabaseInit] notify_policy 表创建失败: {}", e.getMessage()); }

        // 5.6 服务器分组表
        try {
            jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS `server_group` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`name` varchar(100) NOT NULL," +
                    "`description` varchar(500) DEFAULT NULL," +
                    "`group_type` varchar(30) DEFAULT 'business' COMMENT 'business/customer/project/region'," +
                    "`color` varchar(30) DEFAULT NULL," +
                    "`icon` varchar(50) DEFAULT NULL," +
                    "`parent_id` bigint(20) DEFAULT NULL," +
                    "`sort_order` int(10) DEFAULT 0," +
                    "`created_time` bigint(20) NOT NULL," +
                    "`updated_time` bigint(20) DEFAULT NULL," +
                    "`status` int(10) DEFAULT 0," +
                    "PRIMARY KEY (`id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='服务器分组'");
            log.info("[DatabaseInit] server_group 表校验成功");
        } catch (Exception e) { log.error("[DatabaseInit] server_group 表创建失败: {}", e.getMessage()); }

        // 5.7 分组成员关系表
        try {
            jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS `server_group_member` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`group_id` bigint(20) NOT NULL," +
                    "`asset_id` bigint(20) NOT NULL," +
                    "`role_in_group` varchar(30) DEFAULT 'member' COMMENT 'entry/relay/landing/member'," +
                    "`sort_order` int(10) DEFAULT 0," +
                    "`created_time` bigint(20) NOT NULL," +
                    "`updated_time` bigint(20) DEFAULT NULL," +
                    "`status` int(10) DEFAULT 0," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_group_asset` (`group_id`,`asset_id`)," +
                    "KEY `idx_asset` (`asset_id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分组成员关系'");
            log.info("[DatabaseInit] server_group_member 表校验成功");
        } catch (Exception e) { log.error("[DatabaseInit] server_group_member 表创建失败: {}", e.getMessage()); }

        // 5.8 备份记录表
        try {
            jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS `backup_record` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`name` varchar(200) NOT NULL COMMENT '备份名称'," +
                    "`type` varchar(30) NOT NULL COMMENT 'gost_config/xui_config/database/full'," +
                    "`source_id` bigint(20) DEFAULT NULL," +
                    "`source_name` varchar(100) DEFAULT NULL," +
                    "`file_path` varchar(500) DEFAULT NULL," +
                    "`file_size` bigint(20) DEFAULT NULL," +
                    "`backup_data` longtext DEFAULT NULL COMMENT 'JSON备份数据'," +
                    "`trigger_type` varchar(20) DEFAULT 'manual' COMMENT 'manual/scheduled'," +
                    "`backup_status` varchar(20) DEFAULT 'success'," +
                    "`error_msg` varchar(500) DEFAULT NULL," +
                    "`remark` varchar(500) DEFAULT NULL," +
                    "`created_time` bigint(20) NOT NULL," +
                    "`updated_time` bigint(20) DEFAULT NULL," +
                    "`status` int(10) DEFAULT 0," +
                    "PRIMARY KEY (`id`)," +
                    "KEY `idx_type` (`type`)," +
                    "KEY `idx_created_time` (`created_time`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='备份记录'");
            log.info("[DatabaseInit] backup_record 表校验成功");
        } catch (Exception e) { log.error("[DatabaseInit] backup_record 表创建失败: {}", e.getMessage()); }

        // 5.9 备份计划表
        try {
            jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS `backup_schedule` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`name` varchar(100) NOT NULL," +
                    "`type` varchar(30) NOT NULL COMMENT 'gost_config/xui_config/database'," +
                    "`source_id` bigint(20) DEFAULT NULL," +
                    "`cron_expr` varchar(50) NOT NULL," +
                    "`retention_count` int(10) DEFAULT 10," +
                    "`enabled` tinyint(1) DEFAULT 1," +
                    "`last_run_at` bigint(20) DEFAULT NULL," +
                    "`last_run_status` varchar(20) DEFAULT NULL," +
                    "`created_time` bigint(20) NOT NULL," +
                    "`updated_time` bigint(20) DEFAULT NULL," +
                    "`status` int(10) DEFAULT 0," +
                    "PRIMARY KEY (`id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='备份计划'");
            log.info("[DatabaseInit] backup_schedule 表校验成功");
        } catch (Exception e) { log.error("[DatabaseInit] backup_schedule 表创建失败: {}", e.getMessage()); }

        // 5.10 IP质量检测记录表
        try {
            jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS `ip_check_record` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`ip` varchar(64) NOT NULL," +
                    "`asset_id` bigint(20) DEFAULT NULL," +
                    "`asset_name` varchar(100) DEFAULT NULL," +
                    "`check_type` varchar(30) NOT NULL COMMENT 'blacklist/latency/full'," +
                    "`blacklist_result` text DEFAULT NULL COMMENT 'JSON结果'," +
                    "`blacklist_score` int(10) DEFAULT NULL COMMENT '0-100越高越差'," +
                    "`geo_info` text DEFAULT NULL COMMENT 'JSON地理信息'," +
                    "`port_check` text DEFAULT NULL COMMENT 'JSON端口检测'," +
                    "`overall_status` varchar(20) DEFAULT NULL COMMENT 'clean/suspicious/blocked'," +
                    "`created_time` bigint(20) NOT NULL," +
                    "`updated_time` bigint(20) DEFAULT NULL," +
                    "`status` int(10) DEFAULT 0," +
                    "PRIMARY KEY (`id`)," +
                    "KEY `idx_ip` (`ip`)," +
                    "KEY `idx_asset` (`asset_id`)," +
                    "KEY `idx_created_time` (`created_time`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='IP质量检测记录'");
            log.info("[DatabaseInit] ip_check_record 表校验成功");
        } catch (Exception e) { log.error("[DatabaseInit] ip_check_record 表创建失败: {}", e.getMessage()); }

        // 5.11 延迟矩阵表
        try {
            jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS `latency_matrix` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`from_region` varchar(50) NOT NULL," +
                    "`from_asset_id` bigint(20) DEFAULT NULL," +
                    "`to_ip` varchar(64) NOT NULL," +
                    "`to_asset_id` bigint(20) DEFAULT NULL," +
                    "`latency_ms` double DEFAULT NULL," +
                    "`packet_loss` double DEFAULT NULL," +
                    "`jitter_ms` double DEFAULT NULL," +
                    "`test_method` varchar(20) DEFAULT 'ping'," +
                    "`created_time` bigint(20) NOT NULL," +
                    "`updated_time` bigint(20) DEFAULT NULL," +
                    "`status` int(10) DEFAULT 0," +
                    "PRIMARY KEY (`id`)," +
                    "KEY `idx_to_ip` (`to_ip`)," +
                    "KEY `idx_created_time` (`created_time`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='延迟矩阵'");
            log.info("[DatabaseInit] latency_matrix 表校验成功");
        } catch (Exception e) { log.error("[DatabaseInit] latency_matrix 表创建失败: {}", e.getMessage()); }

        // 5.12 小时级流量统计表
        try {
            jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS `traffic_hourly_stats` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`dimension_type` varchar(20) NOT NULL COMMENT 'user/forward/tunnel/protocol/asset'," +
                    "`dimension_id` bigint(20) NOT NULL," +
                    "`dimension_name` varchar(100) DEFAULT NULL," +
                    "`hour_key` varchar(13) NOT NULL COMMENT '2026-03-09-14'," +
                    "`upload_bytes` bigint(20) DEFAULT 0," +
                    "`download_bytes` bigint(20) DEFAULT 0," +
                    "`total_bytes` bigint(20) DEFAULT 0," +
                    "`peak_rate_bps` bigint(20) DEFAULT NULL," +
                    "`created_time` bigint(20) NOT NULL," +
                    "`updated_time` bigint(20) DEFAULT NULL," +
                    "`status` int(10) DEFAULT 0," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_dimension_hour` (`dimension_type`,`dimension_id`,`hour_key`)," +
                    "KEY `idx_hour_key` (`hour_key`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='小时级流量统计'");
            log.info("[DatabaseInit] traffic_hourly_stats 表校验成功");
        } catch (Exception e) { log.error("[DatabaseInit] traffic_hourly_stats 表创建失败: {}", e.getMessage()); }

        // 5.13 流量异常事件表
        try {
            jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS `traffic_anomaly` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`dimension_type` varchar(20) NOT NULL COMMENT 'user/forward/tunnel'," +
                    "`dimension_id` bigint(20) NOT NULL," +
                    "`dimension_name` varchar(100) DEFAULT NULL," +
                    "`anomaly_type` varchar(30) NOT NULL COMMENT 'spike/drop/unusual_pattern/quota_exceed'," +
                    "`severity` varchar(20) DEFAULT 'warning'," +
                    "`description` varchar(500) DEFAULT NULL," +
                    "`current_value` bigint(20) DEFAULT NULL," +
                    "`baseline_value` bigint(20) DEFAULT NULL," +
                    "`deviation_ratio` double DEFAULT NULL," +
                    "`acknowledged` tinyint(1) DEFAULT 0," +
                    "`created_time` bigint(20) NOT NULL," +
                    "`updated_time` bigint(20) DEFAULT NULL," +
                    "`status` int(10) DEFAULT 0," +
                    "PRIMARY KEY (`id`)," +
                    "KEY `idx_dimension` (`dimension_type`,`dimension_id`)," +
                    "KEY `idx_created_time` (`created_time`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流量异常事件'");
            log.info("[DatabaseInit] traffic_anomaly 表校验成功");
        } catch (Exception e) { log.error("[DatabaseInit] traffic_anomaly 表创建失败: {}", e.getMessage()); }

        // 5.14 新模块权限种子数据
        try {
            ensureIamPermission("audit.read", "查看审计日志", "audit", "允许查看操作审计日志", 180, 1);
            ensureIamPermission("audit.write", "管理审计日志", "audit", "允许清理审计日志", 181, 1);
            ensureIamPermission("notification.read", "查看通知", "notification", "允许查看站内通知", 190, 1);
            ensureIamPermission("notification.write", "管理通知", "notification", "允许管理通知渠道与策略", 191, 1);
            ensureIamPermission("topology.read", "查看拓扑", "topology", "允许查看网络拓扑与分组", 200, 1);
            ensureIamPermission("topology.write", "管理拓扑", "topology", "允许管理服务器分组", 201, 1);
            ensureIamPermission("backup.read", "查看备份", "backup", "允许查看备份记录", 210, 1);
            ensureIamPermission("backup.write", "管理备份", "backup", "允许执行备份与恢复操作", 211, 1);
            ensureIamPermission("ip_quality.read", "查看IP质量", "ip_quality", "允许查看IP检测结果", 220, 1);
            ensureIamPermission("ip_quality.write", "管理IP质量", "ip_quality", "允许执行IP检测", 221, 1);
            ensureIamPermission("traffic_analysis.read", "查看流量分析", "traffic_analysis", "允许查看流量分析面板", 230, 1);

            // Phase 5 CRUD 细粒度权限
            String[][] phase5CrudModules = {
                    {"audit", "审计日志", "182", "183", "184"},
                    {"notification", "通知", "192", "193", "194"},
                    {"topology", "拓扑", "202", "203", "204"},
                    {"backup", "备份", "212", "213", "214"},
                    {"ip_quality", "IP质量", "222", "223", "224"},
            };
            for (String[] m : phase5CrudModules) {
                ensureIamPermission(m[0] + ".create", "新增" + m[1], m[0], "允许新增" + m[1], Integer.parseInt(m[2]), 1);
                ensureIamPermission(m[0] + ".update", "编辑" + m[1], m[0], "允许编辑" + m[1], Integer.parseInt(m[3]), 1);
                ensureIamPermission(m[0] + ".delete", "删除" + m[1], m[0], "允许删除" + m[1], Integer.parseInt(m[4]), 1);
            }

            // SUPER_ADMIN gets all new permissions
            String[] newPerms = {"audit.read","audit.write","notification.read","notification.write",
                    "topology.read","topology.write","backup.read","backup.write",
                    "ip_quality.read","ip_quality.write","traffic_analysis.read"};
            for (String p : newPerms) {
                ensureIamRolePermission("SUPER_ADMIN", p);
            }
            // DEV_ADMIN gets read + some write
            String[] devPerms = {"audit.read","notification.read","notification.write",
                    "topology.read","topology.write","backup.read","backup.write",
                    "ip_quality.read","ip_quality.write","traffic_analysis.read"};
            for (String p : devPerms) {
                ensureIamRolePermission("DEV_ADMIN", p);
            }
            // DEVELOPER gets read only
            String[] devReadPerms = {"audit.read","notification.read","topology.read","backup.read","ip_quality.read","traffic_analysis.read"};
            for (String p : devReadPerms) {
                ensureIamRolePermission("DEVELOPER", p);
            }

            log.info("[DatabaseInit] Phase 5 新模块权限种子数据初始化成功");
        } catch (Exception e) { log.error("[DatabaseInit] Phase 5 权限种子数据初始化失败: {}", e.getMessage()); }

        log.info(">>>>>> [DatabaseInit] 数据库版本同步流程执行完毕 <<<<<<");
    }

    private void updateColumn(String tableName, String columnName, String definition) {
        try {
            // Check if column exists
            String checkSql = String.format(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = '%s' AND column_name = '%s' AND table_schema = DATABASE()",
                tableName, columnName
            );
            Integer count = jdbcTemplate.queryForObject(checkSql, Integer.class);
            if (count != null && count == 0) {
                String alterSql = String.format("ALTER TABLE `%s` ADD COLUMN `%s` %s", tableName, columnName, definition);
                jdbcTemplate.execute(alterSql);
                log.info("[DatabaseInit] 成功向表 {} 添加字段 {}", tableName, columnName);
            }
        } catch (Exception e) {
            log.warn("[DatabaseInit] 尝试更新表 {} 字段 {} 时发生非关键性异常: {}", tableName, columnName, e.getMessage());
        }
    }

    private void modifyColumn(String tableName, String columnName, String definition) {
        try {
            String alterSql = String.format("ALTER TABLE `%s` MODIFY COLUMN `%s` %s", tableName, columnName, definition);
            jdbcTemplate.execute(alterSql);
            log.info("[DatabaseInit] 成功调整表 {} 字段 {} 的类型/定义", tableName, columnName);
        } catch (Exception e) {
            log.warn("[DatabaseInit] 尝试调整表 {} 字段 {} 定义时发生非关键性异常: {}", tableName, columnName, e.getMessage());
        }
    }

    private void ensureConfig(String name, String value, String description) {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM `vite_config` WHERE `name` = ?",
                    Integer.class,
                    name
            );
            if (count != null && count > 0) {
                return;
            }
            jdbcTemplate.update(
                    "INSERT INTO `vite_config` (`name`, `value`, `description`, `time`) VALUES (?, ?, ?, ?)",
                    name,
                    value,
                    description,
                    System.currentTimeMillis()
            );
        } catch (Exception e) {
            log.warn("[DatabaseInit] 初始化配置 {} 时发生非关键性异常: {}", name, e.getMessage());
        }
    }

    private void bootstrapAssetHostsFromXuiInstances() {
        jdbcTemplate.execute(
                "INSERT INTO `asset_host` (`name`, `label`, `created_time`, `updated_time`, `status`) " +
                        "SELECT DISTINCT TRIM(`host_label`), TRIM(`host_label`), UNIX_TIMESTAMP() * 1000, UNIX_TIMESTAMP() * 1000, 0 " +
                        "FROM `xui_instance` " +
                        "WHERE `host_label` IS NOT NULL AND TRIM(`host_label`) <> '' " +
                        "AND TRIM(`host_label`) NOT IN (SELECT `name` FROM `asset_host`)"
        );

        jdbcTemplate.execute(
                "UPDATE `xui_instance` xi " +
                        "JOIN `asset_host` ah ON ah.`name` = TRIM(xi.`host_label`) " +
                        "SET xi.`asset_id` = ah.`id` " +
                        "WHERE (xi.`asset_id` IS NULL OR xi.`asset_id` = 0) " +
                        "AND xi.`host_label` IS NOT NULL AND TRIM(xi.`host_label`) <> ''"
        );
    }

    private void ensureIamRole(String code, String name, String description, String roleScope, int builtin, int sortOrder, int enabled) {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM `sys_role` WHERE `code` = ?",
                    Integer.class,
                    code
            );
            if (count != null && count > 0) {
                return;
            }
            long now = System.currentTimeMillis();
            jdbcTemplate.update(
                    "INSERT INTO `sys_role` (`code`, `name`, `description`, `role_scope`, `builtin`, `sort_order`, `enabled`, `created_time`, `updated_time`, `status`) " +
                            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
                    code, name, description, roleScope, builtin, sortOrder, enabled, now, now
            );
        } catch (Exception e) {
            log.warn("[DatabaseInit] 初始化IAM角色 {} 时发生非关键性异常: {}", code, e.getMessage());
        }
    }

    private void ensureIamPermission(String code, String name, String moduleKey, String description, int sortOrder, int enabled) {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM `sys_permission` WHERE `code` = ?",
                    Integer.class,
                    code
            );
            if (count != null && count > 0) {
                return;
            }
            long now = System.currentTimeMillis();
            jdbcTemplate.update(
                    "INSERT INTO `sys_permission` (`code`, `name`, `module_key`, `description`, `sort_order`, `enabled`, `created_time`, `updated_time`, `status`) " +
                            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
                    code, name, moduleKey, description, sortOrder, enabled, now, now
            );
        } catch (Exception e) {
            log.warn("[DatabaseInit] 初始化IAM权限 {} 时发生非关键性异常: {}", code, e.getMessage());
        }
    }

    private void ensureIamRolePermission(String roleCode, String permissionCode) {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) " +
                            "FROM `sys_role_permission` rp " +
                            "JOIN `sys_role` r ON r.`id` = rp.`role_id` " +
                            "JOIN `sys_permission` p ON p.`id` = rp.`permission_id` " +
                            "WHERE r.`code` = ? AND p.`code` = ?",
                    Integer.class,
                    roleCode,
                    permissionCode
            );
            if (count != null && count > 0) {
                return;
            }
            long now = System.currentTimeMillis();
            jdbcTemplate.update(
                    "INSERT INTO `sys_role_permission` (`role_id`, `permission_id`, `created_time`, `updated_time`, `status`) " +
                            "SELECT r.`id`, p.`id`, ?, ?, 0 " +
                            "FROM `sys_role` r JOIN `sys_permission` p " +
                            "WHERE r.`code` = ? AND p.`code` = ? LIMIT 1",
                    now,
                    now,
                    roleCode,
                    permissionCode
            );
        } catch (Exception e) {
            log.warn("[DatabaseInit] 初始化IAM角色权限 {} -> {} 时发生非关键性异常: {}", roleCode, permissionCode, e.getMessage());
        }
    }
}
