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

按 `Ctrl+C` 退出日志查看

### 查看节点日志

当转发功能出现问题时，可以通过以下命令查看gost服务日志：

```bash
journalctl -u gost -f
```

按 `Ctrl+C` 退出日志查看

## 面板管理

面板管理脚本提供交互式菜单：
```
===============================================
          面板管理脚本
===============================================
请选择操作：
1. 安装面板
2. 更新面板
3. 卸载面板
4. 退出
===============================================
```

### 更新面板

当您需要更新到最新版本时，使用安装脚本的更新功能：

```bash
curl -L https://raw.githubusercontent.com/bqlpfy/forward-panel/refs/heads/main/panel_install.sh -o panel_install.sh && chmod +x panel_install.sh && ./panel_install.sh
```

运行脚本后，在菜单中选择 **2. 更新面板**

**更新过程包括**：
- 🔽 下载最新的 docker-compose 配置文件
- 🛑 停止当前运行的服务
- ⬇️ 拉取最新的 Docker 镜像
- 🔄 执行数据库结构更新（自动迁移）
- 🚀 启动更新后的服务

**注意事项**：
- 更新过程会保留所有现有数据和配置
- 数据库结构会自动更新，无需手动操作
- 如果遇到问题，可查看日志诊断：
  ```bash
  docker logs -f springboot-backend
  docker logs -f gost-mysql
  ```
  按 `Ctrl+C` 退出日志查看

**健康检查**：
更新脚本会自动等待服务启动并检查健康状态：
- 后端服务：等待最多 90 秒
- 数据库服务：等待最多 60 秒

### 卸载面板

如果需要完全移除面板：

```bash
curl -L https://raw.githubusercontent.com/bqlpfy/forward-panel/refs/heads/main/panel_install.sh -o panel_install.sh && chmod +x panel_install.sh && ./panel_install.sh
```

运行脚本后，在菜单中选择 **3. 卸载面板**，然后输入 **y** 确认卸载

**卸载操作包括**：
- 🛑 停止并删除所有容器
- 🧹 删除 Docker 镜像和数据卷
- 📁 删除配置文件（docker-compose.yml、gost.sql、.env）

⚠️ **重要警告**：
- 卸载会**永久删除**所有数据，包括用户账号、转发规则、流量统计等

## 节点管理

节点管理脚本提供交互式菜单：
```
===============================================
              管理脚本
===============================================
请选择操作：
1. 安装
2. 更新
3. 卸载
4. 退出
===============================================
```

### 更新节点程序

在节点服务器上更新 GOST 程序：

```bash
curl -L https://raw.githubusercontent.com/bqlpfy/forward-panel/refs/heads/main/install.sh -o install.sh && chmod +x install.sh && ./install.sh
```

运行脚本后，在菜单中选择 **2. 更新**


### 卸载节点程序

完全移除节点上的 GOST 程序：

```bash
curl -L https://raw.githubusercontent.com/bqlpfy/forward-panel/refs/heads/main/install.sh -o install.sh && chmod +x install.sh && ./install.sh
```

运行脚本后，在菜单中选择 **3. 卸载**，然后输入 **y** 确认卸载

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

