# Flux Panel Yoga Project Analysis

当前文档对应版本：`v1.4.6`

这份文档面向两类读者：

- 需要把本项目接入更大工作区的人
- 需要长期维护本项目的人

它不再讨论“怎么快速部署”，而是回答下面这些问题：

1. 这个项目到底由哪些模块组成
2. 每个模块负责什么
3. 当前哪些数据能力是真实存在的
4. 哪些只是未来可以扩展但当前还没有的
5. 如果要继续集成或重构，哪里是稳定边界

## 1. 仓库结构

```text
.
├── springboot-backend/          # Java 后端
├── vite-frontend/               # React 前端
├── go-gost/                     # 节点代理程序
├── scripts/                     # 本地开发、验证、部署辅助脚本
├── docker-compose-v4.local.yml  # 本地 compose
├── docker-compose-v6.yml        # 服务器 compose
├── gost.sql                     # 初始化数据库
├── README.md                    # 项目主入口
├── CICD_ARCHITECTURE.md         # 发布链路说明
└── LOCAL_MACOS_SETUP.md         # 当前 Mac 的本地开发说明
```

## 2. 前端模块盘点

前端当前是一个管理端主应用，不是单页轻站点。关键页面如下。

### 2.1 首页 `/dashboard`

定位：

- 作为首页，而不是“大而全监控页”
- 只负责摘要和入口

应该回答的问题：

- 现在系统稳不稳
- 最近一次诊断什么时候完成
- 当前有没有异常需要立刻处理
- 下一步应该点去哪里

### 2.2 诊断看板 `/monitor`

定位：

- 真正的诊断集合页
- 承接所有细粒度图表和执行过程

当前包含：

- 手动立即诊断
- 当前执行中的资源名和进度
- 最近完成项滚动反馈
- 24 小时健康轨迹
- 平均延时波峰图
- 节点实时流量
- 隧道累计流量排行
- 转发累计流量排行
- 24 小时账号级计费流量采样
- 诊断记录筛选、展开和单次详情

### 2.3 转发管理 `/forward`

定位：

- 日常最重的业务页之一
- 同时负责 CRUD、筛选、视图切换、批量处理和诊断入口

当前重点：

- 顶部控制板已多轮收敛
- 支持搜索、状态筛选、协议筛选、标签筛选
- 支持全选当前结果和仅选故障项
- 支持批量协议、批量标签、批量删除
- 支持诊断历史与测速详情查看

### 2.4 隧道管理 `/tunnel`

定位：

- 隧道资源管理页
- 比转发管理更偏资源层，而不是具体流量转发规则层

### 2.5 节点监控 `/node`

定位：

- 管理员视角的节点运行态页
- 与诊断看板里的“节点实时流量模块”互补

### 2.6 系统工作台 `/config`

定位：

- 系统级配置页
- 使用左侧导航进行切分

当前分区：

- 基础配置
- 安全登录
- 诊断配置
- 告警通知

### 2.7 资源字典页

- `/user`
- `/limit`
- `/protocol`
- `/tag`

它们共同组成“系统资源层”，一般通过系统工作台和主导航进入。

### 2.8 账号安全页

- `/profile`
- `/change-password`

负责个人安全、默认凭据替换和 2FA 绑定。

## 3. 后端模块盘点

### 3.1 用户与认证

核心文件：

- [UserController.java](springboot-backend/src/main/java/com/admin/controller/UserController.java)
- [UserServiceImpl.java](springboot-backend/src/main/java/com/admin/service/impl/UserServiceImpl.java)

职责：

- 登录
- 验证码
- 默认凭据强制替换
- 2FA 初始化 / 启用 / 关闭 / 校验
- 管理员与用户权限分层

### 3.2 转发与隧道

核心文件：

- [ForwardController.java](springboot-backend/src/main/java/com/admin/controller/ForwardController.java)
- [TunnelController.java](springboot-backend/src/main/java/com/admin/controller/TunnelController.java)

职责：

- 资源 CRUD
- 批量更新
- 单条诊断
- 资源状态控制

### 3.3 诊断系统

核心文件：

- [DiagnosisController.java](springboot-backend/src/main/java/com/admin/controller/DiagnosisController.java)
- [DiagnosisServiceImpl.java](springboot-backend/src/main/java/com/admin/service/impl/DiagnosisServiceImpl.java)

职责：

- 全量诊断调度
- 摘要统计
- 趋势统计
- 历史记录
- 手动立即诊断
- 当前运行态返回
- 企业微信异常 / 恢复通知

### 3.4 流量系统

核心文件：

- [FlowController.java](springboot-backend/src/main/java/com/admin/controller/FlowController.java)
- `StatisticsFlowAsync`

职责：

- 接收节点上报流量
- 累计到用户 / 隧道 / 转发
- 生成账号级小时采样

### 3.5 配置中心

核心文件：

- [ViteConfigController.java](springboot-backend/src/main/java/com/admin/controller/ViteConfigController.java)
- [DatabaseInitService.java](springboot-backend/src/main/java/com/admin/config/DatabaseInitService.java)

职责：

- 保存网站配置
- 初始化默认配置
- 增量数据库迁移

## 4. 关键数据对象

### 4.1 用户域

- `User`
  - 账号、权限、套餐、2FA 状态
