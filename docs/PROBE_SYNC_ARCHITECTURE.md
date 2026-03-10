# Flux ↔ Komari / Pika 探针同步架构

> 最后更新：2026-03-10
> 适用版本：Flux Panel Yoga v1.4.7+

---

## 1. 系统角色

| 系统 | 角色 | 端口 | 数据库 |
|------|------|------|--------|
| **Flux Panel** | 中枢管理面板 | 6366 | MySQL |
| **Komari** | 轻量 Go 监控探针 | 25774 | SQLite |
| **Pika** | Go 监控探针 | 可配置 | SQLite |

**核心关系**：Flux 作为中枢，通过 REST API 拉取/推送探针数据。双探针通过 **IPv4 地址**关联同一台物理服务器。

---

## 2. 数据实体映射

```
MonitorInstance (探针实例)    ← Komari/Pika 服务端连接配置
  └─ MonitorNodeSnapshot (探针节点) ← 探针中每台被监控服务器的快照
       └─ MonitorMetricLatest (实时指标)  ← CPU/内存/磁盘/网络等
       └─ AssetHost (资产)              ← Flux 自有的服务器管理记录
```

**一个探针实例**包含**多个探针节点**，每个节点可关联到**一个资产**。
一个资产可同时关联 Komari 节点 + Pika 节点（双探针模式）。

### 资产关联字段

| AssetHost 字段 | 含义 |
|----------------|------|
| `monitorNodeUuid` | 关联的 Komari 节点 UUID |
| `pikaNodeId` | 关联的 Pika Agent ID |
| `primaryIp` | IPv4 地址（双探针关联键） |
| `userEditedFields` | JSON 数组，记录用户手动编辑过的字段名 |

### 节点状态码

| `status` 值 | 含义 | Sync 行为 |
|-------------|------|-----------|
| `0` | 正常 | 正常同步 |
| `1` | 探针端已移除（离线） | 保留快照供查看，不重建 |
| `-1` | 用户软删除 | 完全跳过，不重建 |

### 其他标记

| 字段 | 含义 |
|------|------|
| `assetUnlinked = 1` | 用户解绑过，sync 不再自动创建/关联资产 |
| `firstSeenAt` | 首次上线时间，用于孤儿复用判断 |

---

## 3. CRUD 同步规则

### 3.1 增（Create）

| 方向 | 支持 | 机制 | 关键代码 |
|------|------|------|----------|
| Flux → Komari | ✅ | `provisionAgent()` → `POST /api/admin/client/add` | MonitorServiceImpl |
| Flux → Pika | ✅ | 生成安装脚本（Pika agent 自注册模式） | MonitorServiceImpl |
| Komari → Flux | ✅ | `syncKomari()` 拉取新节点 → `autoCreateOrLinkAssetFromNode()` | MonitorServiceImpl |
| Pika → Flux | ✅ | `syncPika()` 拉取新 agent → 同上 | MonitorServiceImpl |

**Provision 流程细节：**

1. 创建 Komari 客户端（或复用 30 分钟内未连接的孤儿节点）
2. 自动改名：`POST /api/admin/client/{uuid}/edit` 设置 Flux 端服务器名
3. Pika：若无可用 API Key，自动创建（`POST /api/admin/api-keys`）
4. 返回安装命令给用户执行
5. 用户点击"手动同步"→ 验证节点是否真正上线

### 3.2 查（Read）

| 方向 | 支持 | 机制 |
|------|------|------|
| Flux → Komari | ✅ | `GET /api/admin/client/list` + RPC `common:getNodesLatestStatus` |
| Flux → Pika | ✅ | `GET /api/admin/agents` + `GET /api/admin/agents/{id}/metrics/latest` |
| 单节点状态 | ✅ | `getNodeStatusByUuid()` → 直接查询探针端 |

**自动同步**：`autoSyncEligibleInstances()` 定时器，按 `syncIntervalMinutes`（默认 5 分钟）自动拉取。

### 3.3 改（Update）

