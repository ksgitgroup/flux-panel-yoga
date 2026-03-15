# 分布式爬虫集成方案（Scrapling + Firecrawl）

> 状态：**规划中** | 创建日期：2026-03-11 | 更新：2026-03-11

# Part A — Scrapling Lite 边缘节点

## 1. 概述

将 [Scrapling](https://github.com/D4Vinci/Scrapling) 作为分布式爬虫引擎集成到 Flux Panel，利用已管理的多台 VPS 作为爬虫节点，实现多 IP 出口的分布式数据采集。

**核心原则**：Scrapling 源码零修改，所有集成逻辑在 Flux 侧实现。

## 2. 架构

```
┌──────────────────────────────────────────────────┐
│                  Flux Panel (中央调度)              │
│  ┌──────────┐  ┌───────────┐  ┌───────────────┐  │
│  │ 前端管理  │  │ 任务调度器 │  │scraping_worker│  │
│  │ 部署/监控 │  │ 地域/冷却  │  │scraping_task  │  │
│  └──────────┘  │ /负载均衡  │  │   (MySQL)     │  │
│                └─────┬─────┘  └───────────────┘  │
└──────────────────────┼───────────────────────────┘
                       │ MCP over HTTP (:8100)
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌────────────┐┌────────────┐┌────────────┐
   │ VPS-A (US) ││ VPS-B (JP) ││ VPS-C (HK) │
   │ Lite 50MB  ││ Lite 50MB  ││ Full 500MB │
   │ HTTP only  ││ HTTP only  ││ +Chromium   │
   └────────────┘└────────────┘└────────────┘
```

## 3. 为什么可以轻量 — 双引擎原理

Scrapling 内部有两套完全独立的引擎：

| 引擎 | 组件 | 工作原理 | 内存占用 |
|------|------|---------|---------|
| **HTTP 引擎** | `Fetcher` / `AsyncFetcher` / `FetcherSession` | Python 进程内通过 curl_cffi (C库) 直接发 TCP/TLS 请求，能伪装 TLS 指纹模拟 Chrome/Firefox 握手特征 | **50-80MB** |
| **浏览器引擎** | `DynamicFetcher` / `StealthyFetcher` | 启动真实 Chromium 浏览器进程，通过 Playwright 控制，执行 JS、渲染 DOM | **300-800MB** |

**300-800MB 的消耗全部来自 Chromium 浏览器进程**。轻量模式只用 HTTP 引擎，不安装也不启动 Chromium。

### 场景判断：是否需要浏览器？

| 场景 | 需要浏览器？ | 原因 |
|------|------------|------|
| 供应商面板（登录后抓数据） | **否** | 模拟 POST 登录 → 拿 Cookie → 后续请求带 Cookie |
| JSON API 接口 | **否** | 纯 HTTP 请求 |
| 静态 HTML 页面 | **否** | 直接解析 HTML |
| IP 黑名单检查站 | **否** | 大多是静态页面或简单表单 |
| Cloudflare JS Challenge | **是** | 必须执行 JS 才能通过验证 |
| 前端 SPA (React/Vue) | **是** | 数据在 JS 执行后才出现在 DOM |

**结论**：Flux 的主要场景（VPS 供应商面板、状态页、IP 查询）90%+ 不需要浏览器。

## 4. Docker 镜像

### 4.1 精简版（Lite）— 大多数节点使用

```dockerfile
# flux-scrapling-lite
FROM python:3.12-slim-trixie

RUN pip install --no-cache-dir \
    scrapling \
    "curl_cffi>=0.14.0" \
    "click>=8.3.0" \
    "browserforge>=1.2.4" \
    "mcp>=1.26.0" \
    "markdownify>=1.2.0" \
    "msgspec>=0.20.0" \
    "anyio>=4.12.1"

EXPOSE 8100
CMD ["python", "-m", "scrapling", "mcp", "--http", "--port", "8100"]
```

- 镜像大小：~250MB
- 内存占用：~50-80MB
- 可用工具：`get` / `bulk_get`（HTTP 抓取）

### 4.2 完整版（Full）— 少数节点按需部署

直接使用官方镜像：
```bash
docker pull ghcr.io/d4vinci/scrapling:latest
docker run -d -p 8100:8100 ghcr.io/d4vinci/scrapling:latest mcp --http --port 8100
```

- 镜像大小：~1.8GB
- 内存占用：~300-800MB（浏览器运行时）
- 可用工具：全部（`get`, `fetch`, `stealthy_fetch`, `bulk_*`）

### 4.3 资源对比

| | 精简版 (Lite) | 完整版 (Full) |
|---|---|---|
| 镜像大小 | ~250MB | ~1.8GB |
| 运行内存 | 50-80MB | 300-800MB |
| 最低配置 | 256MB RAM / 1核 | 1GB RAM / 1核 |
| Chromium | 不安装 | 包含 |
| 适用节点 | 512MB-1GB 小鸡 | 2GB+ 中配 |

## 5. 数据库表结构

### 5.1 scraping_worker（爬虫节点）

```sql
CREATE TABLE scraping_worker (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    asset_host_id BIGINT       COMMENT '关联 asset_host.id',
    name         VARCHAR(100)  COMMENT '节点名称',
    endpoint     VARCHAR(255)  NOT NULL COMMENT 'MCP HTTP 地址, e.g. http://1.2.3.4:8100',
    capability   VARCHAR(20)   DEFAULT 'http' COMMENT 'http=仅HTTP引擎, full=含浏览器',
    region       VARCHAR(20)   COMMENT '地域标签 US/JP/HK/DE...',
    status       INT           DEFAULT 0 COMMENT '0=离线, 1=在线, -1=已删除',
    last_health_check DATETIME COMMENT '最近健康检查时间',
    cooldown_domains  TEXT     COMMENT 'JSON: {"domain": "冷却到期时间戳"}',
    created_at   DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 5.2 scraping_task（爬虫任务）

```sql
CREATE TABLE scraping_task (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    worker_id       BIGINT       COMMENT '分配的 worker',
    status          VARCHAR(20)  DEFAULT 'pending' COMMENT 'pending/running/done/failed',
    target_url      VARCHAR(2048) NOT NULL,
    method          VARCHAR(10)  DEFAULT 'GET',
    headers_json    TEXT         COMMENT '请求头 JSON',
    body_json       TEXT         COMMENT '请求体 JSON',
    extraction_type VARCHAR(20)  DEFAULT 'markdown' COMMENT 'markdown/html/text',
    css_selector    VARCHAR(500) COMMENT '可选 CSS 选择器，提取特定区域',
    require_browser TINYINT      DEFAULT 0 COMMENT '0=HTTP够用, 1=需要浏览器',
    prefer_region   VARCHAR(20)  COMMENT '偏好地域',
    result_text     LONGTEXT     COMMENT '抓取结果',
    result_status   INT          COMMENT 'HTTP 状态码',
    error_message   VARCHAR(1000),
    retry_count     INT          DEFAULT 0,
    max_retries     INT          DEFAULT 3,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    finished_at     DATETIME
);
```

## 6. Flux 后端实现

### 6.1 Entity + Mapper

- `ScrapingWorker.java` — MyBatis Plus entity
- `ScrapingTask.java` — MyBatis Plus entity
- `ScrapingWorkerMapper.java`
- `ScrapingTaskMapper.java`

### 6.2 ScrapingService 核心方法

```java
public interface ScrapingService {
    // 节点管理
    R listWorkers();
    R deployWorker(Long assetHostId, String capability);  // 通过 Komari 远程部署
    R removeWorker(Long workerId);                        // 远程停止 + 删除记录
    R healthCheck(Long workerId);                         // 单节点健康检查
    void healthCheckAll();                                // 定时全量检查

    // 任务调度
    R submitTask(ScrapingTask task);     // 提交任务 → 自动选节点 → 执行
    R getTaskResult(Long taskId);        // 查询结果
    R listTasks(int page, int size);     // 任务列表

    // 快捷方法
    R scrapeUrl(String url, String cssSelector, String preferRegion);
    R batchScrape(List<String> urls, String cssSelector);
}
```

### 6.3 调度策略

```
提交任务 → ScrapingScheduler.selectWorker(task):
  1. 过滤 status=1 (在线) 的 worker
  2. require_browser=true → 只选 capability='full'
  3. 检查 cooldown_domains → 排除对目标域名冷却中的节点
  4. prefer_region 匹配 → 优先同地域节点
  5. 多个候选 → 选正在执行任务最少的 (负载均衡)
  6. 选中 → 标记 worker 对该域名冷却 N 分钟
```

### 6.4 MCP HTTP 调用格式

Scrapling MCP Server 使用标准 MCP over HTTP 协议：

```
POST http://worker:8100/mcp
Content-Type: application/json

{
  "method": "tools/call",
  "params": {
    "name": "get",
    "arguments": {
      "url": "https://example.com",
      "extraction_type": "markdown",
      "css_selector": ".content",
      "impersonate": "chrome",
      "stealthy_headers": true
    }
  }
}
```

### 6.5 Controller API

```
POST /api/scraping/workers          — 列出所有爬虫节点
POST /api/scraping/deploy-worker    — 部署爬虫节点到指定 VPS
POST /api/scraping/remove-worker    — 移除爬虫节点
POST /api/scraping/submit           — 提交爬虫任务
POST /api/scraping/task-result      — 查询任务结果
POST /api/scraping/tasks            — 任务列表
POST /api/scraping/quick-scrape     — 快捷抓取（URL → 结果）
```

## 7. 一键部署流程

```
用户在 Flux 前端 → "部署爬虫节点" → 选择目标 VPS + 模式(lite/full)

Flux 后端:
  1. 通过 Komari executeCommand 远程执行:
     # Lite 模式
     docker pull flux-scrapling-lite:latest && \
     docker run -d --name scrapling-worker \
       --restart unless-stopped \
       -p 8100:8100 \
       flux-scrapling-lite:latest

     # Full 模式
     docker pull ghcr.io/d4vinci/scrapling:latest && \
     docker run -d --name scrapling-worker \
       --restart unless-stopped \
       -p 8100:8100 \
       ghcr.io/d4vinci/scrapling:latest mcp --http --port 8100

  2. 等待 10s → 健康检查 GET http://vps-ip:8100/
  3. 通过 → 写入 scraping_worker 表, status=1
  4. 失败 → 返回错误信息
```

## 8. 分布式风控优势

| 策略 | 说明 |
|------|------|
| **IP 分散** | 每个 VPS 独立出口 IP，同一目标从不同 IP 访问 |
| **地域就近** | 爬美国站用 US 节点，降低延迟且更像真实用户 |
| **冷却轮换** | 同一节点对同一域名冷却 N 分钟后才能再次使用 |
| **故障隔离** | 某 IP 被封只影响单节点，自动切到其他节点 |
| **TLS 伪装** | curl_cffi 伪装 Chrome/Firefox TLS 指纹 |
| **Header 伪装** | browserforge 生成真实浏览器 UA 和 header 组合 |

## 9. 前端页面规划

### 9.1 爬虫节点管理（/scraping 或集成到 /probe）

- 节点列表：名称、VPS、地域、模式(lite/full)、状态、最近检查
- 操作：部署、移除、健康检查、查看日志
- 统计：总节点数、在线数、今日任务数

### 9.2 任务管理

- 快捷抓取：输入 URL → 选提取方式 → 查看结果
- 任务列表：状态、目标、节点、耗时、结果预览
- 批量任务：多 URL 批量提交

## 10. 使用场景

| 场景 | 抓取方式 | 频率 | 价值 |
|------|---------|------|------|
| VPS 供应商面板 → 到期时间/流量/配置 | HTTP (模拟登录) | 每日 | 自动更新资产信息 |
| IP 黑名单检查 | HTTP | 按需 | 安全预警 |
| 供应商 Status Page | HTTP | 每小时 | 故障感知 |
| Cloudflare 保护站点 | 浏览器 (Full 节点) | 按需 | 特殊场景 |
| 价格监控（新机促销） | HTTP | 每日 | 采购决策 |

## 11. 实施路线

| 步骤 | 内容 | 依赖 | 预计工作量 |
|------|------|------|-----------|
| Step 1 | 构建精简 Docker 镜像，验证 MCP HTTP 可用 | 无 | 小 |
| Step 2 | Flux 后端：表结构 + Entity + auto-DDL | Step 1 | 小 |
| Step 3 | Flux 后端：ScrapingService 调度引擎 | Step 2 | 中 |
| Step 4 | Flux 后端：Controller API | Step 3 | 小 |
| Step 5 | Flux 前端：节点管理 + 任务提交界面 | Step 4 | 中 |
| Step 6 | 集成 Komari 一键部署 + 健康检查 | Step 5 | 小 |
| Step 7 | 定时任务：自动资产信息采集 | Step 6 | 中 |

## 12. 注意事项

- **零修改策略**：不改 Scrapling 源码，精简版只是自定义 Dockerfile 选择性安装依赖
- **安全**：MCP HTTP 端口 8100 仅内网/VPN 可达，不对公网开放
- **镜像分发**：精简版镜像推送到私有 Docker Registry 或 Docker Hub
- **按需启停**（可选优化）：不常驻运行，有任务时 `docker run --rm` 一次性容器

---

# Part B — Firecrawl 中心化引擎

## 13. Firecrawl 概述

[Firecrawl](https://github.com/mendableai/firecrawl) 是完整的 Web 数据 API 平台，将网站转换为 LLM-ready 数据。

**与 Scrapling 的本质区别**：Scrapling 是爬虫库（需要自建基础设施），Firecrawl 是爬虫平台（自带队列/Worker/持久化/AI提取）。

### 13.1 技术栈

| 组件 | 技术 | 作用 |
|------|------|------|
| API Server | TypeScript/Node.js 22 | HTTP 入口 |
| Worker | TypeScript + RabbitMQ | 分布式任务执行 |
| 数据库 | PostgreSQL 17 (pg_cron) | 任务持久化 |
| 缓存 | Redis | 限流/锁/会话 |
| 消息队列 | RabbitMQ | 任务分发 |
| 浏览器 | Playwright (独立服务) | JS 渲染 |
| 原生扩展 | Go (HTML→MD) + Rust (引擎) | 性能优化 |

### 13.2 核心能力

| 能力 | 说明 |
|------|------|
| **Scrape** | 单 URL → Markdown/HTML/Screenshot/JSON |
| **Crawl** | 全站爬取，自动发现链接 |
| **Map** | 一键发现网站所有 URL |
| **Search** | 搜索网页并获取完整内容 |
| **Agent** | AI 自动数据采集（描述需求即可） |
| **Batch** | 批量异步抓取数千 URL |
| **Extract** | AI 结构化提取（Schema → JSON） |
| **Actions** | 交互操作：click/scroll/input/wait/screenshot |
| **Media** | PDF/DOCX/图片自动解析 |
| **Branding** | 提取品牌色/字体/Logo |

### 13.3 API 端点

```
POST /v2/scrape              单页抓取
POST /v2/crawl               全站爬取（异步）
GET  /v2/crawl/:jobId        爬取状态
POST /v2/map                 URL 发现
POST /v2/search              搜索
POST /v2/batch/scrape        批量抓取
POST /v2/agent               AI 代理采集
POST /v2/browser/create      创建浏览器会话
```

### 13.4 资源需求

| 组件 | CPU | 内存 | 磁盘 |
|------|-----|------|------|
| API + Worker | 4核 | 8GB | — |
| Playwright | 2核 | 4GB | — |
| PostgreSQL | 1核 | 1GB | 5-10GB |
| Redis | 0.5核 | 512MB | — |
| RabbitMQ | 0.5核 | 512MB | — |
| **合计最低** | **4核** | **8GB** | **50GB** |
| **推荐生产** | **8核** | **16GB** | **100GB** |

### 13.5 部署方式

```bash
# 自托管 docker-compose（6+ 容器）
cd firecrawl && docker compose up -d

# 服务端口
# API:        3002
# Playwright: 3000
# RabbitMQ:   15672 (管理UI)
# PostgreSQL: 5432
# Redis:      6379
```

### 13.6 Flux 集成方式

Firecrawl 提供 **Java SDK**，Flux 可直接 Maven 引入：

```java
// Flux 调用 Firecrawl 只需几行
FirecrawlApp fc = new FirecrawlApp("http://firecrawl-server:3002", apiKey);

// 单页抓取
ScrapeResponse resp = fc.scrapeUrl("https://example.com",
    ScrapeParams.builder().formats(List.of("markdown")).build());
String markdown = resp.getMarkdown();

// AI 结构化提取
ExtractResponse extract = fc.extract("https://vendor.com/my-vps",
    ExtractParams.builder()
        .schema(VpsInfoSchema.class)  // 自动提取为 Java 对象
        .build());
```

### 13.7 注意事项

- **许可证**：AGPL-3.0，自用无限制，但分发修改版需开源
- **零修改策略**：不改 Firecrawl 源码，原样部署
- **Fire-Engine**：云端专属高级反爬引擎，自托管不可用
- **自托管限制**：无代理轮换（需配合外部代理池）

---

# Part C — 双引擎分工方案

## 14. 架构总览

```
┌───────────────────────────────────────────────────────┐
│                     Flux Panel                          │
│  ┌─────────────────────────────────────────────────┐  │
│  │            ScrapingRouter (智能路由)               │  │
│  │  简单HTTP/探测/多IP → Scrapling Lite              │  │
│  │  AI提取/全站/PDF/JS → Firecrawl                   │  │
│  │  强反爬/Cloudflare  → Scrapling Full              │  │
│  └──────────┬─────────────────┬────────────────────┘  │
└─────────────┼─────────────────┼───────────────────────┘
              │                 │
    ┌─────────▼──────┐  ┌──────▼──────────────────┐
    │ Scrapling Lite  │  │    Firecrawl 集群         │
    │ (20+ VPS边缘)   │  │  (1台大机器中心化)         │
    │                 │  │                          │
    │ VPS-A 50MB (US) │  │  API + Worker            │
    │ VPS-B 50MB (JP) │  │  PostgreSQL + Redis      │
    │ VPS-C 50MB (HK) │  │  RabbitMQ + Playwright   │
    │ VPS-D 50MB (DE) │  │                          │
    │ ...             │  │  代理出口:                 │
    │                 │  │  → socks5://VPS-A:1080   │
    │ 每节点独立IP出口  │  │  → socks5://VPS-B:1080   │
    └─────────────────┘  │  → socks5://VPS-C:1080   │
                         └──────────────────────────┘
```

## 15. 能力矩阵与路由规则

| 能力 | Scrapling Lite | Scrapling Full | Firecrawl |
|------|---------------|----------------|-----------|
| 简单 HTTP 抓取 | **最优** (50MB) | 可以 | 大材小用 |
| TLS 指纹伪装 | **独有** | **独有** | 无 |
| 多 IP 天然分散 | **架构优势** | **架构优势** | 需代理池 |
| 边缘就近抓取 | **最优** | **最优** | 中心化延迟高 |
| 高频探测 (>100次/h) | **最优** | 可以 | 资源浪费 |
| JS 渲染/SPA | 不支持 | 支持 | **最优** |
| AI 结构化提取 | 不支持 | 不支持 | **独有** |
| 全站爬取 + URL发现 | 需手写 | 需手写 | **一键API** |
| PDF/DOCX 解析 | 不支持 | 不支持 | **独有** |
| 截图/品牌提取 | 不支持 | 不支持 | **独有** |
| 批量任务队列 | 需Flux自建 | 需Flux自建 | **内置** |
| 绕 Cloudflare | 不支持 | **最强** | 自托管较弱 |

### 路由决策树

```
新任务进入 ScrapingRouter
    │
    ├─ 需要 AI 提取 / Schema?        → Firecrawl
    ├─ 需要全站爬取 / Map?            → Firecrawl
    ├─ 目标是 PDF / DOCX?            → Firecrawl
    ├─ 需要 JS 渲染?                 → Firecrawl
    ├─ 需要截图?                     → Firecrawl
    ├─ 需要绕 Cloudflare / 强反爬?    → Scrapling Full
    ├─ 指定地域就近?                  → Scrapling Lite (匹配地域)
    └─ 其他 (简单HTTP)               → Scrapling Lite (负载最低)
```

## 16. 场景分工表

| 场景 | 引擎 | 原因 |
|------|------|------|
| 检查 VPS IP 黑名单 | **Scrapling Lite** | 简单HTTP，多IP轮换，就近节点 |
| 供应商面板登录抓到期时间 | **Scrapling Lite** | HTTP+Cookie+TLS伪装 |
| 供应商状态页心跳 | **Scrapling Lite** | 高频轻量，边缘最合适 |
| 新机促销价格监控 | **Scrapling Lite** | 静态页面，多IP防封 |
| 从 PDF 账单提取费用 | **Firecrawl** | PDF 解析独有能力 |
| 爬取供应商全站促销 | **Firecrawl** | Crawl+Map 一键全站 |
| JS渲染的云控制面板 | **Firecrawl** | Playwright 原生 |
| AI 提取 VPS 配置为结构化数据 | **Firecrawl** | Schema→JSON 独有 |
| 从供应商页面提取品牌/Logo | **Firecrawl** | Branding 提取独有 |
| Cloudflare 保护的目标 | **Scrapling Full** | StealthyFetcher 反检测最强 |

## 17. 资源规划

### 17.1 Scrapling Lite 节点（边缘层）

- **部署范围**：全部或大部分 VPS（按需选择）
- **每节点成本**：+50MB RAM，几乎无感
- **总成本**：20台 × 50MB = 1GB（分散在各机器上）
- **部署方式**：Komari 远程一键部署

### 17.2 Firecrawl 集群（中心层）

- **部署位置**：1台 4核8GB+ 机器（或 Flux 同机器如果资源够）
- **总成本**：8-16GB RAM 集中
- **部署方式**：docker-compose 一键启动

### 17.3 Scrapling Full 节点（可选，按需）

- **部署范围**：2-3台 2GB+ RAM 的 VPS
- **每节点成本**：+500MB RAM
- **场景**：仅在需要绕 Cloudflare 等强反爬时使用
- **可延后**：初期不部署，遇到需求再加

### 17.4 总资源估算

| 组件 | 新增资源 | 备注 |
|------|---------|------|
| Scrapling Lite × 20 | 每台 +50MB | 无感 |
| Firecrawl × 1 | 1台 4核8GB | 需要空闲大机器 |
| Scrapling Full × 0 | 初期不部署 | 按需再加 |

## 18. 统一实施路线

| 阶段 | 步骤 | 内容 | 工作量 |
|------|------|------|--------|
| **Phase 1** | 1 | Scrapling Lite Docker 镜像构建 + 验证 | 小 |
| | 2 | Firecrawl docker-compose 部署到大机器 | 小 |
| | 3 | Flux 后端：统一表结构 (scraping_worker + scraping_task) | 小 |
| **Phase 2** | 4 | Flux 后端：ScrapingRouter 路由引擎 | 中 |
| | 5 | Flux 后端：Scrapling MCP 调用 + Firecrawl Java SDK 调用 | 中 |
| | 6 | Flux 后端：Controller API | 小 |
| **Phase 3** | 7 | Flux 前端：爬虫管理页面 | 中 |
| | 8 | Komari 一键部署 Scrapling Lite 到 VPS | 小 |
| | 9 | 定时任务：自动资产信息采集 | 中 |
| **Phase 4** | 10 | (可选) Scrapling Full 节点部署 | 小 |
| | 11 | (可选) Firecrawl 代理池对接 VPS SOCKS5 | 小 |

## 19. Flux 统一 API 设计

无论底层用 Scrapling 还是 Firecrawl，Flux 对前端暴露统一接口：

```
POST /api/scraping/submit         提交任务（自动路由引擎）
POST /api/scraping/quick-scrape   快捷抓取（URL → 结果）
POST /api/scraping/extract        AI 结构化提取（→ Firecrawl）
POST /api/scraping/crawl          全站爬取（→ Firecrawl）
POST /api/scraping/tasks          任务列表
POST /api/scraping/task-result    查询结果
POST /api/scraping/workers        节点列表（Scrapling + Firecrawl）
POST /api/scraping/deploy-worker  部署 Scrapling 节点
```

前端无需关心底层引擎差异，ScrapingRouter 自动处理。
