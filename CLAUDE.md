# Claude Code 指引

先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解完整规则。

## 核心约束

- 只修改 `flux-panel-yoga` 仓库，上游仓库（komari, pika, 3x-ui, 1Panel, homepage, jumpserver, openclaw）不可修改
- 使用中文回复
- 不要重写任何远端分支历史；没有用户明确批准时，禁止 `git push --force` / `--force-with-lease`
- 如果功能分支包含了不想让审查看到的旧提交，优先在本地另建 review 分支，不要去改写已有远端分支
- 任务完成后的默认反馈使用精简格式，只包含：
  - `result`
  - `changed files`
  - `blockers/risk`
  - `next step`
- 不做额外 recap；除非用户明确要求展开说明
- 每次开发完成后自动执行完整流程（无需用户提醒）：
  1. `git add` + `git commit` + `git push origin dev`
  2. `scripts/build_docker.sh`（构建镜像）
  3. `scripts/reload_local_stack.sh`（重启容器！build 不会自动重启）

## 构建命令

```bash
# 后端（macOS Java 21 路径特殊）
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn compile -q

# 前端
cd vite-frontend && npm run build

# 磁盘紧张时
LOW_SPACE_MB=2048 scripts/build_docker.sh
```

## Worktree 规则

脏工作区时不要原地切分支：
```bash
git worktree add ../flux-panel-yoga-claude-<topic> -b claude/<topic> origin/dev
```

## 并行协作（Claude + Codex）

当前有两个 AI 代理并行开发，使用 Git worktree 隔离：

| Agent | 工作目录 | 分支 | 职责 |
|-------|---------|------|------|
| Claude Code | `/flux-panel-yoga` (原目录) | `dev` | 监控/资产/看板/前端 |
| Codex | `/flux-panel-yoga-codex-next` (worktree) | `codex/workbench` 基线，实际开发使用 `codex/<topic>` | 独立功能分支开发 |

**规则：**
- Claude **不要修改** Codex 正在开发的 IAM/RBAC 相关代码（`sys_user`/`sys_role`/`sys_permission` 表、`/api/auth` 端点、钉钉集成、`SecurityConfig`）
- 合并顺序：功能分支先 `git rebase origin/dev` 再 `merge --no-ff` 到 dev
- 查看 worktree: `git worktree list`
- `dev` 和任何已推送的远端功能分支都视为共享协作面，默认只允许追加提交，不允许改写历史

## 冲突热点

修改以下文件时保持 diff 精简，不要混合重构和功能：
- `MonitorServiceImpl.java`（~1600行，同步核心）
- `AssetHostServiceImpl.java`
- `DatabaseInitService.java`（Auto-DDL，Codex 也会加表）
- `assets.tsx`（~4600行，含 Provision/Detail/Edit/QuickForward/1PanelQuick 弹窗）
- `server-dashboard.tsx`
- `pom.xml` / `package.json`（依赖变更需协调）

## 架构边界

- `asset_host` = 服务器身份权威层（Flux 为最终数据源）
- `monitor_node_snapshot` = 探针实时快照（探针为数据源）
- `xui_instance` = 3x-ui 注册层
- 同步方向：探针 → snapshot（始终覆盖），snapshot → asset（仅填空字段）
- 删除资产 → 快照标记 `assetUnlinked=1`
- 删除快照 → 软删除 `status=-1`

## 上游集成定位

- Komari / Pika → `monitor_instance.type` 区分
- 3x-ui → `xui_instance` 家族
- 1Panel → `asset_host.panelUrl` 深度链接 + `onepanel_instance` 摘要实例
- JumpServer → `asset_host.jumpserverAssetId` 堡垒机资产绑定
- GOST → `node` 表，通过 `asset_host.gostNodeId` 关联
- OpenClaw → AI 自动化（规划中）

## 资产详情架构

资产详情弹窗（`assets.tsx`）以资产为中心聚合 7 个子系统：

| 子系统 | 数据来源 | 关联方式 |
|--------|---------|---------|
| Komari 探针 | `monitor_node_snapshot` | `asset_host.monitorNodeUuid` |
| Pika 探针 | `monitor_node_snapshot` | `asset_host.pikaNodeId` |
| GOST 代理 | `node` 表 | `asset_host.gostNodeId` ↔ `node.assetId` |
| 隧道 | `tunnel` 表 | `tunnel.sourceAssetId` / `targetAssetId`（通过 GOST nodeId 自动填充） |
| 转发 | `forward` 表 | `forward.remoteSourceAssetId`（精确绑定）+ IP 自动匹配 |
| X-UI | `xui_instance` | `xui_instance.assetId` |
| 1Panel | `onepanel_instance` | `onepanel_instance.assetId` |

