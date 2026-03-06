# Implementation Plan

## Goal

把新的 macOS 开发机接入 Flux Panel 现有的本地测试与云端部署流程，确保本地可以完成编译、Docker 联调和推送到 `dev` / `main`。

## Plan

1. 盘点项目工作流、依赖版本、CI/CD 与本地脚本约束。
2. 补充 macOS 本地初始化能力，避免 `setup_dev.sh` 仅支持 Ubuntu。
3. 修正本地前端开发默认指向旧机器 IP 的问题。
4. 新增迁移文档，明确 D/A -> B -> C 的日常操作。
5. 在这台 Mac 上检查工具链并尽可能完成安装与验证。