- `UserTunnel`
  - 用户与隧道的授权关系

### 4.2 网络资源域

- `Tunnel`
- `Forward`
- `Node`
- `Protocol`
- `Tag`
- `SpeedLimit`

### 4.3 运维观测域

- `DiagnosisRecord`
  - 每次诊断的结果快照
- `StatisticsFlow`
  - 账号级别小时采样流量
- `ViteConfig`
  - 可动态配置的面板参数

## 5. 数据能力与限制

这是后续整合进大工作区时最重要的部分。

### 5.1 已稳定存在的数据能力

1. 转发累计流量
2. 隧道累计流量
3. 节点实时流量
4. 账号级 24H 计费采样
5. 诊断摘要 / 趋势 / 历史 / 当前运行态

### 5.2 当前没有的数据能力

1. 每条隧道按小时的历史流量
2. 每条转发按小时的历史流量
3. 完整的节点侧长期时序存储

所以如果后续你要接 Grafana、Prometheus 或更大中台，需要先明确：

- 当前项目更像“面板 + 诊断快照系统”
- 不是“完整时序监控平台”

## 6. 2FA 与安全逻辑

### 6.1 当前规则

- 默认凭据首次登录必须修改
- 2FA 可配置强制范围：
  - `disabled`
  - `admin`
  - `all`
- 已开启 2FA 的账号登录时必须输入动态码
- 命中强制策略但未绑定的账号会被引导到个人中心完成绑定

### 6.2 绑定方式

- 二维码
- Secret 手工输入
- `otpauth://` URI

### 6.3 重要事实

`otpauth://` 中的 `issuer` 文本会跟随站点名和环境名变化，但它不决定验证码是否正确。真正决定 TOTP 是否可用的是 `secret`。

## 7. 企业微信告警逻辑

当前支持：

- 环境名进入告警标题
- 异常模板
- 恢复模板
- 冷静期节流
- 单次最大异常条数
- 恢复通知可选

当前默认模板能直接用，但系统允许按项目环境定制。

## 8. 本地开发与运行边界

### 8.1 当前 Mac 的真实运行方式

- 实际工作副本：`/Users/mac/Developer/flux-panel-yoga`
- `~/Documents/KS_Work/flux-panel-yoga` 是软链接入口
- 本地 Docker 运行依赖 Colima

### 8.2 为什么有 Colima

在 macOS 上，Docker CLI 只是客户端；要跑 Linux 容器，底层必须有 Linux VM/运行时。Colima 就是这里的本地容器运行时。

如果不用 Colima，也必须换成等价方案，例如：

- Docker Desktop
- OrbStack
- Rancher Desktop

### 8.3 本地脚本边界

- `verify_build.sh`
  - 负责源码构建门禁
- `build_docker.sh`
  - 负责构建本地镜像
- `reload_local_stack.sh`
  - 负责让本地容器真正切到新镜像
- `ship_dev.sh`
  - 负责一条龙验证、提交、重建、推送

## 9. 把它并入更大工作区时的建议

### 9.1 建议保留的稳定入口

1. 根目录脚本入口不改名
2. `springboot-backend` 和 `vite-frontend` 目录名不改
3. 根目录版本文件仍保持三处同步
4. `docker-compose-v4.local.yml` 和 `docker-compose-v6.yml` 保持职责区分

### 9.2 建议作为子系统对待的边界

- 前端：一个独立后台应用
- 后端：一个完整管理 API 服务
- gost 节点：另一个独立可执行系统
- CI/CD：单独的部署子系统

### 9.3 不建议立即做的事

1. 不要先把 `dev-latest` / `latest` 部署入口改掉
2. 不要在没有新时序表的情况下承诺“每隧道 24 小时流量图”
3. 不要把本地 `ship_dev` 简化成直接 `git push`

## 10. 当前技术债与已知问题

1. `site.ts` 仍存在动态和静态混合导入警告
2. 前端主 bundle 体积较大，后续可做分包优化
3. 流量观测仍偏“面板级可运营”而不是“监控级时序平台”
4. 部分页面经过多轮叠加优化，未来仍值得继续做组件级拆分

## 11. 资产层后的数据边界

当前项目已经不适合只按“页面功能”去理解，后续维护时应该按数据域理解：

- `asset_host`
  - 服务器资产主表
  - 承载 VPS 名称、IP、环境、区域、供应商
  - 未来探针、节点监控、转发、X-UI 都应先挂到这层
- `xui_instance`
  - 外部 X-UI / 3X-UI 面板接入层
  - 保存凭据、同步状态、回调 token、资产归属
- `xui_inbound_snapshot` / `xui_client_snapshot`
  - 面板同步下来的协议与客户端快照
  - 当前是只读聚合面，不是主配置源
- `forward`
  - 仍然是 gost 转发核心表
  - 但现在允许通过 `remote_source_*` 记录“远端目标来自哪个 X-UI 节点”

这意味着：

- `X-UI 管理` 负责面板纳管与协议快照
- `服务器资产` 负责跨模块整合视角
- `转发管理` 负责把隧道和远端协议节点真正接起来

当前还未整合但应纳入资产层的下一批对象：

- 探针实例
- 节点监控读数
- 更细的资产健康状态
