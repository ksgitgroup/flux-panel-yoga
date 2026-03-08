# Flux Panel Yoga 更新日志

## v1.4.7-dev (2026-03-08)

### 同步逻辑改进
- 删除资产时探针快照标记 `assetUnlinked=1`，防止下次同步自动重建资产
- 删除探针节点改为软删除（`status=-1`），同步时跳过不会重现
- `refreshAssetFromProbe` OS 字段改为仅填空逻辑，Flux 为资产数据权威来源
- Dashboard/Unbound 查询过滤软删除节点
- 同步循环跳过软删除节点，removed 节点查询排除软删除

### 看板图表增强
- 双探针图表改为左右并排对比布局，单探针保持全宽
- 图表时间轴增加日期（MM/DD）显示
- 新增温度、GPU、进程数图表系列（Komari + Pika）
- 详情面板补充厂商/标签/月费/带宽/SSH/购买日/1Panel/备注等资产字段

### 资产与看板增强
- 资产/看板增加地区/OS/厂商快速筛选
- 扩展搜索支持 IPv6、操作系统、架构、虚拟化、面板地址、月费
- URL 参数支持（`?viewId=123` 打开详情，`&deploy=1` 打开部署面板）
- 看板服务器计数按资产去重（双探针同一服务器计为一台）

### BUG 修复
- 看板"部署探针"按钮跳转到资产编辑页+部署面板（原跳转到探针后台）
- 看板资产标签点击跳转到对应资产详情页（原跳转到资产列表页）
- 1Panel 绑定输入框使用独立状态，防止输入字符即触发已绑定
- Select 空白选项修复 + osCategory 字段补充

### 文档
- 新增 CONTRIBUTING.md / CLAUDE.md / AGENTS.md 协作开发指引
- 更新 README.md 版本号、探针监控体系、协作开发说明
- 新增 CHANGELOG v1.4.7 条目

---

## v1.4.6-dev (2026-03-07)

### 本次更新总览

本次更新围绕「资产为中心」的架构理念，完成了 XUI/资产/转发三大板块的交互优化、移动端适配、以及 Monitor 探针模块的后端基础建设。

---

### 一、XUI 板块优化

**文件**: `vite-frontend/src/pages/xui.tsx`

1. **实例名自动填充**: 新建 XUI 实例时，选择绑定资产后自动以资产名称填充实例名，无需手动输入。用户仍可手动修改覆盖。
2. **表单重组**: 资产选择提升到表单顶部，增加分组标题（绑定资产 / 实例信息 / 登录凭据 / 同步设置），移除冗余的 hostLabel 字段。
3. **移动端响应式**:
   - 顶部统计卡片 `grid-cols-2 → md:grid-cols-3 → xl:grid-cols-5`
   - 表格外层增加 `overflow-x-auto` 水平滚动
   - 自动填充提示文字

### 二、资产板块优化

**文件**: `vite-frontend/src/pages/assets.tsx`

1. **跨层导航**:
   - X-UI 实例卡片可点击跳转到 `/xui` 页面
   - 转发链接表格/卡片可点击跳转到 `/forward` 页面
   - 增加「管理 X-UI」「管理转发」快捷按钮
   - 空状态引导：「去 X-UI 添加一个」
2. **移动端适配**:
   - 统计卡片响应式网格
   - 资产列表统计区间距/圆角/字号优化
   - 转发链接区分 mobile 卡片布局和 desktop 表格布局

### 三、转发板块 - XUI 协议联动

**文件**: `vite-frontend/src/pages/forward.tsx`

1. **XUI 目标自动填充**: 选择 XUI 协议目标时，自动填充转发名称（来自 sourceLabel）和协议类型。
2. **可视化链路展示**: 选中 XUI 目标后，显示完整链路：`隧道 → 协议 → 资产 → 远程地址`，使用 Chip 标签直观呈现。
3. **转发卡片增强**: XUI 来源的转发卡片同时展示协议 Chip。

### 四、Monitor 探针模块（后端）

**新增文件**: 16 个 Java 文件

| 层级 | 文件 | 说明 |
|------|------|------|
| Entity | `MonitorInstance.java` | 探针实例（名称、类型、baseUrl、apiKey、同步配置） |
| Entity | `MonitorNodeSnapshot.java` | 被监控节点快照（UUID、在线状态、硬件信息、区域、IP） |
| Entity | `MonitorMetricLatest.java` | 最新指标（CPU、内存、磁盘、网络、连接数、进程数） |
| DTO | 6 个 DTO 文件 | 创建/更新/查看各实体的数据传输对象 |
| Mapper | 3 个 Mapper 接口 | MyBatis Plus 数据访问层 |
| Controller | `MonitorController.java` | CRUD + test/sync/unboundNodes 7 个端点 |
| Service | `MonitorService.java` | 服务接口定义 |
| Service | `MonitorServiceImpl.java` | 核心同步逻辑，目前支持 Komari 类型探针 |
| Scheduler | `MonitorSyncScheduler.java` | 每 60 秒自动同步符合条件的探针实例 |

