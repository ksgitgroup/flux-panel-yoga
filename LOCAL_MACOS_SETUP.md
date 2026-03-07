# Flux Panel Yoga Local macOS Setup

当前文档对应版本：`v1.4.6`

本文档只描述当前这台 MacBook Air 的真实开发方式，不再保留旧机器路径和旧假设。

## 1. 当前本机的真实状态

- 真实工作副本：`/Users/mac/Developer/flux-panel-yoga`
- `~/Documents/KS_Work/flux-panel-yoga`：软链接入口
- 本地容器运行时：Colima
- 本地 compose 文件：`docker-compose-v4.local.yml`

如果你以后把这个项目并到更大的工作区，优先保留真实工作副本，不要再把 iCloud / Documents 路径当成主运行目录。

## 2. 为什么这台 Mac 要用 Colima

在 macOS 上：

- `docker` 只是客户端
- 真正运行 Linux 容器需要底层 Linux VM
- Colima 就是这个 VM/运行时

### 2.1 Colima 的作用

- 提供 Linux 容器运行环境
- 让 `docker build` / `docker compose up` 能在 macOS 上工作
- 替代 Docker Desktop 这类更重的方案

### 2.2 如果不用 Colima 会怎样

- 当前仓库这套本地 Docker 联调流程无法直接跑
- 除非换成 Docker Desktop / OrbStack / Rancher Desktop 等等价方案

## 3. 本机需要的工具链

- Homebrew
- Java 21
- Maven 3.9+
- Node 20
- Docker CLI
- Docker Compose
- Colima

初始化入口：

```bash
./scripts/setup_dev.sh
```

在 macOS 上，它会自动分发到：

```bash
./scripts/setup_dev_macos.sh
```

## 4. 一次性初始化

```bash
git switch dev
git pull origin dev
./scripts/setup_dev.sh
```

如果 shell 没识别 Java 21 / Node 20，手动执行：

```bash
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$(brew --prefix node@20)/bin:$PATH"
```

## 5. 本地 `.env`

初始化后根目录会生成 `.env`。

当前本地默认值通常是：

- `IMAGE_REGISTRY=flux-panel`
- `IMAGE_TAG=local`
- `DB_NAME=gost`
- `DB_USER=gost`
- `DB_PASSWORD=gost_password_123`
- `JWT_SECRET=local_dev_secret_key_6365`
- `BACKEND_PORT=6365`
- `FRONTEND_PORT=8080`

## 6. 日常开发流程

### 6.1 只验证源码

```bash
./scripts/verify_build.sh
```

它会做：

1. 版本一致性检查
2. CI YAML 语法检查
3. 后端 `mvn clean package -DskipTests`
4. 前端 `npm run build`

### 6.2 本地 Docker 联调

```bash
./scripts/build_docker.sh
./scripts/reload_local_stack.sh
```

访问入口：

- 前端：`http://localhost:8080`
- 后端：`http://localhost:6365`
- phpMyAdmin：`http://localhost:8066`

说明：

- `build_docker.sh` 只负责产出最新 `local` 镜像
- `reload_local_stack.sh` 才会让正在运行的容器切到新镜像
- 不执行第二步，就可能看到旧页面或旧后端逻辑
- 当本机可用空间不足时，`verify_build.sh` / `build_docker.sh` 会先触发 `pre-build` 清理，必要时再升级到 `deep-host` 清理，避免构建到一半爆盘

### 6.3 标准开发出口

```bash
./scripts/ship_dev.sh "feat: your change"
```

这是当前唯一推荐的 dev 提交流程。

它会固定执行：

1. `verify_build.sh`
2. `git add -A`
3. `git commit`
4. `build_docker.sh`
5. `reload_local_stack.sh`
6. `git push origin dev`
7. `cleanup_local_artifacts.sh post-ship`

### 6.4 只推送已有 commit

```bash
./scripts/sync_dev.sh
```

只在“本地 commit 已经存在”的情况下使用。

## 7. 磁盘空间治理

这台 Mac 的真正风险不是源码，而是容器运行时和缓存。

### 7.1 大头占用通常来自

- `~/.colima`
- Docker 镜像
- Docker builder cache
- npm / Homebrew 缓存

### 7.2 自动清理

以下脚本会自动清理：

- `verify_build.sh` 会在低空间时先执行预清理
- `build_docker.sh`
- `reload_local_stack.sh`
- `ship_dev.sh`
- `sync_dev.sh`

### 7.3 手动深度清理

当磁盘低于约 `5 GiB` 时执行：

```bash
./scripts/cleanup_local_artifacts.sh deep-host
```

它会额外清理：

- Homebrew 下载缓存
- npm 全局缓存
- Maven 失效元数据
- 未使用的 Docker 容器 / 网络 / volume
- 镜像与 builder cache

### 7.4 如果还不够

如果你明确不再需要本地 Docker 联调，删除或重建 Colima 才是最大回收项。

## 8. 本地运行排障

### 8.1 后端能通，前端看不到新页面

先执行：

```bash
./scripts/reload_local_stack.sh
```

然后浏览器强刷。

### 8.2 `verify_build.sh` 报依赖问题

先确认：

- `mvn -v`
- `node -v`
- `npm -v`

如果仍有问题，重新执行：

```bash
./scripts/setup_dev.sh
```

### 8.3 Docker 命令失败

先确认：

```bash
colima status
docker ps
```

如果 Colima 没起：

```bash
colima start
```

### 8.4 本地路径混乱

始终以这个目录为准：

```bash
/Users/mac/Developer/flux-panel-yoga
```

## 9. 版本与显示规则

当前版本显示遵循：

- 发布版本：`v1.4.6`
- 构建标识：`dev.<short_sha>`

本地页面里看到的 `build_revision`，应该和最新一次 `ship_dev` 推送后的 commit 对应一致。

## 10. 当前建议

1. 保留 Colima，除非你明确不再做本地 Docker 联调
2. 日常只用 `ship_dev.sh`，不要手工拼接一串 build / compose / push 命令
3. 只在空间吃紧时再执行 `deep-host`
4. 保持 `package.json`、`pom.xml`、`application.yml` 版本同步
