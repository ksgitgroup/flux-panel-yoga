# Agent 指引

本文件面向所有 AI 编程代理（Codex、Claude Code 等）。

## 必读

1. 先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)（完整规则）
2. Claude Code 还应阅读 [CLAUDE.md](CLAUDE.md)

## 核心规则

- **只修改** `flux-panel-yoga`，上游仓库（komari, pika, 3x-ui, 1Panel, homepage, jumpserver, openclaw）只读
- 分支 `dev` 是集成分支，脏工作区用 worktree 隔离
- Schema 变更必须向后兼容（只加字段，不删字段）
- `asset_host` 是服务器身份权威层，探针同步不覆盖用户编辑

## 构建验证

```bash
# 后端
cd springboot-backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn compile -q

# 前端
cd vite-frontend && npm run build

# Docker 构建 + 重启
scripts/build_docker.sh && scripts/reload_local_stack.sh
```

## 冲突热点

修改以下文件时 diff 要精简，避免混合重构和功能：
- `MonitorServiceImpl.java`、`AssetHostServiceImpl.java`、`DatabaseInitService.java`
- `assets.tsx`、`server-dashboard.tsx`