| 方向 | 支持 | 同步字段 |
|------|------|----------|
| Komari → Flux | ✅ 全量 | name, ip, ipv6, os, cpu, mem, disk, region, version, tags, billing... |
| Pika → Flux | ✅ 全量 | name, ip, ipv6, os, arch, version, metrics, traffic... |
| Flux → Komari | ✅ 名称 | 用户编辑资产 label → `POST /api/admin/client/{uuid}/edit` 推送 |
| Flux → Pika | ✅ 名称 | 用户编辑资产 label → `PUT /api/admin/agents/{id}` 推送 |

**用户编辑保护机制**：

- `userEditedFields` JSON 数组追踪用户手动编辑的字段
- `refreshAssetFromProbe()` 同步时跳过这些字段，避免探针数据覆盖用户修改
- 受保护字段：`label, tags, os, osCategory, cpuCores, memTotalMb, diskTotalGb, monthlyCost, currency, billingCycle, expireDate`

### 3.4 删（Delete）

#### Flux 删探针节点 → 远程级联删除

```
deleteNodeSnapshot(nodeId):
  1. 解除资产关联（清 monitorNodeUuid / pikaNodeId）
  2. 远程删除（best-effort，失败不阻塞）：
     - Komari: POST /api/admin/client/{uuid}/remove
     - Pika:   DELETE /api/admin/agents/{id}（JWT 认证）
  3. 清除实时指标
  4. 本地软删除：status = -1
  5. 返回结果（含远程删除状态提示）
```

#### Flux 删探针实例 → 清理所有资产关联

```
deleteInstance(id):
  1. 遍历该实例下所有有资产关联的节点
  2. 清除每个关联资产的 monitorNodeUuid / pikaNodeId
  3. 删除所有指标 + 快照 + 实例本身
  注意：不删远程探针端节点（断开管理 ≠ 销毁探针）
```

#### Flux 删资产 → 节点标记解绑

```
deleteAsset(id):
  1. 检查关联（XUI/Forward/OnePanel 引用则拒绝删除）
  2. 关联节点标记 assetUnlinked = 1（sync 不再自动关联）
  3. 删除资产记录
  注意：不删探针端节点，探针继续监控
```

#### 探针端删节点 → Sync 自动清理

```
syncKomari / syncPika → Mark removed nodes:
  1. 对比本次 sync 返回的节点列表 vs 本地快照
  2. 不在列表中的节点：
     - 标记 status = 1（"探针端已移除"）
     - 标记 online = 0
     - 清除资产关联（unlinkNodeFromAsset）
  3. 节点快照保留，显示"探针已不存在"状态
```

---

## 4. 双探针关联机制

### IPv4 地址自动关联

```
autoCreateOrLinkAssetFromNode(node):
  1. 跳过条件：assetUnlinked == 1 或 assetId 已存在
  2. 检查重复：是否已有资产关联了同一 remoteNodeUuid
  3. IPv4 匹配：查找 primaryIp 相同的现有资产
     - 找到 → 关联到同一资产（设 monitorNodeUuid 或 pikaNodeId）
     - 未找到 → 自动创建新资产
  4. 新资产自动填充：name, IP, OS, hardware, billing, tags
```

### AssetHost 双探针字段

```java
monitorNodeUuid  // Komari 节点 UUID
pikaNodeId       // Pika Agent ID
primaryIp        // 共享的 IPv4 地址（关联键）
```

---

## 5. 数据流向图

```
                    ┌──────────────────────┐
                    │     Flux Panel       │
                    │  (中枢管理面板)        │
                    └──────┬───────┬───────┘
                           │       │
              ┌────────────┘       └────────────┐
              ▼                                  ▼
     ┌────────────────┐                ┌────────────────┐
     │    Komari      │                │     Pika       │
     │  (监控探针)     │                │   (监控探针)    │
     └────────────────┘                └────────────────┘

  Flux → Komari:                     Flux → Pika:
    • provision (创建/复用客户端)        • provision (生成安装脚本)
    • 改名 (POST /edit)                • 改名 (PUT /agents/{id})
    • 删除 (POST /remove)              • 删除 (DELETE /agents/{id})
    • 远程命令执行 (POST /task/exec)    • 触发审计 (POST /agents/{id}/command)
    • Web Terminal (WebSocket)         • SSH 登录监控 (GET /ssh-login/events)

  Komari → Flux:                     Pika → Flux:
    • sync 拉取节点列表                  • sync 拉取 agent 列表
    • RPC 拉取实时指标                   • 拉取 per-agent 指标
    • 自动创建/关联资产                  • 自动创建/关联资产

  双探针关联: IPv4 地址匹配 → 同一个 AssetHost
```

