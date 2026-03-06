# Walkthrough

1. 阅读项目的 `.cursorrules`、CI/CD 配置、Docker 编排和外部部署流程说明。
2. 确认当前仓库的本地初始化脚本仅支持 Ubuntu，不适合当前 macOS 机器。
3. 为仓库增加 macOS 初始化脚本，并让 `scripts/setup_dev.sh` 自动分发到对应平台。
4. 修正前端开发环境 API 地址，避免继续指向旧机器 `192.168.100.11`。
5. 增加本地迁移文档，明确本地验证和云端推送的日常流程。
6. 在当前 Mac 上检查 Java、Maven、Node、Docker/Colima 的安装状态。
7. 结论如下：
   - `brew` 已存在
   - `node/npm` 已存在，但当前是 Node 23，不与 CI 的 Node 20 对齐
   - `java`、`mvn`、`docker` 当前不存在
8. 已尝试执行 `./scripts/setup_dev.sh`，安装流程进入 `brew install openjdk@21`，但下载吞吐过慢，故停止长时间后台安装。
9. 已创建本地 `.env` 并执行 `./scripts/verify_build.sh`，结果为预期的工具链阻塞：缺少 Maven。

## 2026-03-06 Follow-up Walkthrough

1. 审查 `forward.tsx` 现有筛选区与批量处理区，确认上轮改造过于臃肿，占用整屏空间。
2. 重构“转发管理”顶部布局：保留搜索、状态/健康分段、隧道/协议筛选、标签筛选、全选与批量操作，但将标签筛选收进 Popover。
3. 审查前端版本来源，发现 `site.ts`、`version.ts`、`package.json`、`pom.xml`、`application.yml` 存在分裂。
4. 用 Vite 构建元信息统一版本展示，新增 `release version` 与 `build revision`，并在管理端与登录页统一展示。
5. 审查 GitLab CI 与 GitHub Actions 镜像标签策略，确认原 `dev-latest` 无法和 git 提交对应。
6. 调整 GitLab CI、GitHub Actions 与 Dockerfile build args，使镜像标签和前端显示都对齐到 `版本号 + 短 SHA`。
7. 升级 `verify_build.sh`，把原来的“后端编译 + 前端装依赖”改成“后端打包 + 前端生产构建 + 版本一致性检查”。
8. 审查仪表盘流量数据链路，确认原接口对普通用户返回账号流量，对管理员也未聚合，因此“全站”文案不准确。
9. 在后端为管理员补全站聚合流量逻辑，并在前端把图表升级为更清晰的趋势面板和摘要指标。
10. 执行 `./scripts/verify_build.sh` 与 `./scripts/build_docker.sh`，确认源码构建与 Docker 镜像构建均通过。

## 2026-03-06 CI Compatibility Walkthrough

1. 复盘本地联调问题，确认 `./scripts/build_docker.sh` 之后如果不重建运行中的容器，`localhost` 仍会保留旧镜像。
2. 复盘 GitLab `build:dev` 失败日志，确认 shell runner 上没有 `node`，而 `.gitlab-ci.yml` 被改出了不必要的运行时依赖。
3. 将 GitLab CI 与 GitHub Actions 的版本读取改回 `awk`，避免增加新的 runner 前置依赖。
4. 保留 GitHub 额外版本标签用于追踪，但恢复 GitLab Dev/Prod 实际部署入口仍使用 `dev-latest` / `latest`。
5. 新增 `scripts/reload_local_stack.sh`，将本地容器重建命令固定下来，避免 compose project name 再次写错。
6. 将 `.gitlab-ci.yml` 与 `.github/workflows/*.yml` 的 YAML 解析检查并入 `./scripts/verify_build.sh`。

## 2026-03-06 Security and Release Walkthrough

1. 审查 GitLab MR 现状，确认仓库内缺少发布模板，导致 `dev -> main` 很容易出现标题仅为 `dev`、描述为空的 MR。
2. 新增 `.gitlab/merge_request_templates/Default.md`，固定发布摘要、变更列表、本地验证、风险与回滚四段结构。
3. 新增 `scripts/prepare_release_mr.sh`，从 `origin/main..HEAD` 自动整理建议标题和提交列表，降低手写发布说明的成本。
4. 在 `.gitlab-ci.yml` 新增 `verify:release-mr` 阶段，仅在 `merge_request_event` 且来源为 `dev`、目标为 `main` 时触发。
5. 新增 `scripts/validate_release_mr.sh`，拒绝标题为 `dev`、标题过短、描述缺章、验证勾选项缺失的发布 MR。
6. 审查当前登录和强制改密链路，确认后端已经要求默认用户名和默认密码同时替换，但前端没有前置提示和校验。
7. 在后端用户表增加 TOTP 2FA 三个字段，并通过 `DatabaseInitService` 做增量迁移，避免要求手工改库或破坏既有部署。
8. 在 `UserServiceImpl` 中补齐登录二步验证码校验、2FA 状态查询、密钥初始化、启用和关闭逻辑，并确保用户列表不会泄露 `twoFactorSecret`。
9. 在前端登录页增加可选 6 位二步验证码输入，并用 `force_password_change` 标识把首次默认凭据用户锁定到 `/change-password`。
10. 重写强制改密页和个人中心：前者明确提示初始化必须同时替换默认用户名/密码，后者增加 2FA 启用/关闭入口。
11. 执行 `./scripts/verify_build.sh`，确认后端打包、前端 `tsc + vite build`、CI YAML 解析全部通过。
12. 执行 `./scripts/build_docker.sh` 和 `./scripts/reload_local_stack.sh`，确认数据库自动迁移日志出现且本地前端 bundle 已包含 2FA 与强制改密代码。
