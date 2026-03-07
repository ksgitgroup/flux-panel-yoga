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

## 2026-03-07 Security and Runtime Walkthrough

1. 审查上轮 2FA 实现，确认当前能力只支持用户自愿启用，尚未具备“管理员强制 / 全站强制”的策略层。
2. 为 `vite_config` 增加 `two_factor_enforcement_scope` 默认配置，后端登录逻辑按 `disabled / admin / all` 决定当前账号是否必须启用 2FA。
3. 调整登录返回结构：对于受策略约束但尚未绑定 2FA 的账号，返回 `requireTwoFactorSetup`，前端将该用户锁定到 `/profile` 完成绑定。
4. 在个人中心引入二维码展示，并通过 `qrcode` 包把 `otpauth://` 地址渲染成可扫码的本地 Data URL，降低绑定门槛。
5. 复盘“转发管理 -> 诊断”闪退，确认根因是历史诊断记录里的 `results_json` 存的是完整报告对象，而前端直接把 `JSON.parse(resultsJson)` 当数组渲染。
6. 在前端补一个兼容解析器，同时兼容旧结构 `{ results: [...] }` 和直接数组结构，避免 `parsedResults.map is not a function` 一类崩溃。
7. 盘点本机磁盘占用，确认 `/System/Volumes/Data` 一度仅余约 `1.7G`，Docker 可回收镜像约 `1.3G`，项目本地 `.cache/npm` 约 `651M`。
8. 新增 `scripts/cleanup_local_artifacts.sh`，清理 `target`、`dist`、项目级 npm 缓存，以及不再被容器使用的 Docker 镜像。
9. 先执行一次 `post-reload` 清理，把可用空间提升到约 `5.0G`，再继续完成 `./scripts/build_docker.sh` 和 `./scripts/reload_local_stack.sh`。
10. 通过 localhost bundle 检查，确认强制 2FA、二维码逻辑和诊断历史兼容文案都已经进入实际运行版本。

## 2026-03-07 Auth Refresh and Versioning Walkthrough

1. 复盘管理员强制 2FA 行为，确认当前前端只在登录返回时写入 `force_two_factor_setup`，刷新页面后不会重新向后端确认。
2. 在 `App.tsx` 中补充认证状态同步钩子，让受保护路由和登录页在刷新时调用 `/user/2fa/status`，重新计算是否必须进入 `/profile`。
3. 审查版本显示链路，确认 `v1.4.3` 仍然来自 `package.json` / `pom.xml` / `application.yml`，因此将三处统一提升到 `1.4.4`。
4. 审查本地运行栈，确认 Docker Compose 实际工作目录为 `/Users/mac/Developer/flux-panel-yoga`，而 `~/Documents/KS_Work/flux-panel-yoga` 只是软链接入口。
5. 调整 `scripts/ship_dev.sh`，在创建 commit 后追加 `build_docker.sh` 与 `reload_local_stack.sh`，确保本地 UI 的提交标识同步到刚提交的新 SHA。
6. 执行 `./scripts/verify_build.sh`，确认后端 `admin-1.4.4.jar`、前端 `flux-panel@1.4.4 build` 和 CI YAML 校验全部通过。
7. 执行 `./scripts/build_docker.sh` 与 `./scripts/reload_local_stack.sh`，确认本地容器已切到最新 `local` 镜像且运行目录仍指向 `/Users/mac/Developer/flux-panel-yoga`。

## 2026-03-07 Forward Console Layout Walkthrough

1. 审查 `AdminLayout` 与 `ForwardPage`，确认当前桌面端布局同时存在左侧栏和顶部条，导致首屏被导航结构吃掉。
2. 将桌面端后台改为横向头部布局：左侧保留品牌与版本信息，中间聚合主业务导航，右侧收敛系统管理、用户菜单和时间信息。
3. 将 `网站配置` 从主导航中移走，合并进右上角系统下拉菜单，避免和主业务入口抢占导航权重。
4. 重构“转发管理”顶部区域，把视图切换、导入、导出、新增转发并入同一控制板，并让搜索、Tabs、Select 筛选和批量操作成为连续的交互流。
5. 优化筛选后的批量选择逻辑：全选当前结果和仅选故障项只替换当前可见结果，不再误清空隐藏选择。
6. 将转发卡片底部测速历史改为可点击查看详情，新增单次测速详情弹窗，直接展示节点链路、目标地址、延迟和丢包结果。
7. 执行 `./scripts/verify_build.sh`，确认新的后台布局和转发页交互在 `tsc + vite build` 下通过。

