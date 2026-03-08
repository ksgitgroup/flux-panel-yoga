# 1Panel Exporter V1 方案

## 目标

在不把 1Panel 管理员级 API Key 集中存进 Flux 的前提下，把每台 Linux 服务器上的 1Panel 运维摘要安全汇总到 Flux。

推荐形态：

- 每台服务器部署一个本地 `flux-1panel-sync`
- 通过 `systemd timer` 或 `cron` 每 3 到 5 分钟执行一次
- 只在本机访问 1Panel
- 只上报脱敏后的摘要到 Flux
- Flux 不保存 1Panel API Key

## 红线

- Flux 不直接保存每台 1Panel 的管理员级 API Key
- Flux 前端不透传 1Panel 任意 API
- Flux 不作为 1Panel 的通用反向代理
- 第一阶段不做远程写操作
- 不上传数据库密码、环境变量、私钥、证书私钥、终端凭据、站点/容器完整配置全文

## 为什么不用 Flux 直连 1Panel

当前 1Panel API 鉴权模型主要依赖：

- `ApiKey`
- `IpWhiteList`
- `ApiKeyValidityTime`
- `ApiInterfaceStatus`

它更像“面板 API 总开关 + 管理员级访问”，不是细粒度只读 scope。

如果 Flux 直连所有 1Panel：

- Flux 必须集中保存每台机器的高权限 key
- 一旦 Flux 被攻破，攻击面会扩散到所有接入节点
- 审计边界会模糊，难以区分“看板读取”和“管理动作”

## Exporter 形态

推荐采用 one-shot 同步器，而不是常驻重 agent。

执行流程：

1. `flux-1panel-sync` 读取本地配置
2. 调用本机 1Panel 白名单只读接口
3. 把结果规整成统一摘要 JSON
4. `POST` 到 Flux 的接收接口
5. 进程退出

优点：

- 空闲时几乎不占资源
- 出问题容易定位和重试
- 容易用 `systemd timer` 做一键安装
- 比常驻 daemon 更轻

## 推荐配置项

最小配置：

- `FLUX_URL`
- `FLUX_INSTANCE_KEY`
- `FLUX_NODE_TOKEN`
- `PANEL_BASE_URL`
- `PANEL_API_KEY`
- `SYNC_INTERVAL`

推荐附加项：

- `PANEL_VERIFY_TLS`
- `PANEL_TIMEOUT_MS`
- `ASSET_BIND_KEY`
- `SITE_ENVIRONMENT`
- `EXPORTER_LOG_LEVEL`

## 一键安装建议

推荐两种安装模式：

- Shell 安装脚本
  - 下载二进制
  - 写入 `/etc/flux-1panel-sync.env`
  - 注册 `systemd service + timer`
  - 执行一次连通性检查和首次同步
- 1Panel 脚本库 / 自定义应用
  - 在 1Panel 内一键部署 exporter
  - 仍然采用本机读取 + 主动上报

推荐最终体验：

- Flux 后台生成节点注册命令
- 目标服务器执行一条命令
- 自动完成安装、注册、测试、首次上报

建议同时提供以下本地文件：

- `flux-1panel-sync.sh`
- `flux-1panel-sync.service`
- `flux-1panel-sync.timer`
- `/etc/flux-1panel-sync/.env`

## Flux 侧只接什么

V1 只接“运维摘要”，不接“可执行控制”。

建议同步这些摘要：

- 系统摘要
  - 节点名称
  - 1Panel 版本
  - edition
  - OS / 内核 / 架构
  - Docker 状态
  - OpenResty / runtime 组件状态
- 应用摘要
  - 应用名
  - 版本
  - 状态
  - 端口
  - 访问地址
  - 是否可升级
- 网站摘要
  - 站点名
  - 域名
  - 运行状态
  - HTTPS 状态
  - 证书到期时间
  - 反向代理数量
- 容器摘要
  - 容器名
  - 镜像
  - 状态
  - CPU / MEM
  - Compose 项目
- 任务摘要
  - 任务名
  - 类型
  - 启用状态
  - 最近执行状态
  - 最近执行时间
- 备份摘要
  - 备份类型
  - 最近记录状态
  - 最近备份时间
  - 快照数量
- 审计摘要
  - 最近登录失败数
  - 最近高风险操作数
  - 最近一次操作时间

## 明确不上传的数据

- 数据库密码
- 网站/应用完整环境变量
- 站点私钥
- SSL 私钥
- Compose 完整 YAML
- 文件管理器中的文件内容
- Shell 命令内容和终端会话内容
- 1Panel API Key 本身

## 推荐读取的 1Panel 接口白名单

建议只读取这些接口族：

- `GET /dashboard/base/os`
- `GET /dashboard/base/:ioOption/:netOption`
- `GET /dashboard/current/node`
- `POST /apps/installed/search`
- `GET /apps/installed/info/:appInstallId`
- `POST /websites/search`
- `POST /websites/ssl/search`
- `POST /containers/search`
- `GET /containers/list/stats`
- `POST /cronjobs/search`
- `POST /cronjobs/search/records`
- `POST /backups/record/search`
- `POST /settings/snapshot/search`
- `POST /core/logs/login`
- `POST /core/logs/operation`

V1 不允许 exporter 调用写接口。

## Flux 侧推荐展示

V1 先落这四个汇总视图：

- 应用看板
- 网站与证书看板
- 容器与 Compose 看板
- 任务与备份看板

每条记录都保留“打开 1Panel”的深链，但不在 Flux 里直接执行高风险操作。

## 安全收益

相对于 Flux 直连 1Panel，本方案的收益：

- 高权限 key 不进入中心系统
- Flux 不具备任意调用 1Panel 的能力
- 每台节点独立失陷，不会自然扩散为全网失陷
- 可按节点单独停用、轮换、吊销
- 上报只走摘要，泄露面更小

## V1 落地顺序

1. Flux 定义接收契约 DTO
2. Flux 增加 `onepanel` 接收入口和只读快照存储
3. 完成 `flux-1panel-sync` 本地同步器
4. 先接系统 / 应用 / 网站 / 容器 / cron / 备份摘要
5. 页面只做汇总与深链
6. 稳定后再考虑受控动作

## 受控动作的后续原则

如果以后需要从 Flux 触发动作，必须满足：

- 只允许极少数白名单动作
- 只能由高权限角色触发
- 必须二次确认
- 必须完整审计
- 默认不开放批量高风险操作

V1 不实现这部分。
