# Flux Panel Yoga — 备份、安全与容灾指南

> 生成时间: 2026-03-08 | 适用版本: v1.4.7+

---

## 一、数据存储全景

### 1.1 MySQL 表清单（共 17 张）

| 分类 | 表名 | 数据性质 | 丢失影响 | 可从外部恢复？ |
|---|---|---|---|---|
| **核心账号** | `user` | 管理员账号/密码/2FA | 致命 | ✗ |
| **站点配置** | `vite_config` | 名称/诊断/告警模板 | 严重 | ✗ |
| **资产管理** | `asset_host` | 服务器资产清单 | 严重 | ✗ |
| **探针配置** | `monitor_instance` | Komari/Pika 实例 + API 密钥 | 严重 | ✗ |
| **探针快照** | `monitor_node_snapshot` | 节点快照 | 低 | ✓ 重新同步 |
| **探针指标** | `monitor_metric_latest` | 最新指标 | 低 | ✓ 重新同步 |
| **告警规则** | `monitor_alert_rule` | 告警触发条件 | 中 | ✗ |
| **告警日志** | `monitor_alert_log` | 告警历史 | 低 | ✗ |
| **X-UI 配置** | `xui_instance` | X-UI 面板 + 加密密码 | 严重 | ✗ |
| **X-UI 快照** | `xui_inbound_snapshot` | 入站配置快照 | 低 | ✓ 重新同步 |
| **X-UI 客户端** | `xui_client_snapshot` | 客户端快照 | 低 | ✓ 重新同步 |
| **X-UI 日志** | `xui_sync_log` | 同步日志 | 低 | ✗ |
| **X-UI 流量** | `xui_traffic_delta_event` | 流量上报事件 | 低 | ✗ |
| **隧道节点** | `node` | GOST 代理节点 | 严重 | ✗ |
| **转发规则** | `forward` | 端口转发规则 | 严重 | ✗ |
| **协议/标签** | `protocol`, `tag` | 转发协议与标签 | 中 | ✗ |
| **诊断记录** | `diagnosis_record` | 历史诊断 | 低 | ✗ |

### 1.2 数据分布

```
┌─── Flux Panel MySQL（你的生产服务器）─────────────────┐
│                                                       │
│  [核心配置 - 不可替代]                                  │
│  user, vite_config, asset_host, node, forward,        │
│  xui_instance, monitor_instance, monitor_alert_rule   │
│                                                       │
│  [缓存镜像 - 可通过同步恢复]                            │
│  monitor_node_snapshot, monitor_metric_latest,         │
│  xui_inbound_snapshot, xui_client_snapshot            │
│                                                       │
└───────────────────────────────────────────────────────┘

┌─── Komari（同一台服务器，SQLite）──────────────────────┐
│  客户端列表、实时指标、历史数据                          │
│  → Flux 通过 API 同步镜像，Komari 是数据源              │
└───────────────────────────────────────────────────────┘

┌─── Pika（同一台服务器）────────────────────────────────┐
│  Agent 列表、指标、流量统计                              │
│  → Flux 通过 API 同步镜像，Pika 是数据源                │
└───────────────────────────────────────────────────────┘

┌─── 各被监控 VPS ──────────────────────────────────────┐
│  Komari Agent / Pika Agent（数据采集端）                │
│  X-UI 面板（代理服务端）                                │
│  → 数据独立，Flux 只读取不存储原始数据                   │
└───────────────────────────────────────────────────────┘
```

---

## 二、敏感字段安全审计

### 2.1 当前存储方式

| 字段 | 表 | 当前方式 | 安全等级 | 说明 |
|---|---|---|---|---|
| 管理员密码 | `user.pwd` | MD5 哈希（固定盐） | ⚠️ 中危 | MD5 可碰撞，无随机盐 |
| X-UI 密码 | `xui_instance.encrypted_password` | **AES-256-GCM** | ✅ 安全 | 密钥来自 JWT_SECRET |
| X-UI 登录密钥 | `xui_instance.encrypted_login_secret` | **AES-256-GCM** | ✅ 安全 | 同上 |
| Komari API Key | `monitor_instance.api_key` | **明文** | 🔴 高危 | DB 泄露 = 探针控制权 |
| Pika 密码 | `monitor_instance.api_key` | **明文** | 🔴 高危 | DB 泄露 = Pika 控制权 |
| Pika 用户名 | `monitor_instance.username` | **明文** | ⚠️ 中危 | 配合密码可接管 |
| 2FA 密钥 | `user.two_factor_secret` | **明文** | 🔴 高危 | 泄露后 2FA 形同虚设 |
| JWT_SECRET | `.env` 环境变量 | 文件级 | ✅ 安全 | 不在 DB 中 |

