package com.admin.config;

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
        log.info(">>>>>> [DatabaseInit] 启动全自动数据库版本检测与同步 (Phase 4) <<<<<<");

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

        // 4. Create Diagnosis Record Table
        try {
            String createDiagnosisTable = "CREATE TABLE IF NOT EXISTS `diagnosis_record` (" +
                    "`id` int(10) NOT NULL AUTO_INCREMENT," +
                    "`target_type` varchar(20) DEFAULT NULL COMMENT 'forward 或 tunnel'," +
                    "`target_id` int(10) DEFAULT NULL COMMENT '关联ID'," +
                    "`target_name` varchar(100) DEFAULT NULL COMMENT '名称快照'," +
                    "`overall_success` tinyint(1) DEFAULT NULL COMMENT '整体是否成功'," +
                    "`results_json` text DEFAULT NULL COMMENT '详细结果'," +
                    "`average_time` double DEFAULT NULL COMMENT '延迟'," +
                    "`packet_loss` double DEFAULT NULL COMMENT '丢包率'," +
                    "`created_time` bigint(20) DEFAULT NULL COMMENT '时间戳'," +
                    "PRIMARY KEY (`id`)," +
                    "KEY `idx_target` (`target_type`, `target_id`)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='诊断历史记录表'";
            jdbcTemplate.execute(createDiagnosisTable);
            log.info("[DatabaseInit] DiagnosisRecord 表校验成功");
        } catch (Exception e) {
            log.error("[DatabaseInit] DiagnosisRecord 表创建失败: {}", e.getMessage());
        }

        // 5. Initialize Diagnosis Configurations in vite_config
        try {
            jdbcTemplate.execute("INSERT IGNORE INTO `vite_config` (`name`, `value`, `description`) VALUES " +
                    "('auto_diagnosis_enabled', 'true', '是否开启后台自动诊断任务'), " +
                    "('auto_diagnosis_interval', '30', '自动诊断间隔时间(分钟)')");
            log.info("[DatabaseInit] 自动诊断配置项初始化成功");
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
}
