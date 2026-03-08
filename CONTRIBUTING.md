# Contributing

Flux Panel Yoga 是统一 VPS 服务器管理面板，聚合多个上游探针/面板的数据到单一界面。

## 项目定位

- **主仓库**（可修改）：`flux-panel-yoga`
- **上游引用仓库**（只读，不修改源码）：`komari`, `pika`, `3x-ui`, `homepage`, `1Panel`, `jumpserver`, `openclaw`
- **原则**：在 Flux 中构建适配器/链接/同步任务，而非 fork 上游项目

## 技术栈

| 层       | 技术                                          |
|---------|---------------------------------------------|
| 后端      | Java 21 (openjdk@21) + Spring Boot + MyBatis Plus |
| 前端      | React + HeroUI + Vite 5 + TypeScript + recharts |
| 数据库     | MySQL (Docker)                              |
| 部署      | Docker Compose（springboot-backend + vite-frontend）|
| 监控探针    | Komari (Go/SQLite) + Pika (Go/VictoriaMetrics) |
| 代理面板    | 3x-ui (XRay)                                |
| 服务器面板   | 1Panel                                      |

## 分支与协作流程

- `dev` 是共享集成分支，`main` 用于发布
- 脏工作区时不要在原地切分支，使用 worktree：

```bash
# Claude Code
git worktree add ../flux-panel-yoga-claude-<topic> -b claude/<topic> origin/dev

# Codex / 其他代理
git worktree add ../flux-panel-yoga-codex-<topic> -b codex/<topic> origin/dev

# 人工开发
git worktree add ../flux-panel-yoga-feat-<topic> -b feat/<topic> origin/dev
```

合并前：同步 `origin/dev` → 本地解决冲突 → 运行验证 → 单一关注点合并。

## 构建与验证

```bash
# 后端编译（macOS，Java 21 不在默认路径）
cd springboot-backend
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn compile -q

# 前端构建
cd vite-frontend
npm run build

# Docker 构建镜像
scripts/build_docker.sh

# 重启容器加载新镜像（build 不会自动重启！）
scripts/reload_local_stack.sh
```

数据库无需手动建表：`DatabaseInitService.java` 启动时自动 `CREATE TABLE IF NOT EXISTS` + `updateColumn()` 增量加字段。

## 架构核心层

| 数据层                  | 说明                    |
|-----------------------|-----------------------|
| `asset_host`          | 服务器身份层（权威数据源）        |
| `monitor_instance`    | Komari / Pika 探针注册层   |
| `monitor_node_snapshot` | 探针快照（实时指标来源）         |
| `monitor_metric_latest` | 最新监控指标               |
| `xui_instance` + 快照表  | 3x-ui 注册与快照           |
| `forward`             | 转发配置层                 |
| `portal_nav_links`    | 外部导航入口                |
| `monitor_alert_rule/log` | 告警规则与日志             |

## 同步逻辑核心规则

**Flux 是资产数据的权威来源，探针只负责实时监控数据。**

- 探针同步 → 写入 `monitor_node_snapshot`（快照），不覆盖用户编辑的资产字段
- 新节点首次同步时自动创建资产（`autoCreateOrLinkAssetFromNode`），后续只填充空字段
- 用户删除资产 → 快照标记 `assetUnlinked=1`，下次同步不会重建
- 用户删除探针节点 → 软删除 `status=-1`，同步跳过不会重现
- `refreshAssetFromProbe` 仅对空字段填充，OS/计费/标签等已有值不覆盖
- 双探针通过 IPv4 地址自动关联同一资产

## 冲突热点文件

并行开发时最常冲突的文件，修改时保持 diff 精简：

- `springboot-backend/.../service/impl/MonitorServiceImpl.java`（~1600行）
- `springboot-backend/.../service/impl/AssetHostServiceImpl.java`
- `springboot-backend/.../config/DatabaseInitService.java`
- `vite-frontend/src/pages/assets.tsx`（~2800行）
- `vite-frontend/src/pages/server-dashboard.tsx`

## 上游集成定位

| 项目         | 在 Flux 中的集成方式                              |
|------------|----------------------------------------------|
| Komari     | `monitor_instance.type=komari`，API 同步 + RPC 历史数据 |
| Pika       | `monitor_instance.type=pika`，JWT 登录 + REST 同步 |
| 3x-ui      | `xui_instance` 注册 + 快照 + 入站/客户端数据           |
| 1Panel     | `asset_host.panelUrl` 深度链接                    |
| JumpServer | 堡垒机/访问控制层，资产映射 + 跳板链接（规划中）           |
| OpenClaw   | AI 助手/自动化层，消费 Flux 事件和 webhook（规划中）      |
| Homepage   | 独立仪表板，不直接集成                               |

## Schema 与安全规则

- Schema 变更必须向后兼容（增量加字段，不删现有字段）
- 密钥/密码仅在后端存储和使用，前端只展示掩码或布尔标记
- 日志禁止明文输出 API Key、JWT、TOTP、密码

## 变更清单

新增外部平台集成时，同步更新以下各层：

1. `DatabaseInitService.java` 建表/加字段
2. Entity + DTO 定义
3. Controller + Service 接口
4. 资产聚合 + Dashboard/Detail 展示
5. Portal 入口或深度链接
6. 本文档及 CLAUDE.md / AGENTS.md