### 2.2 加密机制说明

**AES-256-GCM（X-UI 密码使用）**：
- 实现文件: `AESCrypto.java`
- 密钥派生: `SHA-256(JWT_SECRET + ":xui-instance")` → 256-bit 密钥
- 每次加密生成随机 12 字节 IV，输出 `Base64(IV || 密文 || 认证标签)`
- **重要**: `JWT_SECRET` 丢失 = 所有 X-UI 加密密码无法解密

### 2.3 待修复项（后续优化）

| 优先级 | 修复项 | 方案 | 工作量 |
|---|---|---|---|
| P1 | 探针 API Key 加密 | 创建 `MonitorCredentialCryptoService`，复用 `AESCrypto` | 小 |
| P1 | 2FA 密钥加密 | 复用 `AESCrypto` 加密存储 | 小 |
| P2 | 管理员密码升级 | MD5 → BCrypt（Spring Security 自带） | 中 |

---

## 三、代码仓库安全审计

### 3.1 发现的问题

| 文件 | 问题 | 严重性 | 处理建议 |
|---|---|---|---|
| `vite-frontend/.env.development` | Git 历史中包含内网 IP (192.168.x.x) | 中 | 历史已存在，注意后续不再提交 |
| `.gitlab-ci.yml` | 暴露内部域名 `gitlab.kingsungsz.com` | 低 | CI 服务账号，影响有限 |
| `scripts/setup_dev.sh` | 硬编码开发数据库密码 (lines 68-86) | 低 | 仅开发环境密码，非生产 |

### 3.2 安全的部分

- ✅ `.env` 已在 `.gitignore` 中排除
- ✅ `application.yml` 使用环境变量引用 `${DB_PASSWORD}`
- ✅ `docker-compose*.yml` 使用环境变量
- ✅ `.env.example` 存在且使用占位符

---

## 四、Docker 部署结构

### 4.1 服务架构

```
docker-compose-v6.yml
├── mysql (MySQL 5.7)
│   ├── Volume: mysql_data → /var/lib/mysql
│   ├── Port: 内部 3306（不对外暴露）
│   └── Healthcheck: mysqladmin ping
├── phpmyadmin
│   └── Port: 8066:80
├── backend (Spring Boot)
│   ├── Volume: backend_logs → /app/logs
│   ├── Port: ${BACKEND_PORT}:6365
│   ├── JVM: -Xms256m -Xmx512m
│   └── Healthcheck: wget localhost:6365/flow/test
└── frontend (Nginx + Vite)
    └── Port: ${FRONTEND_PORT}:80
```

### 4.2 关键文件

```
/opt/1panel/apps/local/flux-panel/  （1Panel 部署目录）
├── docker-compose-v6.yml
├── .env                 ← 必须备份！含 JWT_SECRET
├── gost.sql             ← 初始化 SQL
└── go-gost/gost         ← GOST 二进制
```

### 4.3 Docker Volumes 位置

```
/var/lib/docker/volumes/
├── mysql_data/_data/     ← MySQL 数据文件（核心）
└── backend_logs/_data/   ← Spring Boot 日志
```

---

## 五、备份策略

### 5.1 备份分级

```
┌─── 第一优先级（必须备份）──────────────────────────────┐
│ 核心表 SQL dump + .env 文件                            │
│ 恢复时间: < 5 分钟                                     │
└───────────────────────────────────────────────────────┘

┌─── 第二优先级（推荐备份）──────────────────────────────┐
│ 1Panel 目录全量备份 (含 docker-compose + 配置)          │
│ 恢复时间: < 15 分钟                                    │
└───────────────────────────────────────────────────────┘

┌─── 第三优先级（无需备份）──────────────────────────────┐
│ monitor_node_snapshot, monitor_metric_latest           │
│ xui_inbound_snapshot, xui_client_snapshot              │
│ → 全部可通过重新同步恢复                                │
└───────────────────────────────────────────────────────┘
```

### 5.2 方案 A: 1Panel 自带备份（推荐主力方案）

利用 1Panel 的三种备份能力：

#### A1. 应用备份
- **路径**: 1Panel → 应用商店 → 已安装 → flux-panel → 备份
- **内容**: 自动备份应用目录（docker-compose + .env + 配置文件）
- **频率**: 每日 1 次
- **保留**: 7 份

