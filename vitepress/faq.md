# 常见问题

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