# Flux Panel Yoga

当前文档对应版本：`v1.4.7`

Flux Panel Yoga 是一个围绕 `gost` 转发能力构建的完整面板系统，包含：

- Java Spring Boot 后端
- Vite + React + HeroUI 前端
- MySQL/MariaDB 数据存储
- Docker / Docker Compose 本地与服务器运行方式
- GitLab -> GitHub -> Docker Hub 的开发 / 生产发布链路

这份 README 现在是项目主入口。它的目标不是只告诉你“怎么启动”，而是让你在把本项目并入更大工作区之前，能一次看清项目结构、模块边界、部署链路、开发规范和当前限制。

## 1. 当前项目状态

这轮迭代后，项目已经从“单纯的转发面板”进一步收敛成 4 个清晰层级：

1. `首页`
   只保留最核心的状态摘要和入口，不再承载大图表。
2. `诊断看板`
   成为真正的诊断集合页，承接运行态、趋势图、节点实时流量、隧道/转发累计流量和诊断历史。
3. `业务资源页`
   主要是 `转发管理`、`隧道管理`、`节点监控`。
4. `系统工作台`
   统一收口网站配置、安全登录、诊断配置、告警通知和系统资源管理，并改为左侧导航模式。

## 2. 架构总览

```text
本地开发机 A / D
  -> Git push dev / main
GitLab (主仓库 + CI 入口)
  -> 同步代码到 GitHub
GitHub Actions
  -> 构建 Docker Hub 镜像
开发环境 B
  -> 自动拉取 dev-latest 并部署
生产环境 C
  -> main 分支手动确认后拉取 latest 并部署
```

### 2.1 运行时组件

- `vite-frontend/`
  管理后台和用户前端。
- `springboot-backend/`
  业务 API、认证、诊断调度、流量统计、配置中心。
- `go-gost/`
  节点端代理程序，负责实际转发与流量上报。
- `docker-compose-v4.local.yml`
  本地开发用编排。
- `docker-compose-v6.yml`
  服务器部署用编排。

## 3. 当前核心能力

### 3.1 面板能力

- 首页摘要与核心入口
- 诊断看板
  - 手动触发全量诊断
  - 显示当前正在执行的隧道/转发
  - 诊断进度、成功/失败数、最近完成项
  - 24 小时诊断健康轨迹
  - 平均延时波峰图
  - 节点实时上/下行图表
  - 隧道累计流量排行
  - 转发累计流量排行
  - 24 小时账号计费流量采样
  - 诊断历史展开与单次详情
- 转发管理
  - 卡片/列表/分组等视图演进基础
  - 搜索、筛选、批量协议、批量标签、批量删除
  - 全选当前结果 / 仅选故障项
  - 单条诊断历史与测速详情
- 隧道管理
  - 资源管理
  - 最近诊断结果与延时信息
- 节点监控
  - 节点在线情况
  - 节点实时系统信息和流量快照
- 系统工作台
  - 基础配置
  - 安全登录
  - 诊断配置
  - 告警通知
  - 用户管理 / 限速管理 / 协议管理 / 标签管理

### 3.2 安全能力

- 首次登录强制修改默认凭据
  - 必须同时修改默认用户名和默认密码
- 登录验证码配置
- TOTP 2FA
  - 用户可自主开启
  - 支持管理员强制
  - 支持全站强制
  - 支持二维码、密钥、`otpauth://` 三种绑定方式

### 3.3 告警能力

- 企业微信机器人 Webhook
- 环境名进入告警标题
- 异常通知模板
- 恢复通知模板
- 冷静期 / 节流控制
- 单次消息最大异常条数控制

## 4. 当前功能模块整理

### 4.1 前端页面

