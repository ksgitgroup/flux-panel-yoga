# Flux Panel 项目架构分析与维护指南

## 1. 项目核心结构
本项目是一个跨语言的“管理面板 + 分布式受控节点”网络代理转发系统。主要包含以下三个核心组件：

- **`springboot-backend/` (控制端/后端)**：基于 Java SpringBoot。负责业务逻辑处理、API 提供、数据库操作（用户权限、配额管理、生成隧道规则和节点管理）。
- **`vite-frontend/` (控制端/前端UI)**：基于 Vue3 + Vite。提供管理员与用户的 Web 界面（包含注册、充值、隧道管理等功能）。
- **`go-gost/` (受控节点端)**：基于 Go 语言的开源代理软件 `gost` 的深度魔改定制版。部署在各类云服务器上执行实际的端口和隧道转发，同时将流量使用情况上报给控制中枢以进行配额扣除与限速。

## 2. 关键安装脚本分析

- **`panel_install.sh`**：面板（控制端）的一键安装脚本。它不涉及源码编译，而是直接通过 `docker-compose` 拉取原作者预先打包好的 Docker 镜像（如 `brunuhville/springboot-backend:latest` 和 `brunuhville/vite-frontend:latest`）进行部署启动。
- **`install.sh`**：节点（受控端）的一键安装脚本。它从原作者的 GitHub Releases 中拉取已编译打包好的 `gost` 二进制执行文件，下载到 `/etc/gost` 下，并注册 Systemd 服务进行后台守护。

## 3. 本地代码修改后的云端更新方法

由于原有安装脚本均拉取“预编译”好的镜像或二进制文件，在本地修改源码后，**不能直接依赖原本的安装脚本在云端现场编译生效**。具体更新步骤如下：

### 3.1 修改节点端 (`go-gost`)
1. **重新编译打包**：本地或 CI 环境中针对 Linux 平台编译修改后的源码：
   ```bash
   cd go-gost
   GOOS=linux GOARCH=amd64 go build -o gost .
   ```
2. **替换与生效**：将生成的 `gost` 二进制文件上传至目标服务器对应的目录覆盖旧文件（通常为 `/etc/gost/gost`），赋予可执行权限 `chmod +x /etc/gost/gost`，然后执行 `systemctl restart gost` 使得新代码生效。

### 3.2 修改面板端 (`springboot-backend` / `vite-frontend`)
1. **构建 Docker 镜像**：对修改后的 Java 或 Vue 项目进行编译，并构建对应的 Docker 镜像包。
2. **推送到镜像仓库**：将打包好的镜像推送到你自己的 Docker Registry（如 Docker Hub、阿里云镜像服务或个人的私有镜像库）。
3. **改写部署配置**：将代码中的 `docker-compose-v4.yml` / `v6.yml` 中的原作者 `image:` 属性替换为你自己的镜像拉取地址。
4. **服务器拉取与重启**：在面板服务器所在目录下执行 `docker-compose pull` 拉取最新镜像，并执行 `docker-compose up -d` 重新启动服务。

## 4. 基于 GitLab 持续维护发行版方案

为了长期自用和方便后续闭环迭代，建议借助 GitLab 的 CI/CD 能力打造个人的专属发行发布版：

1. **私有化代码库**：在你的 GitLab 创建新项目，按现有结构原样上传所有源码和脚本。
2. **替换关联硬编码的下载链接**：
   - 将 `panel_install.sh` 中的 `DOCKER_COMPOSEV4_URL` 及其他配置文件的下载变量，改为你的 GitLab 仓库 RAW 文件直连地址（由于私有库防护，可能需要在脚本中附带下载 Token 或将其设为公开项目）。
   - 将 `install.sh` 中的 `DOWNLOAD_URL` 替换为你将要生成的受控端 `gost` 二进制文件发布地址。
   - 将 `docker-compose` 中的 `image:` 标签全部替换成你的 GitLab Container Registry 地址。
3. **编写 CI/CD (`.gitlab-ci.yml`) 剧本**：
   - **自动化后端构建**：流水线执行 Maven/Gradle 编译生成的 `.jar` -> 通过 `docker build` 制作后端镜像 -> `docker push` 到注册中心。
   - **自动化前端构建**：流水线执行 `npm run build` 生成 `dist` 静态文件 -> `docker build` (将其封装进 Nginx 镜像) -> `docker push` 定向到后端统一环境。
   - **自动化节点构建**：流水线开启 Go 交叉编译，打出 `gost` 二进制包，存为 GitLab Release Assets 供云节点一键下载。
4. **日常迭代**：
   此后只需本地提交代码并 `Push` 进主分支即可！GitLab Runner 会自动运行流水线帮你“发版”。在云端维护人员只需一键运行你二次修改的安装脚本，或者在面板目录 `docker-compose pull && docker-compose up -d` 即可无缝升级。

## 5. 多节点的数据同步与持久化说明

针对“本机A（开发） -> GitLab B（代码库） -> 服务器C（生产环境运行）”的架构，以下是同步链路与数据落地的机制分析：

### 5.1 代码更新如何同步到服务器C？
GitLab B 同步了新的代码后，**服务器C 并不会自动更新**。你需要主动在服务器C触发更新。

- **面板端更新 (Springboot / Vue)**：
  由于服务器C是通过 `docker-compose` 和 Docker 镜像运行的，当 GitLab B 完成 CI/CD 打包出并将其推送到 Registry（镜像库）后，你需要登录**服务器C（或者写一个 Webhook 让 GitLab 通知它）**，在面板所在的目录（包含 `docker-compose.yml`）执行：
  ```bash
  docker-compose pull   # 拉取最新的镜像
  docker-compose up -d  # 重新创建并启动容器
  ```
  这样，服务器C 就能运行到你本机A修改的新代码逻辑。

- **节点端更新 (gost)**：
  如果修改的是底层的节点代码，同样的，你需要让 GitLab 发布新的二进制包。然后在各个跑着节点的服务器（通常不是主面板服务器）中，重新执行一遍你的 `install.sh` 脚本（脚本里有覆盖更新逻辑），或者自己写个定时任务去检测拉取。

### 5.2 更新会对C中的个性化数据有影响吗？
**完全没有影响！** Docker化部署最大的优势就是“程序与数据解耦”。镜像升级只会替换程序代码，不会删除或覆盖业务数据。

### 5.3 业务数据存储在哪里？
用户的账户信息、充值记录、隧道配置、限速规则等核心**业务数据存储在 MySQL 数据库**中。
在服务器C的运行环境中，根据 `docker-compose.yml` 的配置：
- MySQL 的数据被持久化挂载到了本机的 Docker Volume `mysql_data` 中，它通常对应物理机上的 `/var/lib/docker/volumes/mysql_data/_data` 目录。
- 系统的运行日志留存在了 `backend_logs` Volume 中。

所以，即使你删除了现在的 `springboot-backend` 的运行容器并拉取新版本的容器替换，因为外挂在宿主机的 `mysql_data` 卷没有消失，新启动的面板依然能读出里面原封不动的隧道记录和用户信息。你在更新代码时，唯一需要注意的仅当**你的代码修改涉及到了数据库表结构（比如增加了新字段）**时，你需要通过类似 `panel_install.sh` 中的 SQL 脚本执行数据库字段变更迁移。