---

## 6. 关键 API 端点

### Komari Admin API

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/admin/client/list` | GET | 获取所有客户端 |
| `/api/admin/client/add` | POST | 创建客户端（返回 uuid + token） |
| `/api/admin/client/{uuid}` | GET | 获取单个客户端详情 |
| `/api/admin/client/{uuid}/edit` | POST | 编辑客户端（接受任意字段 map） |
| `/api/admin/client/{uuid}/remove` | POST | 删除客户端 |
| `/api/admin/client/{uuid}/token` | GET | 获取客户端 token |
| `/api/rpc2` | POST | JSON-RPC 批量查询指标（`common:getNodesLatestStatus`） |

### Pika Admin API

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/login` | POST | JWT 登录（username + password） |
| `/api/admin/agents` | GET | 获取所有 agent |
| `/api/admin/agents/{id}` | DELETE | 删除 agent |
| `/api/admin/agents/{id}/metrics/latest` | GET | 获取 agent 最新指标 |
| `/api/admin/api-keys` | POST | 创建 API Key |

### Flux Monitor API

| 端点 | 用途 |
|------|------|
| `POST /api/v1/monitor/sync` | 手动触发同步 |
| `POST /api/v1/monitor/provision` | 创建探针节点 |
| `POST /api/v1/monitor/delete-node` | 删除探针节点（含远程级联） |
| `POST /api/v1/monitor/node-status` | 查询节点实时状态 |
| `POST /api/v1/monitor/provision-dual` | 双探针 provision |
| `POST /api/v1/monitor/provision-all` | 全量 provision（含 GOST） |

---

## 7. 防护机制

### 熔断器（Circuit Breaker）

- 每个探针 host:port 独立熔断
- 连续 3 次失败 → 熔断打开（拒绝请求）
- 30 秒后半开状态允许一次试探

### 孤儿复用

- Provision 时检查 30 分钟内创建但从未连接的节点
- 复用已有 UUID + Token，避免重复创建

### 用户编辑保护

- `userEditedFields` JSON 追踪用户手动修改的字段
- Sync 时跳过这些字段，保留用户自定义值

### 软删除 + assetUnlinked

- 删除节点：`status = -1`，sync 完全跳过
- 解绑资产：`assetUnlinked = 1`，sync 不自动重新关联

---

## 8. 关键源文件

| 文件 | 职责 |
|------|------|
| `MonitorServiceImpl.java` | 同步、provision、删除、指标处理核心逻辑 |
| `AssetHostServiceImpl.java` | 资产 CRUD、用户编辑保护、名称推送触发 |
| `MonitorController.java` | REST API 入口 |
| `MonitorService.java` | 接口定义 |
| `MonitorNodeSnapshot.java` | 节点快照实体 |
| `MonitorInstance.java` | 探针实例实体 |
| `MonitorMetricLatest.java` | 实时指标实体 |
| `AssetHost.java` | 资产实体 |

---

## 9. 扩展功能集成

### 9.1 硬件指纹（Fingerprint）

- `MonitorNodeSnapshot.fingerprint`: SHA-256 前 16 位
- 输入字段：`cpuName|cpuCores|memTotal|diskTotal|arch|virtualization|kernelVersion`
- Sync 时自动计算并写入快照
- 用途：跨 IP 变更的服务器唯一性辅助识别

### 9.2 Provision 防重

- `provisionAllAgents()` 创建前检查目标资产是否已关联探针/GOST
- 已在线的节点 → 跳过并提示已存在
- 已离线的节点 → 允许重建（孤儿复用）

### 9.3 Komari 远程命令执行

```
executeKomariCommand(nodeId, command):
  1. POST /api/admin/task/exec → {command, clients: [uuid]}
  2. 返回 taskId
  3. getKomariTaskResult(nodeId, taskId) 轮询结果
     GET /api/admin/task/{taskId}/result → [{client, result, exit_code, finished_at}]
```

### 9.4 Komari Web Terminal