#### A2. 目录备份
- **路径**: 1Panel → 计划任务 → 新建 → 备份目录
- **目标目录**: `/opt/1panel/apps/local/flux-panel/`
- **频率**: 每日 1 次
- **保留**: 7 份
- **备份到**: 本地 + 对象存储（如果配置了 S3/OSS）

#### A3. 数据库备份（通过计划任务）
- **路径**: 1Panel → 计划任务 → 新建 → Shell 脚本
- **频率**: 每日凌晨 3 点
- **保留**: 本地 7 天，远端 30 天

**脚本内容**:
```bash
#!/bin/bash
# Flux Panel 核心表每日备份
BACKUP_DIR="/opt/1panel/backup/flux-db"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)

# 从 .env 读取数据库密码
source /opt/1panel/apps/local/flux-panel/.env

# 只备份核心表（排除可同步恢复的缓存表）
docker exec gost-mysql mysqldump -u "$DB_USER" -p"$DB_PASSWORD" \
  --single-transaction --routines --triggers \
  "$DB_NAME" \
  user vite_config asset_host \
  xui_instance monitor_instance \
  node forward tunnel user_tunnel speed_limit \
  monitor_alert_rule protocol tag \
  > "$BACKUP_DIR/flux_core_${DATE}.sql"

# 全量备份（含缓存表，用于完整恢复）
docker exec gost-mysql mysqldump -u "$DB_USER" -p"$DB_PASSWORD" \
  --single-transaction --routines --triggers \
  "$DB_NAME" \
  > "$BACKUP_DIR/flux_full_${DATE}.sql"

# 备份 .env（含 JWT_SECRET，丢失会导致加密数据不可恢复）
cp /opt/1panel/apps/local/flux-panel/.env "$BACKUP_DIR/env_${DATE}.bak"

# 清理 7 天前的本地备份
find "$BACKUP_DIR" -name "*.sql" -mtime +7 -delete
find "$BACKUP_DIR" -name "*.bak" -mtime +7 -delete

echo "[$(date)] Flux Panel 备份完成: flux_core_${DATE}.sql"
```

### 5.3 方案 B: 异地备份（推荐叠加使用）

在 1Panel 的计划任务中追加异地推送：

```bash
# 方案 B1: rsync 到另一台 VPS
rsync -az "$BACKUP_DIR/" user@backup-server:/backup/flux-panel/

# 方案 B2: rclone 到对象存储（S3/OSS/R2）
# 先在 1Panel 服务器上安装 rclone 并配置 remote
rclone copy "$BACKUP_DIR/" remote:flux-backup/ --max-age 7d

# 方案 B3: 1Panel 自带对象存储集成
# 1Panel → 面板设置 → 备份账号 → 添加 S3/OSS
# 然后在计划任务中选择「备份到对象存储」
```

### 5.4 Komari / Pika 备份

由于 Komari 和 Pika 也部署在同一台服务器：

**Komari（SQLite）**:
```bash
# Komari 数据文件位置（默认）
cp /opt/komari/data/komari.db "$BACKUP_DIR/komari_${DATE}.db"
```

**Pika**:
```bash
# Pika 数据目录（需确认实际路径）
# 如果是 Docker 部署，备份对应 volume
# 如果是二进制部署，备份数据目录
cp -r /opt/pika/data/ "$BACKUP_DIR/pika_${DATE}/"
```

---

## 六、灾难恢复操作手册

### 6.1 场景一：数据库损坏（服务器正常）

```bash
# 1. 停止后端服务
cd /opt/1panel/apps/local/flux-panel
docker compose stop backend frontend

# 2. 恢复数据库
docker exec -i gost-mysql mysql -u root -p"$DB_PASSWORD" "$DB_NAME" \
  < /opt/1panel/backup/flux-db/flux_full_最新日期.sql

# 3. 重启服务
docker compose up -d

# 4. 验证：访问面板确认数据正常
# 5. 手动触发探针和 X-UI 同步，恢复缓存数据
```

### 6.2 场景二：新服务器完整恢复

**前提**: 有 SQL 备份 + .env 文件