| 页面 | 路由 | 用途 |
|---|---|---|
| 登录页 | `/` | 登录、验证码、2FA 登录入口 |
| 首页 | `/dashboard` | 核心摘要与快捷入口 |
| 诊断看板 | `/monitor` | 全量诊断、趋势、流量、诊断历史 |
| 转发管理 | `/forward` | 转发 CRUD、筛选、批量操作、诊断 |
| 隧道管理 | `/tunnel` | 隧道资源与状态管理 |
| 节点监控 | `/node` | 管理员节点视角监控 |
| 系统工作台 | `/config` | 网站配置、安全、诊断、告警 |
| 用户管理 | `/user` | 用户列表与维护 |
| 限速管理 | `/limit` | 限速策略管理 |
| 协议管理 | `/protocol` | 协议字典管理 |
| 标签管理 | `/tag` | 标签字典管理 |
| 个人中心 | `/profile` | 账号资料、2FA、个人安全 |
| 强制改密 | `/change-password` | 首次默认凭据替换 |

### 4.2 后端控制器

| 控制器 | 责任 |
|---|---|
| `UserController` | 登录、用户、密码、2FA |
| `TunnelController` | 隧道管理 |
| `ForwardController` | 转发管理、批量操作、单条诊断 |
| `DiagnosisController` | 诊断摘要、趋势、历史、运行态、立即诊断 |
| `FlowController` | 流量上报与汇总 |
| `NodeController` | 节点管理与状态 |
| `ViteConfigController` | 网站配置读取与更新 |
| `ProtocolController` | 协议字典 |
| `TagController` | 标签字典 |
| `SpeedLimitController` | 限速策略 |
| `CaptchaController` | 验证码 |
| `OpenApiController` | 外部开放接口 |

### 4.3 关键实体

| 实体 | 含义 |
|---|---|
| `User` | 用户账号与套餐信息 |
| `Tunnel` | 隧道资源 |
| `Forward` | 具体转发规则 |
| `Node` | 节点信息 |
| `DiagnosisRecord` | 诊断记录 |
| `StatisticsFlow` | 账号维度的小时流量采样 |
| `UserTunnel` | 用户与隧道的授权关系 |
| `ViteConfig` | 可动态配置的网站参数 |
| `Protocol` | 协议字典 |
| `Tag` | 标签字典 |
| `SpeedLimit` | 限速策略 |

## 5. 流量与诊断数据能力边界

这是当前项目最容易误解的一块，必须明确。

### 5.1 当前可以准确展示的数据

1. 节点实时上/下行速度
   - 来源：节点 WebSocket 上报
   - 用途：看 VPS 当前实时出口负载
2. 账号级 24 小时计费流量采样
   - 来源：`statistics_flow`
   - 用途：看用户或全站账号维度的小时采样流量
3. 转发累计总流量
   - 来源：`forward.in_flow / out_flow`
4. 隧道累计总流量
   - 当前通过转发累计值按隧道聚合得到
5. 诊断健康率 / 失败数 / 平均延时 / 历史记录

### 5.2 当前不能准确展示的数据

1. 每条隧道的 24 小时逐小时流量历史
2. 每条转发的 24 小时逐小时流量历史

原因：当前库里没有“每条隧道 / 每条转发按小时落盘”的历史快照表。现在能稳定拿到的是累计值，不是逐小时序列。

这意味着：

- 可以做累计排行
- 不能伪造 24H 曲线
- 如果后续要补，必须新增小时级聚合表或采样任务

## 6. 最近几轮已经完成的重要更新

### 6.1 前端与交互

- 首页与诊断看板彻底分层
- 系统工作台改成左侧导航主导
- 转发管理顶部工具区多轮收敛
- 转发诊断历史支持旧结构兼容
- 隧道管理补充延时看板方向
- 管理后台整体布局改为顶部主导航

### 6.2 安全与登录

- 默认凭据修改逻辑补齐前后端校验
- 增加 TOTP 2FA
- 登录改为“两段式 2FA”：首屏先验账号密码和验证码，通过后再弹独立 2FA 验证
- 增加 2FA 二维码展示
- 增加 `disabled / admin / all` 强制策略
- 页面刷新后会重新同步强制 2FA 状态
- 登录、2FA 和 x-ui 凭据相关接口日志已统一脱敏，避免明文密码、JWT、TOTP 和密钥写入运行日志

