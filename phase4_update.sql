-- Phase 4: Forward Protocol and Tag System Updates
-- Apply this against DEV and PROD environments.

-- 1. Create Protocol Table
CREATE TABLE IF NOT EXISTS `protocol` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '协议名称 (如: Socks, Vless, Vmess, Trojan)',
  `description` varchar(255) DEFAULT NULL COMMENT '描述',
  `config_schema` text DEFAULT NULL COMMENT 'JSON Schema',
  `created_time` bigint(20) NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='转发协议表';

-- Insert default protocols
INSERT IGNORE INTO `protocol` (`id`, `name`, `description`, `created_time`) VALUES
(1, 'TCP', '标准TCP转发', UNIX_TIMESTAMP() * 1000),
(2, 'UDP', '标准UDP转发', UNIX_TIMESTAMP() * 1000),
(3, 'Socks5', 'Socks5代理协议', UNIX_TIMESTAMP() * 1000),
(4, 'Vless', 'Vless代理协议', UNIX_TIMESTAMP() * 1000),
(5, 'Vmess', 'Vmess代理协议', UNIX_TIMESTAMP() * 1000),
(6, 'Trojan', 'Trojan代理协议', UNIX_TIMESTAMP() * 1000),
(7, 'HTTP', 'HTTP代理协议', UNIX_TIMESTAMP() * 1000);

-- 2. Create Tag Table
CREATE TABLE IF NOT EXISTS `tag` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL COMMENT '标签名称',
  `color` varchar(50) DEFAULT 'primary' COMMENT '标签颜色款式 (如 primary, secondary, success, danger, warning 等)',
  `created_time` bigint(20) NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='标签管理表';

-- Insert default tags
INSERT IGNORE INTO `tag` (`id`, `name`, `color`, `created_time`) VALUES
(1, '游戏加速', 'success', UNIX_TIMESTAMP() * 1000),
(2, '海外节点', 'primary', UNIX_TIMESTAMP() * 1000),
(3, '内网穿透', 'warning', UNIX_TIMESTAMP() * 1000),
(4, '测试节点', 'default', UNIX_TIMESTAMP() * 1000);

-- 3. Modify Forward Table 
-- Adding protocol_id and tag_ids
ALTER TABLE `forward`
ADD COLUMN `protocol_id` int(10) DEFAULT NULL COMMENT '关联的协议ID',
ADD COLUMN `tag_ids` varchar(255) DEFAULT NULL COMMENT '关联的标签ID列表(逗号分隔)';