**Komari 同步流程**:
```
MonitorInstance (baseUrl + apiKey)
  → GET /api/version        （测试连接）
  → GET /api/clients         （拉取节点列表 + 基础信息）
  → GET /api/recent/{uuid}   （拉取每个节点的最新指标）
  → Upsert MonitorNodeSnapshot + MonitorMetricLatest
  → 可绑定到 AssetHost（assetId 关联）
```

### 五、资产 DTO 扩展

**文件**: 4 个 AssetHost DTO + Entity

- 新增 `monitorInstanceId`、`monitorNodeUuid` 等字段
- 支持资产与探针节点的双向绑定
- 资产详情页可展示来自探针的实时监控数据

### 六、前端 API 层

**文件**: `vite-frontend/src/api/index.ts`

新增 Monitor 相关 API 调用：
- `getMonitorList` / `getMonitorDetail` / `createMonitorInstance`
- `updateMonitorInstance` / `deleteMonitorInstance`
- `testMonitorInstance` / `syncMonitorInstance`
- `getMonitorUnboundNodes`

### 七、基础设施

- Docker 本地镜像已构建：`springboot-backend:local` (530MB)、`vite-frontend:local` (106MB)
- 每周日凌晨 2 点自动执行 Docker deep-host 清理（crontab）
- TypeScript + Vite 构建验证通过

---

## 优先级计划与下一步

### P0 - 当前可立即推进

| 序号 | 任务 | 状态 | 说明 |
|------|------|------|------|
| 1 | Monitor 前端管理页 | 待开发 | 探针实例 CRUD、节点列表、指标可视化 |
| 2 | Komari 探针联动完善 | 待开发 | 前端 Monitor 页面 + 资产详情嵌入指标面板 |
| 3 | Pika 探针接入 | 待评估 | 与 Komari 类似，需确认 Pika API 结构 |

### P1 - 核心体验优化

| 序号 | 任务 | 状态 | 说明 |
|------|------|------|------|
| 4 | 转发 ↔ XUI 深度联动 | 部分完成 | 已有目标选择 + 可视化链路，可增加反向查询 |
| 5 | 资产仪表盘 | 待开发 | 汇聚探针指标 + XUI 节点 + 转发状态的全景视图 |
| 6 | 告警通知 | 待开发 | 节点离线/指标阈值告警，对接 Webhook/Telegram |

### P2 - 增强功能

| 序号 | 任务 | 状态 | 说明 |
|------|------|------|------|
| 7 | 历史指标存储 | 待开发 | 时序数据 + 趋势图表 |
| 8 | 批量操作 | 待开发 | 批量创建转发、批量绑定资产 |
| 9 | 移动端 PWA | 待评估 | 离线可用 + 推送通知 |

---

## Komari 探针与 Flux Panel 联动方案

### 当前已实现

Flux Panel 后端已实现 Komari 探针的数据拉取：
- 通过 `MonitorInstance` 配置 Komari 的 `baseUrl` + `apiKey`
- 定时同步（默认 60 秒）拉取所有节点和最新指标
- 数据存入 `monitor_node_snapshot` 和 `monitor_metric_latest` 表
- 支持将探针节点绑定到资产（`assetId` 关联）

### Komari 可用 API

| 端点 | 用途 | Flux 使用情况 |
|------|------|---------------|
| `GET /api/version` | 测试连接 | 已使用 |
| `GET /api/clients` | 获取节点列表 + 硬件信息 | 已使用 |
| `GET /api/recent/{uuid}` | 获取节点最新指标 | 已使用 |
| `POST /api/rpc2` (getRecords) | 查询历史指标（CPU/RAM/磁盘/网络） | 未使用（P2） |
| `GET /api/nodes` | 获取节点信息 | 未使用 |
| `POST /api/admin/task/exec` | 远程执行命令 | 未使用（潜力功能） |

### 缺失的前端部分（下一步）

1. **Monitor 管理页面** (`/monitor`): 探针实例增删改查 + 连接测试 + 手动同步
2. **节点列表视图**: 展示所有探针节点的在线状态、CPU/内存/磁盘/网络实时数据
3. **资产详情嵌入**: 资产详情页直接展示绑定探针节点的监控面板
4. **节点绑定资产**: 将未绑定的探针节点关联到已有资产

### 联动架构图

```
┌─────────────────────────────────────────────────┐
│                 Flux Panel Yoga                  │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ 资产管理  │←→│ XUI 管理  │←→│   转发管理    │  │
│  │ /assets  │  │  /xui    │  │  /forward    │  │
│  └────┬─────┘  └──────────┘  └──────────────┘  │
│       │                                          │
│       ▼                                          │
│  ┌──────────┐       同步拉取                     │
│  │ Monitor  │──────────────────┐                 │
│  │ /monitor │                  │                 │
│  └──────────┘                  ▼                 │
│                         ┌─────────────┐          │
│                         │ Komari 探针  │          │
│                         │ :25774      │          │
│                         └──────┬──────┘          │
│                                │                 │
│                    ┌───────────┼───────────┐     │
│                    ▼           ▼           ▼     │
│               ┌────────┐ ┌────────┐ ┌────────┐  │
│               │ VPS-A  │ │ VPS-B  │ │ VPS-C  │  │
│               │ Agent  │ │ Agent  │ │ Agent  │  │
│               └────────┘ └────────┘ └────────┘  │
└─────────────────────────────────────────────────┘
```
