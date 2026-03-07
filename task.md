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
- 已统一版本号来源：`vite-frontend/package.json`、`springboot-backend/pom.xml`、`application.yml` 当前同步为 `1.4.4`。
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

## 2026-03-07 Auth Refresh and Versioning Result

- 已让前端在页面刷新后重新读取后端 2FA 状态，管理员开启强制 2FA 后无需退出重登即可被引导到个人中心绑定。
- 已确认当前真实工作副本和 Docker Compose 工作目录都是 `/Users/mac/Developer/flux-panel-yoga`，`~/Documents/KS_Work/flux-panel-yoga` 仅为软链接入口。
- 已将前后端及运行时版本统一提升到 `1.4.4`。
- 已将 `ship_dev.sh` 调整为“验证通过 -> 创建 commit -> 按新 commit 重建本地容器 -> 推送 dev”的固定流程。

## 2026-03-07 Forward Console Layout Result

- 已将桌面端 `AdminLayout` 重构为横向头部导航，主业务页集中在顶部主导航，后台管理能力收敛到右上角“系统”菜单。
- 已将“网站配置”从主导航移入右上角系统菜单，减少全局导航占用。
- 已重构“转发管理”顶部控制区，将视图切换、导入导出、新增转发、搜索筛选、统计信息和批量动作合并到单一控制板。
- 已修正“全选当前结果 / 仅选故障项”对隐藏项的处理逻辑，筛选后批量选择不再无意丢掉隐藏选择。
- 已为转发卡片底部测速历史增加单次详情弹窗，可查看某一次测速的节点级结果、延迟和丢包信息。

## 2026-03-07 Disk Hygiene Result

- 已确认当前“本地运行工具链本体”并不接近 20G：`openjdk@21` 约 `332M`、`maven` 约 `11M`、`node@20` 约 `57M`。
- 已确认主要占用来自 Docker/Colima 运行时与缓存：`.colima` 约 `7.8G`、Docker 本地镜像约 `2.2G`、Homebrew 缓存约 `610M`、npm 全局缓存约 `654M`、Maven 仓库约 `203M`。
- 已扩展 `scripts/cleanup_local_artifacts.sh`，新增 `deep-host` 模式，用于在空间极低时进一步回收宿主机缓存与未使用的 Docker 资源。

## 2026-03-07 Staged 2FA and Cleanup Hardening Result

- 已将登录流程改为分布式两段验证：首屏只提交用户名、密码和验证码；若账号启用 2FA，后端只返回短时 challenge，不再直接签发登录 token。
- 已新增 `/api/v1/user/login/2fa` 二次验证接口，只有 challenge 和 6 位 TOTP 同时通过后才允许真正登录。
- 已修复日志泄露风险：`LogAspect` 现在会统一脱敏 `password`、`token`、`twoFactorCode`、`secret`、`otpauthUri`、`encryptedPassword`、`challengeToken` 等敏感字段，避免登录、2FA 绑定和 x-ui 管理接口把明文敏感值写入日志。
- 已确认 x-ui 凭据仍为服务端 AES 加密存库，前端列表接口只返回 `passwordConfigured` 状态，不回显明文或密文密码。
- 已将低空间预检接入 `verify_build.sh` 与 `build_docker.sh`，当可用空间不足时会先触发 `pre-build` 清理，仍不足再升级到 `deep-host` 清理，并在低于安全阈值时提前失败而不是在构建中途爆盘。
- 已将清理收口调整为可见日志，并通过 `EXIT` trap 接入 `build_docker.sh`、`reload_local_stack.sh`、`ship_dev.sh`、`sync_dev.sh`，确保成功或失败后都会尝试回收本地垃圾和多余 Docker 资源。

## 2026-03-07 CI Release Visibility Result

- 已移除 `.gitlab-ci.yml` 中对 `dev -> main` MR 标题和描述的强制校验，不再因为 MR 文案缺失阻塞合并。
- 已新增 `scripts/print_ci_commit_summary.sh`，让 `build:dev` 和 `build:prod` 自动在 CI 日志中打印本次版本号、当前提交和提交摘要。
- 已保留 `scripts/prepare_release_mr.sh` 与 `.gitlab/merge_request_templates/Default.md` 作为可选工具，但不再要求每次发布手工填写。

## 2026-03-07 Documentation Consolidation Result

- 已重写根目录 `README.md`，将其升级为项目主入口，完整覆盖项目定位、架构、功能模块、流量与诊断能力边界、本地开发、版本语义、部署链路和脚本索引。
- 已重写 `CICD_ARCHITECTURE.md`，同步到当前实际生效的 GitLab / GitHub Actions / Docker Hub / Dev B / Prod C 链路。
- 已重写 `PROJECT_ANALYSIS.md`，从前端页面、后端控制器、关键实体、观测能力、2FA、告警与工作区整合建议等维度做长期维护说明。
- 已重写 `LOCAL_MACOS_SETUP.md`，明确这台 Mac 的真实工作副本、Colima 角色、标准开发流程和磁盘清理策略。
- 已更新 `vite-frontend/README.md`，移除默认模板内容，改为当前前端子模块的职责说明并链接回根文档。

## 2026-03-07 Workspace Integration Result

- 已新增 `WORKSPACE_INTEGRATION_GUIDE.md`，给出父工作区接入方案、稳定边界、推荐目录、分阶段整合建议和禁止先动项。
- 已新增 `AI_HANDOFF.md`，明确新 AI / 新进程的必读文档顺序、工程约束、数据边界、安全逻辑、磁盘约束和沟通逻辑。
- 已将必读顺序和关键边界同步写入 `README.md` 与 `.cursorrules`，降低后续整合和交接时的上下文丢失风险。

## 2026-03-07 X-UI Integration Phase 1 Result

- 已在后端新增独立的 `x-ui integration` 子域，未复用原有 `node / tunnel / forward` 语义。
- 已通过 `DatabaseInitService` 增量创建 `xui_instance`、`xui_inbound_snapshot`、`xui_client_snapshot`、`xui_sync_log`、`xui_traffic_delta_event` 五张表，确保 A / B / C 环境升级时自动生效。
- 已新增管理员专用的 `XuiController` 与 `XuiService`，支持实例 CRUD、连接测试、手动同步、自动轮询同步和 `3x-ui` 外部流量上报接收。
- 已为 x-ui 登录密码增加服务端 AES 加密存储，前端和列表接口均不会回显明文密码；当前快照也只保存脱敏元数据，不落盘远端客户端 UUID / 密码等业务凭据。
- 已新增前端 `X-UI 管理` 页面，并接入系统工作台导航，支持实例管理、状态查看、测试连接、立即同步和已同步入站/客户端快照展示。
- 已执行 `./scripts/verify_build.sh`，确认后端打包、前端 `tsc + vite build` 和 CI YAML 校验全部通过。
- 已执行 `./scripts/build_docker.sh`，确认前后端 Docker 镜像均可构建成功，新增模块可进入现有本地容器运行链路。