```bash
# ===== 步骤 1: 安装基础环境 =====
# 安装 1Panel（会自动安装 Docker）
curl -sSL https://resource.fit2cloud.com/1panel/package/quick_start.sh -o quick_start.sh && bash quick_start.sh

# ===== 步骤 2: 部署 Flux Panel =====
mkdir -p /opt/1panel/apps/local/flux-panel
cd /opt/1panel/apps/local/flux-panel

# 上传或拷贝以下文件到此目录：
# - docker-compose-v6.yml
# - .env（从备份恢复，必须包含原始 JWT_SECRET！）
# - gost.sql
# - go-gost/gost

# ===== 步骤 3: 启动服务 =====
docker compose -f docker-compose-v6.yml up -d

# 等待 MySQL 就绪（约 30 秒）
sleep 30

# ===== 步骤 4: 恢复数据库 =====
source .env
docker exec -i gost-mysql mysql -u root -p"$DB_PASSWORD" "$DB_NAME" \
  < flux_full_backup.sql

# ===== 步骤 5: 重启后端使其读取恢复的数据 =====
docker compose restart backend

# ===== 步骤 6: 部署探针 =====
# Komari
# （如果有 komari.db 备份，恢复到 /opt/komari/data/）
# 否则重新安装 Komari 并用之前的 API Key 配置

# Pika
# （如果有备份，恢复数据目录）
# 否则重新安装 Pika

# ===== 步骤 7: 验证 =====
# 访问 http://新IP:8080 登录面板
# 进入探针管理，点击「同步」恢复节点数据
# 进入 X-UI 管理，点击「同步」恢复面板数据
```

**恢复时间评估**：
| 步骤 | 时间 |
|---|---|
| 安装 1Panel + Docker | ~5 分钟 |
| 部署 Flux Panel 容器 | ~3 分钟 |
| 恢复数据库 | ~1 分钟 |
| 部署 Komari + Pika | ~10 分钟 |
| 同步探针/X-UI 数据 | ~5 分钟 |
| **总计** | **~25 分钟** |

### 6.3 恢复检查清单

- [ ] 能正常登录 Flux Panel
- [ ] 服务器资产列表完整
- [ ] 探针同步正常（Komari + Pika）
- [ ] X-UI 面板连接正常
- [ ] 转发规则正常运行
- [ ] 告警规则存在且启用
- [ ] 1Panel 面板可访问
- [ ] 设置新的自动备份计划

---

## 七、关键注意事项

### 7.1 JWT_SECRET 是最核心的密钥

```
⚠️  JWT_SECRET 丢失 = X-UI 加密密码全部不可解密
⚠️  JWT_SECRET 变更 = 需要重新配置所有 X-UI 密码
⚠️  JWT_SECRET 必须和数据库备份配套保存
```

**建议**: 将 `.env` 文件单独备份一份到安全位置（密码管理器 / 加密 U 盘）。

### 7.2 单点故障风险

当前所有服务部署在同一台服务器：
- Flux Panel（MySQL + 后端 + 前端）
- Komari 探针服务端
- Pika 探针服务端
- 1Panel 管理面板

**风险**: 服务器故障 = 所有服务同时不可用

**缓解措施**:
1. 异地自动备份（每日推送到另一台 VPS 或对象存储）
2. 保持恢复文档和备份文件可用
3. 定期测试恢复流程（建议每月 1 次）

### 7.3 备份验证

定期验证备份可用性：

```bash
# 在测试环境恢复备份并验证
docker run -d --name test-mysql -e MYSQL_ROOT_PASSWORD=test mysql:5.7
sleep 20
docker exec -i test-mysql mysql -uroot -ptest -e "CREATE DATABASE flux_test;"
docker exec -i test-mysql mysql -uroot -ptest flux_test < backup.sql
docker exec test-mysql mysql -uroot -ptest flux_test -e "SELECT COUNT(*) FROM user;"
# 确认有数据后清理
docker rm -f test-mysql
```

---

## 八、推荐行动路线

| 阶段 | 时间 | 行动 |
|---|---|---|
| **P0 立即** | 今天 | 1Panel 设置每日数据库备份计划任务 |
| **P0 立即** | 今天 | 备份 `.env` 到安全位置 |
| **P0 立即** | 今天 | 手动执行一次完整备份并验证 |
| **P1 本周** | 3 天内 | 配置异地备份（rsync/rclone/1Panel对象存储） |
| **P1 本周** | 3 天内 | 加密探针 API Key（复用 AESCrypto） |
| **P1 本周** | 3 天内 | 加密 2FA 密钥 |
| **P2 两周** | 两周内 | 管理员密码升级为 BCrypt |
| **P2 两周** | 两周内 | 编写一键恢复脚本 |
| **P3 持续** | 每月 | 测试恢复流程 |
| **P3 持续** | 每月 | 审计备份完整性 |