### 6.3 诊断与告警

- 企业微信告警标题支持环境名
- 告警模板可配置
- 恢复模板可配置
- 冷静期 / 节流可配置
- 诊断运行态可查询，前端可显示当前正在执行的资源

### 6.4 工程化与本地开发

- 增加 macOS 专用初始化脚本
- 本地脚本统一走 Java 21 / Node 20 / Docker / Colima
- `verify_build.sh` 成为推送前硬门槛
- `ship_dev.sh` 成为标准开发出口
- 本地构建、容器重载和推送会自动清理构建垃圾；低空间时会先做预清理再继续
- 版本展示统一为：`release version + build revision`

## 7. 版本语义

项目现在统一使用两层版本：

- 发布版本：例如 `v1.4.6`
- 构建标识：例如 `dev.089fca6`

同步位置：

- [vite-frontend/package.json](vite-frontend/package.json)
- [springboot-backend/pom.xml](springboot-backend/pom.xml)
- [springboot-backend/src/main/resources/application.yml](springboot-backend/src/main/resources/application.yml)

前端运行时会显示：

- `release_version`
- `build_revision`
- `branch`
- `commit_sha`
- `build_time`

## 8. 本地开发与验证流程

### 8.1 初始化

```bash
git switch dev
git pull origin dev
./scripts/setup_dev.sh
```

### 8.2 每次开发后的标准流程

```bash
./scripts/ship_dev.sh "feat: your change"
```

这个脚本会固定执行：

1. `./scripts/verify_build.sh`
2. `git add -A`
3. `git commit --no-gpg-sign`
4. `./scripts/build_docker.sh`
5. `./scripts/reload_local_stack.sh`
6. `git push origin dev`
7. `./scripts/cleanup_local_artifacts.sh post-ship`

### 8.3 仅本地验证

```bash
./scripts/verify_build.sh
./scripts/build_docker.sh
./scripts/reload_local_stack.sh
```

### 8.4 本地入口

- 前端：`http://localhost:8080`
- 后端：`http://localhost:6365`
- phpMyAdmin：`http://localhost:8066`

## 9. CI/CD 与部署链路

### 9.1 `dev` 分支

1. 本地 `ship_dev.sh` 推到 GitLab `dev`
2. GitLab `build:dev`
   - 打印本次版本与提交摘要
   - 将 `dev` 推送到 GitHub
3. GitHub Actions
   - 构建 Docker Hub：
     - `dev-latest`
     - `dev-<version>-<sha>`
4. GitLab `deploy:dev`
   - 等待镜像可拉取
   - 在开发环境 B 执行部署脚本

### 9.2 `main` 分支

1. 合并 / 推送到 GitLab `main`
2. GitLab `build:prod`
   - 打印版本与提交摘要
   - 将 `main` 推送到 GitHub
3. GitHub Actions
   - 构建 Docker Hub：
     - `latest`
     - `<version>`
     - `<version>-<sha>`
4. GitLab `deploy:prod`
   - 手动确认
   - 在生产环境 C 部署

### 9.3 当前设计原则

- Dev/Prod 部署入口标签不改
  - 开发：`dev-latest`
  - 生产：`latest`
- 可追踪版本标签只做辅助追踪，不改变已有部署入口
- GitLab shell runner 不依赖 `node`、`jq` 等额外工具

### 9.4 DingTalk 配置来源

- B / C 环境的 DingTalk 基础配置建议写入 `.env`
- 后端运行时按“环境变量优先、数据库兼容回退”读取
- 详细步骤见 [docs/DINGTALK_ENV_DEPLOYMENT.md](docs/DINGTALK_ENV_DEPLOYMENT.md)
- 推荐环境变量：
  - `IAM_AUTH_MODE`
  - `IAM_LOCAL_ADMIN_ENABLED`
  - `DINGTALK_OAUTH_ENABLED`
  - `DINGTALK_CLIENT_ID`
  - `DINGTALK_CLIENT_SECRET`
  - `DINGTALK_CORP_ID`
