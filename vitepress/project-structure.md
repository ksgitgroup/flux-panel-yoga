# 项目结构

哆啦A梦是一个基于微服务架构的现代化网络转发面板，采用前后端分离设计，集成了多个核心组件。

::: tip 需要帮助？
📱 [加入 Telegram 群组](https://t.me/+wdVDni1fdyI0YzE1) | 🐛 [GitHub Issues](https://github.com/bqlpfy/forward-panel/issues) | 🚀 [快速开始](/getting-started)
:::

## 总体架构

```
forward-panel/
├── 部署配置文件
├── 转发引擎 (go-gost)
├── 后端服务 (Spring Boot)
├── 前端界面 (Vue.js)
└── 文档站点 (VitePress)
```

## 完整目录结构

```
forward-panel/
├── docker-compose-v4.yml          # IPv4 环境部署配置
├── docker-compose-v6.yml          # IPv6 环境部署配置
├── gost.sql                       # MySQL 数据库初始化脚本
├── panel_install.sh               # 一键安装部署脚本
├── README.md                      # 项目说明文档
│
├── go-gost/                       # 转发引擎核心 (基于 go-gost)
│   ├── config.go                  # 主配置文件
│   ├── go.mod                     # Go 模块依赖管理
│   ├── go.sum                     # 依赖版本锁定
│   └── x/                         # 扩展功能模块
│       ├── admission/             # 准入控制
│       │   ├── admission.go       # 准入控制逻辑
│       │   └── plugin/            # 插件实现
│       ├── api/                   # API 接口定义
│       │   ├── api.go            # API 核心逻辑
│       │   ├── config_*.go       # 各种配置 API
│       │   └── service/          # 服务层实现
│       ├── auth/                  # 认证模块
│       ├── bypass/                # 绕行规则
│       ├── chain/                 # 转发链管理
│       ├── config/                # 配置管理
│       │   ├── cmd/              # 命令行工具
│       │   ├── loader/           # 配置加载器
│       │   └── parsing/          # 配置解析器
│       ├── connector/             # 连接器实现
│       │   ├── direct/           # 直连模式
│       │   ├── http/             # HTTP 连接器
│       │   ├── socks/            # SOCKS 代理
│       │   ├── relay/            # 中继连接
│       │   └── ...               # 其他连接器
│       ├── dialer/                # 拨号器实现
│       │   ├── direct/           # 直接拨号
│       │   ├── tcp/              # TCP 拨号器
│       │   ├── tls/              # TLS 拨号器
│       │   ├── ws/               # WebSocket 拨号器
│       │   └── ...               # 其他拨号器
│       ├── handler/               # 处理器实现
│       │   ├── http/             # HTTP 处理器
│       │   ├── socks/            # SOCKS 处理器
│       │   ├── relay/            # 中继处理器
│       │   ├── tunnel/           # 隧道处理器
│       │   └── ...               # 其他处理器
│       ├── listener/              # 监听器实现
│       │   ├── tcp/              # TCP 监听器
│       │   ├── tls/              # TLS 监听器
│       │   ├── ws/               # WebSocket 监听器
│       │   ├── quic/             # QUIC 监听器
│       │   └── ...               # 其他监听器
│       ├── limiter/               # 限流控制
│       │   ├── conn/             # 连接限流
│       │   ├── rate/             # 速率限流
│       │   └── traffic/          # 流量限流
│       ├── metrics/               # 监控指标
│       ├── recorder/              # 记录器
│       ├── resolver/              # 域名解析
│       ├── router/                # 路由管理
│       └── ...                   # 其他核心模块
│
├── springboot-backend/            # Spring Boot 后端服务
│   ├── Dockerfile                # 后端 Docker 镜像构建文件
│   ├── pom.xml                   # Maven 项目配置和依赖管理
│   ├── applog/                   # 应用日志目录
│   ├── src/                      # 源代码目录
│   │   ├── main/                 # 主要源码
│   │   │   ├── java/             # Java 源码
│   │   │   │   └── com/          # 包结构
│   │   │   │       └── panel/    # 项目主包
│   │   │   │           ├── controller/  # 控制层 (API 接口)
│   │   │   │           ├── service/     # 服务层 (业务逻辑)
│   │   │   │           ├── mapper/      # 数据访问层 (MyBatis)
│   │   │   │           ├── entity/      # 实体类 (数据模型)
│   │   │   │           ├── config/      # 配置类
│   │   │   │           └── util/        # 工具类
│   │   │   └── resources/        # 资源文件
│   │   │       ├── application.yml      # 应用配置
│   │   │       ├── mapper/              # MyBatis 映射文件
│   │   │       └── static/              # 静态资源
│   │   └── test/                 # 测试代码
│   │       └── java/             # 测试源码
│   └── target/                   # 编译输出目录
│
├── vue-frontend/                  # Vue.js 前端应用
│   ├── Dockerfile                # 前端 Docker 镜像构建文件
│   ├── nginx.conf               # Nginx 服务器配置
│   ├── package.json             # NPM 包管理和脚本配置
│   ├── package-lock.json        # NPM 依赖版本锁定
│   ├── babel.config.js          # Babel 编译配置
│   ├── vue.config.js            # Vue CLI 构建配置
│   ├── jsconfig.json            # JavaScript 项目配置
│   ├── public/                  # 静态资源
│   │   ├── index.html           # HTML 模板
│   │   └── favicon.ico          # 网站图标
│   ├── src/                     # 前端源码
│   │   ├── main.js              # 应用入口文件
│   │   ├── App.vue              # 根组件
│   │   ├── api/                 # API 接口封装
│   │   │   ├── index.js         # 主 API 文件
│   │   │   └── network.js       # 网络请求配置
│   │   ├── assets/              # 静态资源
│   │   │   └── logo.png         # 项目 Logo
│   │   ├── components/          # 可复用组件
│   │   │   └── EmptyState.vue   # 空状态组件
│   │   ├── directives/          # 自定义指令
│   │   │   └── permission.js    # 权限指令
│   │   ├── router/              # 路由配置
│   │   │   └── index.js         # 路由定义
│   │   ├── utils/               # 工具函数
│   │   │   ├── auth.js          # 认证工具
│   │   │   ├── clipboard.js     # 剪贴板工具
│   │   │   └── jwt.js           # JWT 处理
│   │   └── views/               # 页面组件
│   │       ├── Login.vue        # 登录页面
│   │       ├── Home.vue         # 主框架页面
│   │       ├── Index.vue        # 仪表板首页
│   │       ├── ChangePassword.vue  # 修改密码页面
│   │       ├── node.vue         # 节点管理页面
│   │       ├── Tunnel.vue       # 隧道管理页面
│   │       ├── Forward.vue      # 转发管理页面
│   │       ├── User.vue         # 用户管理页面
│   │       └── Limit.vue        # 限速规则页面
│   └── node_modules/            # NPM 依赖包
│
└── vitepress/                     # 文档站点 (VitePress)
    ├── .vitepress/               # VitePress 配置
    │   └── config.js             # 站点配置文件
    ├── package.json              # 文档站点依赖
    ├── index.md                  # 文档首页
    ├── getting-started.md        # 快速开始指南
    ├── guide.md                  # 详细使用指南
    └── public/                   # 静态资源
        └── favicon.ico           # 文档站点图标
```

## 核心组件详解

### 1. 转发引擎 (go-gost)

**功能**: 网络流量转发的核心引擎
**技术栈**: Go 语言
**主要特性**:
- 支持多种协议: TCP, UDP, TLS, WebSocket, QUIC 等
- 灵活的连接器和监听器架构
- 内置流量限制和监控功能
- 支持中继链和负载均衡
- 插件化的认证和绕行机制

**关键模块**:
- `connector/`: 实现各种出站连接器
- `listener/`: 实现各种入站监听器
- `handler/`: 处理不同协议的数据转发
- `limiter/`: 提供流量控制和限速功能
- `recorder/`: 记录流量统计和连接信息

### 2. 后端服务 (Spring Boot)

**功能**: 提供 RESTful API 和业务逻辑处理
**技术栈**: Java + Spring Boot + MyBatis + MySQL
**主要特性**:
- 用户认证和权限管理
- 节点、隧道、转发规则的 CRUD 操作
- 流量统计和监控数据收集
- 与 go-gost 引擎的配置同步
- 用户权限分级和资源限额管理

**核心模块**:
- `controller/`: REST API 接口层
- `service/`: 业务逻辑处理层
- `mapper/`: 数据访问层 (MyBatis)
- `entity/`: 数据模型和实体类
- `config/`: 系统配置和安全配置

### 3. 前端界面 (Vue.js)

**功能**: 现代化的 Web 管理界面
**技术栈**: Vue.js 2 + Element UI + Axios
**主要特性**:
- 响应式设计，支持桌面和移动端
- 实时数据更新和图表展示
- 直观的操作界面和用户体验
- 权限控制和路由守卫
- 组件化开发和代码复用

**页面结构**:
- `Login.vue`: 用户登录界面
- `Home.vue`: 主框架布局
- `Index.vue`: 仪表板和统计概览
- `node.vue`: 节点管理和监控
- `Tunnel.vue`: 隧道配置和管理
- `Forward.vue`: 转发规则管理
- `User.vue`: 用户和权限管理
- `Limit.vue`: 限速规则配置

### 4. 数据库设计

**技术**: MySQL 8.0+
**主要表结构**:
- `users`: 用户账号和基本信息
- `nodes`: 节点信息和状态
- `tunnels`: 隧道配置和参数
- `forwards`: 转发规则定义
- `user_permissions`: 用户权限分配
- `traffic_stats`: 流量统计数据
- `limit_rules`: 限速规则配置

### 5. 部署架构

**容器化**: Docker + Docker Compose
**网络模式**: 支持 IPv4/IPv6 双栈
**服务组件**:
- `vue-frontend`: Nginx + Vue.js 静态文件服务
- `springboot-backend`: Spring Boot API 服务
- `mysql`: MySQL 数据库服务
- `go-gost`: 转发引擎实例

**端口分配**:
- `6366`: 前端 Web 界面
- `6365`: 后端 API 服务
- `3306`: MySQL 数据库 (内部)
- `动态`: 转发端口范围

## 开发和扩展

### 添加新功能

1. **后端 API**: 在 `springboot-backend/src/main/java/` 中添加新的 Controller 和 Service
2. **前端页面**: 在 `vue-frontend/src/views/` 中创建新的 Vue 组件
3. **数据库**: 修改 `gost.sql` 添加新的表结构
4. **转发逻辑**: 扩展 `go-gost/x/` 中的相关模块

### 自定义配置

- **Docker 配置**: 修改 `docker-compose-*.yml` 文件
- **前端配置**: 调整 `vue-frontend/vue.config.js`
- **后端配置**: 修改 `springboot-backend/src/main/resources/application.yml`
- **Nginx 配置**: 更新 `vue-frontend/nginx.conf`

### 文档维护

- **用户文档**: 在 `vitepress/` 目录下编辑 Markdown 文件
- **API 文档**: 使用 Swagger 注解自动生成
- **代码注释**: 遵循各语言的文档注释规范

这个项目采用了现代化的微服务架构，各个组件职责明确，易于维护和扩展。通过容器化部署，可以快速在不同环境中部署和运行。 