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