## 2026-03-07 Disk Hygiene Walkthrough

1. 审查用户机器实际磁盘占用，确认当前剩余空间仅约 `1.5GiB`，不能再把问题模糊归因于“Java/Maven 安装本身”。
2. 用 `du` 和 `docker system df` 拆分占用来源，确认最大项依次为 `.colima`、Docker 镜像、Homebrew 缓存、npm 全局缓存和 Maven 仓库。
3. 保留原 `cleanup_local_artifacts.sh` 的轻量自动清理逻辑，用于每次构建后回收项目内 `target/dist/.cache` 和无用 Docker 镜像。
4. 追加 `deep-host` 模式，专门处理磁盘告急场景，额外清理 Homebrew 缓存、npm 全局缓存、Maven 失效元数据以及未使用的 Docker 容器/网络/volume。
5. 明确 `.colima` 是本地 Docker/Colima 虚拟机磁盘，本身就是开发环境的主要占用项；如果要继续大幅回收，只能停用本地 Docker 并删除或重建 Colima。

## 2026-03-07 CI Release Visibility Walkthrough

1. 复盘 MR 15 失败日志，确认并非生产构建逻辑损坏，而是 `validate_release_mr.sh` 对 `dev -> main` 的 MR 标题/描述进行了强制校验。
2. 根据“不要手工维护 MR 文案”的新要求，删除 `.gitlab-ci.yml` 中的 `verify:release-mr` 门禁 job。
3. 新增 `scripts/print_ci_commit_summary.sh`，在 `build:dev` / `build:prod` 阶段自动输出版本号、当前短 SHA 和本次提交摘要。
4. 保留 MR 模板与 `prepare_release_mr.sh` 作为人工发布说明的可选工具，但从“必填门禁”降级为“辅助工具”。

## 2026-03-07 Documentation Consolidation Walkthrough

1. 先盘点根目录现有 Markdown，确认 `README.md`、`CICD_ARCHITECTURE.md`、`PROJECT_ANALYSIS.md`、`LOCAL_MACOS_SETUP.md` 和 `vite-frontend/README.md` 中存在大量历史内容、模板内容或与当前实现不一致的说明。
2. 结合当前代码、脚本、CI 配置和最近几轮改造结果，重新划分文档边界：
   - `README.md` 负责“第一次进入仓库时需要知道的一切”
   - `CICD_ARCHITECTURE.md` 只负责当前实际发布链路
   - `PROJECT_ANALYSIS.md` 只负责长期维护和并入更大工作区时的结构理解
   - `LOCAL_MACOS_SETUP.md` 只负责这台 Mac 的真实开发方式
3. 审查 `scripts/ship_dev.sh`、`verify_build.sh`、`build_docker.sh`、`reload_local_stack.sh`、`cleanup_local_artifacts.sh`、`.gitlab-ci.yml`、GitHub Actions 和前后端模块目录，确保文档按当前真实行为编写，而不是按旧方案或记忆编写。
4. 重写根 README，补齐首页/诊断看板/系统工作台重构后的功能模块、流量与诊断边界、版本语义、脚本索引和 Dev/Prod 部署逻辑。
5. 重写前端子目录 README，去掉原 HeroUI 模板说明，改成当前子项目职责和根文档入口说明。

## 2026-03-07 Workspace Integration Walkthrough

1. 在总文档之外新增 `WORKSPACE_INTEGRATION_GUIDE.md`，把“父工作区如何接入本项目”单独拆出来，避免后续集成时只能从 README 大段内容里反复翻找。
2. 明确给出推荐方案：先作为独立子系统接入，再逐步抽公共能力，而不是一开始就拆散 `springboot-backend`、`vite-frontend`、`go-gost` 和 `scripts`。
3. 梳理稳定边界：目录、脚本入口、版本同步位置、Dev/Prod 部署入口标签，作为父工作区整合时暂时不可破坏的基线。
4. 新增 `AI_HANDOFF.md`，专门面向下一个 AI / 进程，写明必须阅读的文档顺序、当前最核心事实、工程约束、数据边界与沟通原则。
5. 将“必读顺序”和“不要伪造超出当前数据能力的图表”同步写入 `.cursorrules`，让规则层也能提醒后续协作者。
