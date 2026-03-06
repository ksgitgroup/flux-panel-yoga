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
