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
