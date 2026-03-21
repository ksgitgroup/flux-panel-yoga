# QA Report — Flux Panel Yoga (localhost:8080)

**Date:** 2026-03-20
**Tester:** Claude Code (automated)
**Branch:** claude/modest-ellis
**Build:** v1.4.7 · dev.455b5dfd
**Duration:** ~15 minutes
**Pages Visited:** 7 (Dashboard, Assets, Server Dashboard, Alert, Notification, System Config, Login)
**Mode:** Report-only (no fixes applied)

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 1 |
| Medium | 2 |
| Low | 1 |
| **Total** | **4** |

---

## Top 3 Things to Fix

1. **ISSUE-003** — 已登录用户访问 /login 显示空白页（应重定向到首页）
2. **ISSUE-001** — 服务器名称 "11" 疑似数据异常或展示问题
3. **ISSUE-002** — 添加服务器弹窗无背景遮罩

---

## Issues

### ISSUE-001: 服务器名称显示为 "11" — 疑似数据异常

**Severity:** Low
**Category:** Content / Data
**Page:** Dashboard, Server Dashboard, Assets

**Description:**
在 Dashboard 和 Server Dashboard 页面可见一台服务器名称仅为 "11"，状态为离线（红点）且显示"从未连接 0"。该名称不符合任何已知服务器命名规则，疑似测试数据残留或创建时输入了不完整名称。

**Repro Steps:**
1. 登录后访问 Dashboard（http://localhost:8080/dashboard）
2. 查看"异常资源"区域或 Server Dashboard 卡片视图
3. 可见名称为 "11" 的离线服务器

**Expected:** 服务器名称应有意义且可辨识
**Actual:** 名称为 "11"，无法判断是哪台服务器

---

### ISSUE-002: 添加服务器弹窗无背景遮罩（backdrop）

**Severity:** Medium
**Category:** UX / Interaction
**Page:** Assets（http://localhost:8080/assets）

**Description:**
点击"添加服务器"按钮后弹出的模态窗口缺少背景半透明遮罩。用户仍然可以看到背后页面内容没有任何暗化处理，导致弹窗层次感不明确，用户可能尝试点击背景区域期望关闭弹窗但无反应。

**Repro Steps:**
1. 访问 http://localhost:8080/assets
2. 点击页面顶部"添加服务器"按钮
3. 观察弹窗背景 — 无遮罩/暗化效果

**Expected:** 弹窗应有半透明背景遮罩（backdrop），点击遮罩区域可关闭弹窗
**Actual:** 弹窗直接叠加在页面上，背景无遮罩

---

### ISSUE-003: 已登录用户访问 /login 显示空白页

**Severity:** High
**Category:** Functional / Routing
**Page:** Login（http://localhost:8080/login）

**Description:**
已登录的用户手动导航到 /login 路径时，页面显示完全空白（白屏）。React root 节点内只有一个空 `<div>`，没有渲染任何内容。

正常行为应该是：已登录用户访问 /login 时自动重定向到 Dashboard 首页，或仍显示登录表单（允许切换账号）。当前的空白页是不可接受的用户体验。

**Repro Steps:**
1. 以 admin_user2 账号登录
2. 手动在地址栏输入 http://localhost:8080/login
3. 页面显示完全空白

**Expected:** 重定向到 /dashboard 或显示登录表单
**Actual:** 空白页面，无任何可见内容

---

### ISSUE-004: 告警规则旁红点指示器含义不明

**Severity:** Medium
**Category:** UX / Content
**Page:** Alert（http://localhost:8080/alert）

**Description:**
部分告警规则右侧出现红色小圆点指示器（在"日志"、"编辑"、"删除"按钮附近），但没有 tooltip 或文字说明解释该红点的含义。用户需猜测其代表"有未读告警触发"还是"规则需要注意"。

**Repro Steps:**
1. 访问 http://localhost:8080/alert
2. 滚动查看"全局基础监控"组下的规则
3. 注意"全局-CPU高负载"和"全局-内存高负载"规则右侧有红色小圆点

**Expected:** 红点应有 tooltip 说明（如"有 N 条未处理告警"）或在首次出现时有说明
**Actual:** 红点无任何解释

---

## Page-by-Page Results

### Dashboard (http://localhost:8080/dashboard)
- **Status:** ✅ 正常加载
- **Load Time:** ~300ms
- **Console Errors:** 无
- **Observations:**
  - 状态概览卡片正常（全部 55 / 在线 40 / 离线 15 / 快到期 1 / 已到期 1 / 告警中 14）
  - 异常资源、最近告警、快捷导航等区块正常
  - 区块标题已使用 `<h2>` 语义标签（设计审计修复已生效）
  - Dashboard 链接点击区域已增大（设计审计修复已生效）