- `loadKomariNodeOperationsDetail()` 返回 `terminalUrl` 和 `commandSupported=true`
- 终端 URL 格式：`{baseUrl}/terminal/{nodeUuid}`
- 前端可直接打开 iframe 或新窗口

### 9.5 Pika SSH 登录监控

```
loadPikaNodeSecurityDetail() 自动拉取:
  - GET /api/admin/agents/{id}/ssh-login/config → enabled, whitelistIps
  - GET /api/admin/agents/{id}/ssh-login/events → user, ip, method, success, timestamp

getPikaSshLoginEvents(nodeId, pageSize) 独立端点:
  - 返回分页事件列表 + 失败计数
```

### 9.6 Pika VPS 审计触发

```
triggerPikaAudit(nodeId):
  1. loginPika() 获取 JWT
  2. POST /api/admin/agents/{id}/command → {command: "vps_audit"}
  3. 审计结果通过现有 audit/result 端点查询
```

### 9.7 Pika 名称推送

```
pushNameToProbes() 已支持双探针:
  - Komari: POST /api/admin/client/{uuid}/edit → {name: "..."}
  - Pika:   PUT  /api/admin/agents/{id}        → {name: "..."}
```

---

## 10. Flux Monitor API 端点（完整）

| 端点 | 用途 |
|------|------|
| `POST /api/v1/monitor/list` | 列出所有探针实例 |
| `POST /api/v1/monitor/detail` | 探针实例详情（含节点+供应商摘要） |
| `POST /api/v1/monitor/create` | 创建探针实例 |
| `POST /api/v1/monitor/update` | 更新探针实例 |
| `POST /api/v1/monitor/delete` | 删除探针实例 |
| `POST /api/v1/monitor/test` | 测试探针连接 |
| `POST /api/v1/monitor/sync` | 手动触发同步 |
| `POST /api/v1/monitor/provision` | 单探针 Provision |
| `POST /api/v1/monitor/provision-dual` | 双探针 Provision |
| `POST /api/v1/monitor/provision-all` | 全量 Provision（探针+GOST） |
| `POST /api/v1/monitor/delete-node` | 删除探针节点（含远程级联） |
| `POST /api/v1/monitor/node-status` | 查询节点实时状态 |
| `POST /api/v1/monitor/node-provider-detail` | 节点供应商详情下钻 |
| `POST /api/v1/monitor/komari-ping-task-detail` | Komari Ping 任务详情 |
| `POST /api/v1/monitor/terminal-access` | 获取终端访问 URL |
| `POST /api/v1/monitor/records` | 历史指标记录 |
| `POST /api/v1/monitor/dashboard` | 仪表盘节点列表 |
| `POST /api/v1/monitor/execute-command` | Komari 远程命令执行 |
| `POST /api/v1/monitor/task-result` | Komari 任务结果查询 |
| `POST /api/v1/monitor/trigger-audit` | Pika VPS 审计触发 |
| `POST /api/v1/monitor/ssh-login-events` | Pika SSH 登录事件 |

---

## 11. 已知限制与待办

| 项目 | 状态 | 说明 |
|------|------|------|
| Flux → Pika 名称推送 | ✅ 已实现 | `PUT /api/admin/agents/{id}` |
| Pika 远程删除 | ✅ 已实现 | 通过 JWT + DELETE 调用 |
| Komari 远程命令 | ✅ 已实现 | `POST /api/admin/task/exec` |
| Pika SSH 监控 | ✅ 已实现 | config + events 拉取 |
| Pika VPS 审计触发 | ✅ 已实现 | `POST /agents/{id}/command` |
| 硬件指纹 | ✅ 已实现 | SHA-256 前 16 位 |
| Provision 防重 | ✅ 已实现 | 检查资产关联后跳过 |
| 批量操作 | 未实现 | 批量删除/批量同步等 |
| Pika DDNS 管理 | 未集成 | Pika 有完整 DDNS API |
| Pika 流量管理 | 未集成 | Pika 有流量追踪+重置 API |
| 冲突解决 | 简单策略 | 探针数据覆盖 Flux（除 userEditedFields 保护字段） |
| 审计日志 | 部分 | 远程操作有 log.info/warn，无独立审计表 |
