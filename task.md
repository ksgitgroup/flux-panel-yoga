# Task

为新的 macOS 本地开发机补齐 Flux Panel 的迁移与测试流程，使其可以：

- 初始化本地开发环境
- 完成后端编译和前端依赖校验
- 完成本地 Docker 联调
- 将验证后的代码推送到 GitLab `dev` / `main`

## Current Result

- 已新增 macOS 专用初始化脚本 `scripts/setup_dev_macos.sh`
- 已让 `scripts/setup_dev.sh` 在 macOS 上自动转发到新脚本
- 已新增本地迁移文档 `LOCAL_MACOS_SETUP.md`
- 已把前端开发环境默认 API 地址改为 `http://localhost:6365`
- 已在本机生成本地 `.env`
- 已执行 `./scripts/verify_build.sh`

## Current Blocker

- 这台 Mac 当前仍缺少 Java 21 / Maven / Docker 运行时
- 自动安装已尝试，但 `brew install openjdk@21` 因下载速度过慢被中断
- 当前校验脚本停在 `未检测到 Maven，请先运行 scripts/setup_dev.sh`

## 2026-03-06 Follow-up Result

- 已将“转发管理”顶部交互压缩为紧凑工具栏，保留搜索、状态/健康筛选、隧道/协议筛选、标签筛选、全选当前结果与批量操作。
- 已统一版本号来源：`vite-frontend/package.json`、`springboot-backend/pom.xml`、`application.yml` 当前同步为 `1.4.3`。
- 已让前端展示、Docker 构建参数、GitLab CI、GitHub Actions 镜像标签全部对齐到 `release version + git short SHA`。
- 已把 `./scripts/verify_build.sh` 升级为真实构建门禁：后端 `mvn clean package` + 前端 `npm run build` + 版本一致性检查。
- 已将仪表盘流量图改为范围明确的趋势卡片；管理员使用全站聚合流量，普通用户显示账号范围流量。
- 已完成本地源码构建校验与本地 Docker 镜像构建校验。

## 2026-03-06 CI Compatibility Result

- 已修复 `.gitlab-ci.yml` YAML 语法问题。
- 已移除 GitLab shell runner 对 `node` 的依赖，改用 `awk` 读取版本号。
- 已恢复 Dev/Prod 实际部署仍使用 `dev-latest` / `latest`，避免破坏既有部署入口。
- 已新增 `scripts/reload_local_stack.sh`，专门处理“本地镜像已构建但容器仍是旧版本”的问题。
- 已将 CI YAML 语法检查纳入 `./scripts/verify_build.sh`。

## 2026-03-06 Security and Release Result

- 已新增 `scripts/prepare_release_mr.sh` 和 `.gitlab/merge_request_templates/Default.md`，用于生成/复用 `dev -> main` 的发布 MR 标题与描述。
- 已在 `.gitlab-ci.yml` 中增加仅针对 `dev -> main` MR 的 `verify:release-mr` 校验，阻止标题为 `dev` 或缺少发布说明的 MR。
- 已为 `user` 表增加 `two_factor_enabled`、`two_factor_secret`、`two_factor_bound_at` 三个增量字段，并通过 `DatabaseInitService` 自动迁移。
- 已新增后端 2FA 登录校验、状态查询、初始化、启用和关闭接口。
- 已在前端登录页增加 6 位二步验证码输入，在个人中心增加二步验证启用/关闭流程。
- 已修复首次默认凭据修改流程：前端现在会明确提示并阻止继续使用默认用户名 `admin_user` 和默认密码。
- 已执行 `./scripts/verify_build.sh`、`./scripts/build_docker.sh` 和 `./scripts/reload_local_stack.sh`。

## 2026-03-07 Security and Runtime Result

- 已新增 `two_factor_enforcement_scope` 配置项，支持 `disabled / admin / all` 三种二步验证强制策略。
- 已让登录流程支持“强制绑定 2FA”的受控放行：密码验证通过后，未绑定用户会被锁定到个人中心完成 2FA 设置。
- 已在个人中心补充 2FA 二维码展示，同时保留密钥和 `otpauth://` 绑定地址复制。
- 已修复“转发管理 -> 诊断”历史记录对旧格式 `results_json` 的渲染兼容问题，避免点击后页面闪退。
- 已新增 `scripts/cleanup_local_artifacts.sh`，并接入 `build_docker.sh`、`reload_local_stack.sh`、`ship_dev.sh`。
- 已实际执行一次清理，将本机可用空间从约 `1.7G` 提升到约 `5.0G`，随后完成重建和重载。
