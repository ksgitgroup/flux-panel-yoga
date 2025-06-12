# 转发面板

本项目基于 [go-gost/gost](https://github.com/go-gost/gost) 和 [go-gost/x](https://github.com/go-gost/x) 两个开源库，实现了转发面板。

---
## 特性

- 支持按 **隧道账号级别** 管理流量转发数量，可用于用户/隧道配额控制
- 支持 **TCP** 和 **UDP** 协议的转发
- 支持两种转发模式：**端口转发** 与 **隧道转发**
- 可针对 **指定用户的指定隧道进行限速** 设置
- 支持配置 **单向或双向流量计费方式**，灵活适配不同计费模型
- 提供灵活的转发策略配置，适用于多种网络代理场景

---
## 部署流程

### 源码编译部署

```bash

暂时没时间写，能源码部署的都是大佬，不差我这点文档
```
---
### Docker Compose部署
#### 快速部署

```bash
# 1. 进入部署目录
cd deployment

# 2. 给脚本添加执行权限
chmod +x deploy.sh

# 3. 启动所有服务
./deploy.sh start
```

#### 自定义服务器地址部署

```bash
# 如果你的服务器不是localhost，可以自定义API地址
VUE_APP_API_URL="http://your-server-ip:6365/api/v1" \
VUE_APP_WS_URL="ws://your-server-ip:6365" \
./deploy.sh start
```

#### 手动部署步骤

```bash
# 1. 确保Vue项目已打包到deployment/dist目录
cd vue
npm run build
cp -r dist ../deployment/

# 2. 进入部署目录
cd ../deployment

# 3. 启动所有服务
docker-compose up -d

# 4. 查看服务状态
docker-compose ps

# 5. 查看日志
docker-compose logs -f
```

#### 常用管理命令

```bash
# 停止服务
./deploy.sh stop

# 重启服务
./deploy.sh restart

# 查看服务状态
./deploy.sh status

# 查看实时日志
./deploy.sh logs

# 重新构建前端镜像
./deploy.sh build

# 清理未使用的Docker资源
./deploy.sh clean
```

#### 服务信息

| 服务 | 端口 | 说明 |
|------|------|------|
| 前端界面 | 80 | Vue.js Web管理界面 |
| 后端API | 6365 | Spring Boot后端服务 |
| MySQL | 3306 | 数据库服务 |
| Redis | 6379 | 缓存服务 |

#### 默认管理员账号

- **用户名**: admin_user
- **密码**: admin_user

> ⚠️ 首次登录后请立即修改默认密码！

#### 访问地址

- 前端管理界面: http://localhost
- 后端API文档: http://localhost:6365
- 数据库连接: localhost:3306 (用户名: gost, 密码: pwd)

#### 故障排除

```bash
# 查看服务日志
./deploy.sh logs

# 检查端口占用
netstat -tulpn | grep :80
netstat -tulpn | grep :6365

# 重新构建前端（如果前端有问题）
./deploy.sh build
./deploy.sh restart

# 完全重启（如果数据库有问题）
./deploy.sh stop
./deploy.sh start
```
---

## 免责声明

本项目仅供个人学习与研究使用，基于开源项目进行二次开发。

使用本项目所带来的任何风险由使用者自行承担，包括但不限于：

- 配置不当或使用错误导致的服务异常或不可用；
- 使用本项目引发的网络攻击、封禁、滥用等行为；
- 服务器因使用本项目被入侵、渗透、滥用导致的数据泄露、资源消耗或损失；
- 因违反当地法律法规所产生的任何法律责任。

**作者对因使用本项目所造成的任何直接或间接损失概不负责，也不提供任何形式的担保或技术支持。**

请确保在合法、合规、安全的前提下使用本项目。