### Assets (http://localhost:8080/assets)
- **Status:** ✅ 正常加载
- **Load Time:** ~250ms
- **Console Errors:** 无
- **Observations:**
  - 55 台服务器资产正常显示
  - 筛选面板完整（地区/标签/系统/告警状态/用途）
  - 筛选 chip 高度已统一（设计审计修复已生效）
  - 搜索功能正常
  - "添加服务器"弹窗功能可用但缺少 backdrop（ISSUE-002）

### Server Dashboard (http://localhost:8080/server-dashboard)
- **Status:** ✅ 正常加载
- **Load Time:** 271ms (DOM Content Loaded: 239ms)
- **Console Errors:** 无
- **Observations:**
  - 卡片视图和列表视图切换正常
  - 实时监控数据正常（CPU/MEM/DISK 进度条）
  - 55 台服务器全部可见
  - 排序功能可用（名称、CPU、内存等）
  - 筛选面板与 Assets 页一致

### Alert (http://localhost:8080/alert)
- **Status:** ✅ 正常加载
- **Console Errors:** 无
- **Observations:**
  - 4 个告警组可见（生产环境核心监控 6 条、全局基础监控 5 条、连通性监控 2 条、Windows 服务器专项 2+ 条）
  - 20 个告警开关全部可操作
  - 按钮视觉层级已分化（编辑 light / 批量配置 flat / 全部禁用 bordered danger）— 设计审计修复已生效
  - 规则右侧红点含义不明（ISSUE-004）

### Notification (http://localhost:8080/notification)
- **Status:** ✅ 正常加载
- **Console Errors:** 无
- **Observations:**
  - 通知消息 118 条，告警记录 113 条
  - Select 筛选器默认显示"全部"/"全部类型"/"全部级别"（修复已生效，不再显示空白）
  - "全部已读 (8)" 按钮可用
  - 告警记录标签切换正常
  - 搜索和级别筛选功能可用

### System Config (http://localhost:8080/config)
- **Status:** ✅ 正常加载
- **Console Errors:** 无
- **Observations:**
  - 左侧导航完整（基础配置、安全登录、钉钉登录、诊断配置、用户管理、限速管理、协议管理、标签管理、组织用户、角色权限）
  - 基础信息配置表单正常（应用名称、环境名称、面板后端地址）
  - 登录安全区块可见
  - "保存配置"按钮可见

### Login (http://localhost:8080/login)
- **Status:** ❌ 空白页
- **Console Errors:** 未检测到
- **Observations:**
  - 已登录用户访问后显示完全空白（ISSUE-003）
  - React root 渲染了一个空 `<div>`，无任何可见内容

---

## Design Audit Fix Verification

本次 QA 同时验证了之前设计审计（/design-review）的修复效果：

| Fix | Status |
|-----|--------|
| FINDING-003: Dashboard 链接点击面积增大 | ✅ 已生效 |
| FINDING-002: 区块标题使用 `<h2>` 语义标签 | ✅ 已生效 |
| FINDING-004: 通知中心 Select 默认值显示 | ✅ 已生效 |
| FINDING-005: 登录页版本号重复 | ⚠️ 无法验证（登录页空白） |
| FINDING-007: 筛选 chip 高度统一 | ✅ 已生效 |
| FINDING-008: 告警管理按钮层级 | ✅ 已生效 |

---

## Health Score

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Console | 100 | 15% | 15.0 |
| Links | 100 | 10% | 10.0 |
| Visual | 92 | 10% | 9.2 |
| Functional | 85 | 20% | 17.0 |
| UX | 84 | 15% | 12.6 |
| Performance | 95 | 10% | 9.5 |
| Content | 92 | 5% | 4.6 |
| Accessibility | 85 | 15% | 12.75 |
| **Total** | | | **90.65** |

**Health Score: 91/100**

---

## Console Health

- **Dashboard:** 0 errors
- **Assets:** 0 errors
- **Server Dashboard:** 0 errors
- **Alert:** 0 errors
- **Notification:** 0 errors
- **System Config:** 0 errors
- **Login:** 0 errors (but blank page)

**Console Health: Clean** — 无 JavaScript 错误检测到。

---

## Notes

- 测试使用 Chrome MCP 进行（已认证的浏览器会话），非 headless 浏览器
- 未检测到项目级测试框架。运行 `/qa` 可启动测试框架并生成回归测试
- 所有页面加载时间均在 300ms 以内，性能表现良好
- 设计审计的 5 项修复中有 4 项已验证生效
