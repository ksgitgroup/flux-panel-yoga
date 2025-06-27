# 常见问题

::: tip 需要帮助？
📱 [加入 Telegram 群组](https://t.me/+wdVDni1fdyI0YzE1) | 🐛 [GitHub Issues](https://github.com/bqlpfy/forward-panel/issues) | 🚀 [快速开始](/getting-started)
:::

## 日志查看

### 查看后端服务日志

当后端服务出现问题时，可以通过以下命令查看实时日志：

```bash
docker logs -f springboot-backend
```

**说明**：
- `docker logs` - 查看Docker容器日志
- `-f` - 持续跟踪日志输出（类似tail -f）
- `springboot-backend` - 后端服务容器名称

**使用场景**：
- API 接口报错
- 用户登录问题
- 数据库连接异常
- 隧道/转发创建失败

### 查看转发引擎日志

当转发功能出现问题时，可以通过以下命令查看gost服务日志：

```bash
journalctl -u gost -f
```

**说明**：
- `journalctl` - 系统日志查看工具
- `-u gost` - 指定查看gost服务的日志
- `-f` - 持续跟踪日志输出

**使用场景**：
- 转发连接失败
- 流量统计异常
- 节点连接问题
- 限速功能故障

## 日志分析技巧

### 常用日志筛选

```bash
# 查看最近100行日志
docker logs --tail 100 springboot-backend

# 查看指定时间段的日志
journalctl -u gost --since "2024-01-01" --until "2024-01-02"

# 搜索包含ERROR的日志
docker logs springboot-backend | grep ERROR
```

### 日志等级说明

- **ERROR** - 错误信息，需要立即处理
- **WARN** - 警告信息，建议关注
- **INFO** - 一般信息，正常运行状态
- **DEBUG** - 调试信息，详细执行过程

## 获取更多帮助

如果上述信息无法解决您的问题：

### 社区支持

1. **💬 Telegram 群组**（推荐）
   - [立即加入](https://t.me/+wdVDni1fdyI0YzE1)
   - 实时讨论，经验分享
   - 开发者和社区用户在线答疑

2. **🐛 GitHub Issues**
   - [报告 Bug](https://github.com/bqlpfy/forward-panel/issues/new)
   - [查看已知问题](https://github.com/bqlpfy/forward-panel/issues)
   - 参与功能讨论

### 技术支持

提交问题时，请提供以下信息以便快速诊断：

- 操作系统版本
- Docker 和 Docker Compose 版本
- 错误日志完整内容
- 问题复现步骤
- 相关配置文件（隐去敏感信息）

### 文档资源

- [使用指南](/guide) - 详细操作教程
- [快速开始](/getting-started) - 安装和配置
- [项目结构](/project-structure) - 技术架构说明 