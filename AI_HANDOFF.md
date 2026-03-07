# Flux Panel Yoga AI Handoff

当前文档对应版本：`v1.4.6`

这份文档是给“下一个 AI 工具 / 进程 / 协作者”看的。目标只有一个：避免上下文丢失和重复踩坑。

## 1. 下一个 AI 在开始前必须读什么

按顺序读，不要跳。

1. [README.md](README.md)
2. [PROJECT_ANALYSIS.md](PROJECT_ANALYSIS.md)
3. [CICD_ARCHITECTURE.md](CICD_ARCHITECTURE.md)
4. [LOCAL_MACOS_SETUP.md](LOCAL_MACOS_SETUP.md)
5. [WORKSPACE_INTEGRATION_GUIDE.md](WORKSPACE_INTEGRATION_GUIDE.md)
6. [.cursorrules](.cursorrules)
7. [task.md](task.md)
8. [walkthrough.md](walkthrough.md)

如果是接手集成父工作区的任务，`WORKSPACE_INTEGRATION_GUIDE.md` 不能省。

## 2. 当前最核心的项目事实

1. 真实工作副本是：`/Users/mac/Developer/flux-panel-yoga`
2. `~/Documents/KS_Work/flux-panel-yoga` 只是软链接入口
3. 当前标准开发出口是：`./scripts/ship_dev.sh`
4. 当前版本是：`v1.4.6`
5. 当前 `dev` 最新提交是文档收口后的状态，不能再按旧文档理解项目

## 3. 当前最核心的工程约束

1. 任何修改后先跑 `./scripts/verify_build.sh`
2. 通过后用 `./scripts/ship_dev.sh "..."` 推到 `dev`
3. 本地构建后如果要看到新页面，必须 `./scripts/reload_local_stack.sh`
4. 版本号必须保持三处同步：
   - `vite-frontend/package.json`
   - `springboot-backend/pom.xml`
   - `springboot-backend/src/main/resources/application.yml`
5. Dev/Prod 部署入口标签不要改：
   - `dev-latest`
   - `latest`

## 4. 当前最核心的产品与数据边界

1. 首页已经被重新定义为“摘要入口页”，不是全量监控页
2. 诊断看板才是详细图表和执行态入口
3. 当前可以稳定展示：
   - 节点实时流量
   - 转发累计流量
   - 隧道累计流量
   - 账号级 24H 计费采样
4. 当前不能稳定展示：
   - 每隧道 24H 历史流量曲线
   - 每转发 24H 历史流量曲线
5. 不要把“累计流量”误写成“小时级历史流量”

## 5. 当前最核心的安全逻辑

1. 首次登录必须同时改默认用户名和默认密码
2. 2FA 支持：
   - 用户自愿开启
   - 管理员强制
   - 全站强制
3. 2FA 绑定支持：
   - 二维码
   - Secret
   - `otpauth://`
4. `issuer` 文本跟站点名/环境名有关，但真正影响 TOTP 正确性的核心是 `secret`

## 6. 当前最核心的运维逻辑

1. GitLab 负责主仓库和部署编排
2. GitHub Actions 负责构建 Docker Hub 镜像
3. 开发环境 B 自动部署
4. 生产环境 C 手动确认部署
5. 当前 CI 日志会自动打印本次提交摘要，不再依赖强制 MR 文案校验

## 7. 当前最核心的磁盘与本地环境约束

1. 这台 Mac 空间紧张
2. 构建后必须保留清理动作
3. 主要大头不是 Java/Maven，而是：
   - Colima
   - Docker 镜像
   - builder cache
4. 低于约 `5 GiB` 时，优先执行：

```bash
./scripts/cleanup_local_artifacts.sh deep-host
```

## 8. 和用户继续协作时的沟通逻辑

必须遵守：

1. 先确认“这次要改的是产品交互、工程链路、还是部署/环境”
2. 不要把临时分析当结果，要落到文件和流程里
3. 如果发现能力边界不成立，要直接讲清楚，不能用假图表或假数据糊过去
4. 如果改动会影响 Dev/Prod 既有链路，要优先保兼容
5. 如果是结构性变化，必须同步更新文档和记录文件

## 9. 如果继续做父工作区整合，下一步优先级

1. 先按 `WORKSPACE_INTEGRATION_GUIDE.md` 做目录级接入
2. 保留本项目作为独立子系统
3. 先纳管，再抽公共能力
4. 不要先拆散前后端和脚本体系
