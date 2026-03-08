# Claude Code 指引

先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解完整规则。

## 核心约束

- 只修改 `flux-panel-yoga` 仓库，上游仓库（komari, pika, 3x-ui, 1Panel, homepage, jumpserver, openclaw）不可修改
- 使用中文回复
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

## 冲突热点

修改以下文件时保持 diff 精简，不要混合重构和功能：
- `MonitorServiceImpl.java`（~1600行，同步核心）
- `AssetHostServiceImpl.java`
- `DatabaseInitService.java`（Auto-DDL）
- `assets.tsx`（~2800行）
- `server-dashboard.tsx`

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
- 1Panel → `asset_host.panelUrl` 深度链接
- JumpServer → 堡垒机映射（规划中）
- OpenClaw → AI 自动化（规划中）
