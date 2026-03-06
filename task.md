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