### GOST REST API Client

`GostApiClient.java` 封装 GOST v3 HTTP API（通过 `node.apiUrl`），支持：
- `ping()` / `getStatus()` — 检查节点可达性
- `listServices()` / `listChains()` — 查询配置
- `createService()` / `deleteService()` — 远程配置下发

### 服务器初始化脚本

`POST /api/v1/asset/init-scripts` 返回 5 类安装脚本：
- 3X-UI 面板、1Panel 面板、基础工具、开发环境、安装后清理

### 1Panel 快速配置

`POST /api/v1/onepanel/quick-setup` 一步到位：保存 panelUrl + 创建实例 + 返回 Token

## 探针安装命令矩阵

添加服务器时通过 `provisionAllAgents` 生成安装命令。Linux/macOS 使用一键脚本（自动检测架构），Windows 需手动选架构。

### Komari 探针

| 平台 | 海外直连 | 国内加速 |
|------|---------|---------|
| **Linux** | `curl -fsSL {scriptUrl} \| bash -s -- --endpoint {ep} --token {tk}` | `curl -fsSL {ghProxy}/{scriptUrl} \| bash -s -- --install-ghproxy {ghProxy} --endpoint {ep} --token {tk}` |
| **macOS** | `zsh <(curl -sL {scriptUrl}) -e {ep} -t {tk}` | `zsh <(curl -sL {ghProxy}/{scriptUrl}) --install-ghproxy {ghProxy} -e {ep} -t {tk}` |
| **Windows** | PowerShell: 下载 `install.ps1` → 执行 `--endpoint --token` | PowerShell: ghProxy 预装 NSSM → 代理下载 `install.ps1` → `--install-ghproxy` |

- `scriptUrl` = `https://raw.githubusercontent.com/komari-monitor/komari-agent/refs/heads/main/install.sh`
- Windows 使用 `install.ps1`（同仓库）
- 架构自动检测：install.sh/ps1 内部自动识别 amd64/arm64
- ghProxy 默认 `https://ghfast.top`，可在系统配置 `github_proxy_url` 中修改

### Pika 探针

| 平台 | 安装方式 | 架构检测 |
|------|---------|---------|
| **Linux** | `curl -fsSL "{ep}/api/agent/install.sh?token={tk}" \| sudo bash` | 自动（amd64/arm64/loongarch64） |
| **macOS** | `curl -fsSL "{ep}/api/agent/install.sh?token={tk}" \| sudo bash` | 自动（amd64/arm64） |
| **Windows** | PowerShell: `Invoke-WebRequest` 下载 `agent-windows-{arch}.exe` → `register --yes` | 手动选择（前端架构下拉框） |

- Pika 二进制自托管于 Pika 服务器，无需 GitHub 代理，国内外命令相同
- 下载 URL：`{ep}/api/agent/downloads/agent-{os}-{arch}[.exe]?key={token}`
  - Linux: `agent-linux-amd64`, `agent-linux-arm64`, `agent-linux-loong64`
  - macOS: `agent-darwin-amd64`, `agent-darwin-arm64`
  - Windows: `agent-windows-amd64.exe`, `agent-windows-arm64.exe`
- 注册命令：`pika-agent register --endpoint {ep} --token {tk} [--name {name}] --yes`（自动创建配置 + 安装服务 + 启动）

### GOST 代理

| 平台 | 支持 |
|------|------|
| **Linux** | 支持（bash 脚本） |
| **macOS / Windows** | 不支持（前端自动禁用） |

### 资产匹配逻辑

安装新探针后，`autoCreateOrLinkAssetFromNode` 按以下策略匹配已有资产（避免重复创建）：
1. **IPv4 匹配** — `asset_host.primaryIp = node.ip`
2. **IPv6 匹配** — `asset_host.ipv6 = node.ipv6`
3. **名称匹配** — `asset_host.name = node.name`（provision 流程中资产和节点同名）
4. 若均不匹配 → 创建新资产（名称加 UUID 前 4 位后缀防冲突）

`provisionAllAgents` 接收 `assetId` 参数，直接定位目标资产用于重复检测。
