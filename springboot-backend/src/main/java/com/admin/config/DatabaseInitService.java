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
            log.info("[DatabaseInit] 自动诊断与告警配置项初始化成功");
        } catch (Exception e) {
            log.warn("[DatabaseInit] 尝试初始化诊断配置项时发生异常: {}", e.getMessage());
        }

        // 5. Create X-UI integration tables
        try {
            String createXuiInstanceTable = "CREATE TABLE IF NOT EXISTS `xui_instance` (" +
                    "`id` bigint(20) NOT NULL AUTO_INCREMENT," +
                    "`name` varchar(120) NOT NULL COMMENT '实例名称'," +
                    "`base_url` varchar(255) NOT NULL COMMENT 'x-ui 面板地址'," +
                    "`web_base_path` varchar(120) DEFAULT '/' COMMENT 'x-ui Web Base Path'," +
                    "`username` varchar(120) NOT NULL COMMENT '登录用户名'," +
                    "`encrypted_password` text NOT NULL COMMENT '加密后的登录密码'," +
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
                    "`created_time` bigint(20) NOT NULL COMMENT '创建时间'," +
                    "`updated_time` bigint(20) NOT NULL COMMENT '更新时间'," +
                    "`status` int(10) DEFAULT 0 COMMENT '状态（0：正常，1：删除）'," +
                    "PRIMARY KEY (`id`)," +
                    "UNIQUE KEY `uk_xui_instance_name` (`name`)," +
                    "UNIQUE KEY `uk_xui_instance_traffic_token` (`traffic_token`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='x-ui 实例管理表'";
            jdbcTemplate.execute(createXuiInstanceTable);

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
}
