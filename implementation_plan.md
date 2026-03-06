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

## 2026-03-06 Security and Release Addendum

1. 为 `dev -> main` 增加可复用的 MR 模板与 CI 校验，阻止标题仅为 `dev` 的发布申请进入合并流程。
2. 以增量数据库迁移方式为用户表补充 TOTP 二步验证字段，不改变现有构建和部署入口。
3. 打通登录页、首次强制改密页和个人中心的 2FA / 默认凭据校验闭环，保持前后端规则一致。

## 2026-03-07 Security and Runtime Addendum

1. 将 2FA 安全策略提升为可配置的“关闭 / 仅管理员强制 / 全站强制”，并保持前后端强制流转一致。
2. 为 2FA 绑定补充二维码展示，保留密钥和 `otpauth://` 作为兜底导入方式。
3. 修复“转发管理”诊断历史对旧结构 `results_json` 的渲染兼容问题，消除点击诊断后前端崩溃。
4. 为本地构建、容器重载和推送流程增加自动清理步骤，持续回收 SSD 空间。

## 2026-03-07 Auth Refresh and Versioning Addendum

1. 让前端路由守卫在刷新时重新向后端确认 2FA 强制状态，而不是仅依赖登录时写入的本地标记。
2. 将发布版本同步提升到 `1.4.4`，并保持 `package.json`、`pom.xml`、`application.yml` 一致。
3. 调整 `ship_dev.sh`，在创建 commit 后按最新 commit 重建本地镜像并重载容器，再推送到 `origin/dev`。
4. 明确本机真实工作副本和 Docker Compose 工作目录均为 `/Users/mac/Developer/flux-panel-yoga`，避免归档目录和当前运行时混淆。