- `DINGTALK_REDIRECT_URI`
- `DINGTALK_ALLOWED_ORG_IDS`
- `DINGTALK_REQUIRED_EMAIL_DOMAIN`
- 一旦某个键已由环境变量接管，后台配置接口不会再允许改写对应数据库配置

## 10. 本地磁盘清理逻辑

当前这台 Mac 空间紧张，仓库已经把清理逻辑做成固定流程。

### 10.1 自动清理

以下脚本会自动调用清理：

- `verify_build.sh` 会在低空间时先执行预清理
- `build_docker.sh`
- `reload_local_stack.sh`
- `ship_dev.sh`
- `sync_dev.sh`

### 10.2 深度清理

当磁盘低于约 `5 GiB` 时执行：

```bash
./scripts/cleanup_local_artifacts.sh deep-host
```

这会额外清理：

- Homebrew 下载缓存
- npm 全局缓存
- Maven 失效元数据
- 未使用 Docker 容器 / 网络 / volume
- 无用镜像和 builder cache

### 10.3 大头占用说明

在本机上，真正大的通常不是 Java/Maven 本体，而是：

- `~/.colima`
- Docker 镜像
- 构建缓存

如果彻底不需要本地 Docker 联调，删除 Colima 才是回收大空间的主要手段。

## 11. 默认账号与安全注意事项

默认初始化账号通常为：

- 用户名：`admin_user`
- 密码：`admin_user`

首次登录后必须：

1. 同时修改默认用户名和默认密码
2. 视策略决定是否立即绑定 2FA
3. 管理员应检查环境名、自动诊断和企业微信告警配置

## 12. 关键脚本索引

| 脚本 | 作用 |
|---|---|
| `scripts/setup_dev.sh` | 本地初始化入口 |
| `scripts/setup_dev_macos.sh` | macOS 工具链准备 |
| `scripts/verify_build.sh` | 推送前构建门禁 |
| `scripts/build_docker.sh` | 本地构建 `local` 镜像 |
| `scripts/reload_local_stack.sh` | 用新镜像重建本地容器 |
| `scripts/cleanup_local_artifacts.sh` | 清理构建残留与缓存 |
| `scripts/ship_dev.sh` | 标准 dev 开发出口 |
| `scripts/sync_dev.sh` | 仅推送现有 commit 到 dev |
| `scripts/remote_deploy.sh` | 服务器侧部署逻辑 |
| `scripts/print_ci_commit_summary.sh` | CI 中打印版本和提交摘要 |

## 13. 推荐阅读顺序

1. [README.md](README.md)
2. [PROJECT_ANALYSIS.md](PROJECT_ANALYSIS.md)
3. [CICD_ARCHITECTURE.md](CICD_ARCHITECTURE.md)
4. [LOCAL_MACOS_SETUP.md](LOCAL_MACOS_SETUP.md)
5. [WORKSPACE_INTEGRATION_GUIDE.md](WORKSPACE_INTEGRATION_GUIDE.md)
6. [AI_HANDOFF.md](AI_HANDOFF.md)
7. [walkthrough.md](walkthrough.md)

## 14. 接手前必读

如果后续由新的 AI 工具 / 新进程 / 新协作者继续处理本项目，开始前至少按这个顺序阅读：

1. `README.md`
2. `PROJECT_ANALYSIS.md`
3. `CICD_ARCHITECTURE.md`
4. `LOCAL_MACOS_SETUP.md`
5. `WORKSPACE_INTEGRATION_GUIDE.md`
6. `AI_HANDOFF.md`
7. `.cursorrules`

## 15. 免责声明

本项目仅用于合法、合规的学习、研究与授权场景。使用者需要自行承担部署、配置、运维和合规风险。

## 16. 2026-03-07 资产层与 X-UI 联动新增说明

本轮新增了“服务器资产层”，目的是把原本分散在 `X-UI 管理`、`转发管理`、后续探针与节点监控里的数据统一挂到同一台 VPS 记录下。

当前已经落地：

