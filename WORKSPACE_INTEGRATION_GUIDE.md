# Flux Panel Yoga Workspace Integration Guide

当前文档对应版本：`v1.4.6`

这份文档只回答一个问题：如果要把 Flux Panel Yoga 并入更大的父工作区，应该怎么做，哪些边界能动，哪些边界现在不要动。

## 1. 集成目标

建议把 Flux Panel Yoga 视为一个“完整子系统”，而不是一堆前后端零碎文件。

它当前天然包含 4 层：

1. 前端管理应用
2. 后端业务 API
3. 节点转发程序
4. 本地开发 / CI / 部署脚本体系

所以接入父工作区时，目标应该是：

- 保留它作为一个可独立构建、可独立验证、可独立发布的子系统
- 在父工作区之上再做统一编排，而不是先拆散它再重组

## 2. 推荐的父工作区接入方式

### 2.1 推荐方式：子系统模式

建议目录形态：

```text
parent-workspace/
├── services/
│   ├── flux-panel-yoga/
│   │   ├── springboot-backend/
│   │   ├── vite-frontend/
│   │   ├── go-gost/
│   │   ├── scripts/
│   │   ├── README.md
│   │   ├── PROJECT_ANALYSIS.md
│   │   ├── CICD_ARCHITECTURE.md
│   │   └── WORKSPACE_INTEGRATION_GUIDE.md
│   └── other-service/
├── infra/
├── tools/
└── docs/
```

理由：

- Flux Panel Yoga 当前已经有自己的版本体系、脚本入口、compose 文件和发布链路
- 把它平铺打散到父工作区根目录，只会增加路径和责任混乱
- 先以子系统保留，再逐步抽公共能力，风险最低

### 2.2 不建议方式：直接拆散重排

不建议一开始就做这些事：

- 把 `vite-frontend` 提到父工作区统一前端目录
- 把 `springboot-backend` 提到统一后端目录
- 直接改写所有脚本路径
- 先改 Dev/Prod 发布链路
- 一次性把 Docker / CI / 目录结构一起重构

这类操作会同时打断：

- 本地开发链路
- 版本同步链路
- CI/CD 入口
- 文档与真实路径的对应关系

## 3. 当前必须保留的稳定边界

以下内容在接入父工作区时，建议先视为稳定接口，不要轻易改。

### 3.1 稳定目录边界

- `springboot-backend/`
- `vite-frontend/`
- `go-gost/`
- `scripts/`

### 3.2 稳定脚本入口

- `./scripts/setup_dev.sh`
- `./scripts/verify_build.sh`
- `./scripts/build_docker.sh`
- `./scripts/reload_local_stack.sh`
- `./scripts/cleanup_local_artifacts.sh`
- `./scripts/ship_dev.sh`
- `./scripts/sync_dev.sh`

### 3.3 稳定版本入口

这三处版本必须始终同步：

- `vite-frontend/package.json`
- `springboot-backend/pom.xml`
- `springboot-backend/src/main/resources/application.yml`

### 3.4 稳定部署入口

Dev/Prod 当前实际部署入口标签不要改：

- Dev: `dev-latest`
- Prod: `latest`

版本化 tag 目前只是追踪信息，不是部署入口。

## 4. 父工作区里适合抽象的边界

以下内容适合后续逐步向父工作区抽象，但不建议在第一步做。

### 4.1 文档入口

可以在父工作区做统一目录，例如：

- `docs/services/flux-panel-yoga/`

但原仓库内文档仍应保留，不能只留父工作区副本。

### 4.2 运维与监控汇聚

可以逐步把这些能力接到父工作区统一基础设施：

- 日志聚合
- 监控采集
- 告警汇总
- 统一环境变量管理

### 4.3 CI 编排入口

可以在父工作区上层增加统一流水线编排，但要保留 Flux Panel Yoga 自身的校验与发布入口，不要直接删除本项目 CI 文件。

## 5. 当前集成时最重要的技术事实

### 5.1 它不是纯前后端 CRUD 项目

