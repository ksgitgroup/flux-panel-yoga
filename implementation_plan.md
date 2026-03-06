# Implementation Plan

## Goal

把新的 macOS 开发机接入 Flux Panel 现有的本地测试与云端部署流程，确保本地可以完成编译、Docker 联调和推送到 `dev` / `main`。

## Plan

1. 盘点项目工作流、依赖版本、CI/CD 与本地脚本约束。
2. 补充 macOS 本地初始化能力，避免 `setup_dev.sh` 仅支持 Ubuntu。
3. 修正本地前端开发默认指向旧机器 IP 的问题。
4. 新增迁移文档，明确 D/A -> B -> C 的日常操作。
5. 在这台 Mac 上检查工具链并尽可能完成安装与验证。

## 2026-03-06 Follow-up Plan

1. 压缩“转发管理”顶部筛选区，保留批量处理能力但将交互收敛到 2-3 行。
2. 统一前端、后端、CI 与镜像标签的版本语义，收口到 release version + git short SHA。
3. 强化 `ship_dev` 前置校验，确保本地真实构建成功后才允许推送 `dev`。
4. 修正仪表盘 24 小时流量图的数据范围与展示方式，管理员显示全站聚合，普通用户显示账号范围。

## 2026-03-06 CI Hardening Addendum

1. 去掉 GitLab shell runner 对 `node` 的隐式依赖，避免构建环境差异导致 `build:dev` 失败。
2. 保持 Dev/Prod 实际部署入口仍使用 `dev-latest` / `latest`，把可追踪版本标签作为附加信息而非部署前提。
3. 为本地 Docker 联调补一个固定的容器重载入口，避免 build 成功但 localhost 仍跑旧容器。
4. 把 CI YAML 语法检查并入本地校验流程，阻止坏掉的 `.gitlab-ci.yml` 再次被推送。