- 新增顶栏一级导航 `服务器资产`
- 新增 `asset_host` 表，并通过 `DatabaseInitService` 自动增量迁移
- `xui_instance` 新增 `asset_id` 绑定字段，旧 `host_label` 保留为兼容标签
- `forward` 新增 `remote_source_*` 字段，用于记录“这个转发的远端地址来自哪个 X-UI 入站快照”
- `X-UI 管理` 现在支持直接绑定资产
- `转发管理` 现在支持管理员直接从已同步的 X-UI 节点中选择远端地址

当前的数据层级建议按下面理解：

- 服务器层：`asset_host`
- 面板层：`xui_instance`
- 协议层：`xui_inbound_snapshot` / `xui_client_snapshot`
- 联动层：`forward.remote_source_*`

这样做的目标不是替换原有模块，而是给后续的探针、X-UI、转发和节点监控提供一个共同的归属层。

## 17. 2026-03-08 探针监控与同步体系更新

### 17.1 双探针监控体系

新增 Komari + Pika 双探针聚合架构：

- `monitor_instance` 统一管理探针实例（通过 `type` 区分 komari/pika）
- `monitor_node_snapshot` 存储探针上报的服务器快照
- `monitor_metric_latest` 存储最新实时指标
- 双探针通过 IPv4 地址自动关联同一 `asset_host` 资产
- 历史图表支持 CPU、内存、Swap、磁盘、网络、负载、温度、GPU、进程数、连接数
- 双探针时图表左右并排对比显示

### 17.2 同步逻辑与数据权威

**核心原则：Flux 是资产数据的权威来源，探针只负责实时监控数据。**

| 场景                | 处理方式                                        |
|-------------------|-------------------------------------------------|
| 新探针节点首次出现    | 自动创建 `asset_host` 或通过 IP 关联已有资产         |
| 用户在 Flux 删除资产  | 快照标记 `assetUnlinked=1`，下次同步不会重建         |
| 用户在 Flux 删除探针  | 软删除 `status=-1`，同步跳过不会重现                 |
| 探针更新 OS 等字段    | 快照始终更新，资产仅在字段为空时填充（不覆盖用户编辑）  |
| 探针更新实时指标      | 直接写入 `monitor_metric_latest`（始终覆盖）         |

### 17.3 告警系统

- `monitor_alert_rule` / `monitor_alert_log` 表（Auto-DDL）
- 支持 CPU、内存、磁盘、流量、负载、温度、连接数、离线等指标
- 支持全局 / 标签 / 节点粒度告警范围
- 支持 Webhook（JSON POST）和日志通知
- 冷静期、评估周期集成到同步循环中

### 17.4 服务器看板（/monitor）

- 服务器看板页面，统一展示所有探针节点
- 服务器计数按资产去重（双探针算一台）
- 地区/OS 快速筛选
- 详情弹窗：系统信息、硬件、资产字段（厂商/带宽/SSH/1Panel/备注等）
- 实时指标进度条 + 历史图表
- 资产标签点击直接跳转对应资产详情
- "部署探针"按钮跳转资产编辑页的部署面板

### 17.5 资产管理增强

- 地区/OS/厂商快速筛选 + 扩展搜索
- URL 参数支持（`?viewId=123&deploy=1`）
- 1Panel 绑定独立输入状态
- 探针部署上下文感知 + 一键同步

## 18. 协作开发

本项目支持多 AI 代理 + 人工协同开发：

| 文档                                     | 说明                  |
|----------------------------------------|---------------------|
| [CONTRIBUTING.md](CONTRIBUTING.md)     | 完整开发规则（人和代理共用）|
| [CLAUDE.md](CLAUDE.md)                | Claude Code 专用补充    |
| [AGENTS.md](AGENTS.md)                | 通用 AI 代理入口         |

协作分支约定：
- `dev` — 共享集成分支
- `claude/<topic>` — Claude Code 工作分支
- `codex/<topic>` — Codex 工作分支
- `feat/<topic>` — 人工开发分支