这个项目同时包含：

- 管理端 UI
- 业务 API
- 分布式节点代理程序
- 流量与诊断体系
- 部署与数据库初始化逻辑

所以不能按“普通后台管理系统”去集成。

### 5.2 流量能力有边界

当前项目可以稳定提供：

- 节点实时流量
- 转发累计流量
- 隧道累计流量
- 账号级 24 小时计费采样

当前项目还不能稳定提供：

- 每隧道 24 小时历史流量曲线
- 每转发 24 小时历史流量曲线

父工作区如果要统一“时序观测平台”，必须把这块视为后续扩展项，不要误判为现成能力。

### 5.3 诊断系统已经是独立子域

“诊断看板”现在不只是 UI 页，而是有完整的后端运行态和记录体系：

- 立即诊断
- 当前执行项
- 进度
- 最近完成项
- 趋势
- 历史
- 企业微信告警

这块可以单独看作“诊断子系统”。

## 6. 推荐的父工作区拆分视角

建议把 Flux Panel Yoga 在父工作区中拆成下面几个逻辑子域，而不是按语言拆。

### 6.1 `control-plane`

包含：

- 前端管理应用
- 后端控制 API
- 配置中心
- 用户与权限

### 6.2 `diagnosis-observability`

包含：

- 诊断调度
- 诊断记录
- 健康趋势
- 节点实时流量
- 告警模板与企业微信通知

### 6.3 `network-runtime`

包含：

- `go-gost`
- 节点上报
- 转发实际运行逻辑

### 6.4 `delivery-runtime`

包含：

- GitLab CI
- GitHub Actions
- Docker Hub 标签策略
- `remote_deploy.sh`
- 本地开发脚本

这种拆分更符合项目真实职责，也方便以后在父工作区里按能力域接入。

## 7. 集成优先级建议

### 阶段 1：只纳管，不拆骨架

先做：

- 把仓库放入父工作区固定目录
- 保留当前目录结构
- 保留当前脚本入口
- 保留当前 CI/CD
- 保留当前文档

### 阶段 2：统一外围元数据

再做：

- 父工作区统一文档导航
- 统一 issue / roadmap / 变更记录入口
- 统一观测平台接入说明

### 阶段 3：抽公共能力

最后才考虑：

- 公共 UI 组件抽离
- 公共鉴权 / 账号体系整合
- 公共告警渠道整合
- 公共监控基础设施整合

## 8. 集成时禁止先动的项目

1. 不要先改 `ship_dev.sh` 流程
2. 不要先改 `dev-latest` / `latest` 部署入口
3. 不要先删除 `.gitlab-ci.yml` 或 GitHub Actions
4. 不要把 `go-gost` 当成可随意丢开的历史目录
5. 不要在没有新增数据表的情况下承诺更细的流量时序能力
6. 不要把当前 README、分析文档和本地说明删成父工作区单一入口

## 9. 推荐的父工作区对接清单

### 9.1 文档对接

- 把 README 作为父工作区索引页的子入口
- 把 PROJECT_ANALYSIS 作为系统分析入口
- 把 CICD_ARCHITECTURE 作为发布说明入口
- 把 LOCAL_MACOS_SETUP 作为当前开发机说明入口

### 9.2 工程对接

- 保留本项目独立的 `verify_build.sh`
- 父工作区统一脚本最多包装调用，不要替换掉项目脚本
- 父工作区如果要做总构建，Flux Panel Yoga 应作为单独子任务

### 9.3 运维对接

- 可以接统一监控、日志、告警出口
- 但不要破坏当前企业微信与诊断运行态逻辑

## 10. 下一步如果继续做集成，建议的第一批工作

1. 在父工作区建立统一目录映射，而不是先改 Flux Panel Yoga 内部路径
2. 建一个父工作区索引文档，把本项目 4 份核心文档挂进去
3. 定义父工作区和本项目之间的责任边界
4. 再决定是否要统一 CI 入口、监控入口和账号体系
