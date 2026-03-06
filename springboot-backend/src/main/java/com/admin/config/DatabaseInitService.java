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
        log.info("开始检查并自动更新数据库表结构（Phase 4）...");

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
            log.info("数据库校验: protocol 表检查/创建成功");
            
            // Try to insert defaults (IGNORE prevents duplicate key errors)
            jdbcTemplate.execute("INSERT IGNORE INTO `protocol` (`id`, `name`, `description`, `created_time`) VALUES " +
                    "(1, 'TCP', '标准TCP转发', UNIX_TIMESTAMP() * 1000), " +
                    "(2, 'UDP', '标准UDP转发', UNIX_TIMESTAMP() * 1000), " +
                    "(3, 'Socks5', 'Socks5代理协议', UNIX_TIMESTAMP() * 1000), " +
                    "(4, 'Vless', 'Vless代理协议', UNIX_TIMESTAMP() * 1000), " +
                    "(5, 'Vmess', 'Vmess代理协议', UNIX_TIMESTAMP() * 1000), " +
                    "(6, 'Trojan', 'Trojan代理协议', UNIX_TIMESTAMP() * 1000), " +
                    "(7, 'HTTP', 'HTTP代理协议', UNIX_TIMESTAMP() * 1000)");
        } catch (Exception e) {
            log.error("数据库升级异常 (protocol 表): {}", e.getMessage());
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
            log.info("数据库校验: tag 表检查/创建成功");

            jdbcTemplate.execute("INSERT IGNORE INTO `tag` (`id`, `name`, `color`, `created_time`) VALUES " +
                    "(1, '游戏加速', 'success', UNIX_TIMESTAMP() * 1000), " +
                    "(2, '海外节点', 'primary', UNIX_TIMESTAMP() * 1000), " +
                    "(3, '内网穿透', 'warning', UNIX_TIMESTAMP() * 1000), " +
                    "(4, '测试节点', 'default', UNIX_TIMESTAMP() * 1000)");
        } catch (Exception e) {
            log.error("数据库升级异常 (tag 表): {}", e.getMessage());
        }

        // 3. Modify Forward Table 
        // Adding protocol_id
        try {
            jdbcTemplate.execute("ALTER TABLE `forward` ADD COLUMN `protocol_id` int(10) DEFAULT NULL COMMENT '关联的协议ID'");
            log.info("数据库升级: 已在 forward 表添加 protocol_id 列");
        } catch (Exception e) {
            // 列可能已存在，忽略错误
        }

        // Adding tag_ids
        try {
            jdbcTemplate.execute("ALTER TABLE `forward` ADD COLUMN `tag_ids` varchar(255) DEFAULT NULL COMMENT '关联的标签ID列表(逗号分隔)'");
            log.info("数据库升级: 已在 forward 表添加 tag_ids 列");
        } catch (Exception e) {
            // 列可能已存在，忽略错误
        }
    }
}
