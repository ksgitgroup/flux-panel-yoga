# Flux Panel Yoga CI/CD Architecture

当前文档对应版本：`v1.4.6`

本文档只描述“当前仓库真实生效的链路”，不再保留历史设想版本。

## 1. 总体链路

```text
Local Mac (A / D)
  -> GitLab (主仓库)
  -> GitHub (代码镜像 + GitHub Actions 构建入口)
  -> Docker Hub (镜像仓库)
  -> Dev B / Prod C (目标运行环境)
```

角色拆分：

- GitLab
  - 代码主仓库
  - 流水线编排入口
  - Dev/Prod 部署动作发起者
- GitHub
  - 接收 GitLab 推送
  - 运行 GitHub Actions 构建镜像
- Docker Hub
  - 存放前后端运行镜像
- Runner B / Runner C
  - 直接位于目标机器侧，负责拉镜像和启动容器

## 2. 分支语义

- `dev`
  - 开发分支
  - 推送后自动进入开发环境 B
- `main`
  - 生产分支
  - 推送后进入生产构建流程，部署需要手动确认

## 3. 本地到 GitLab 的入口

标准开发出口：

```bash
./scripts/ship_dev.sh "feat: your change"
```

这个脚本不是简单 `git push`，而是固定做下面几步：

1. `./scripts/verify_build.sh`
2. `git add -A`
3. `git commit --no-gpg-sign`
4. `./scripts/build_docker.sh`
5. `./scripts/reload_local_stack.sh`
6. `git push origin dev`
7. `./scripts/cleanup_local_artifacts.sh post-ship`

设计目标：

- 本地源码必须先真实构建通过
- 本地容器必须切到最新 commit
- 成功后才允许进入 GitLab `dev`

## 4. GitLab CI 当前实际行为

核心文件：

- [`.gitlab-ci.yml`](.gitlab-ci.yml)
- [`scripts/print_ci_commit_summary.sh`](scripts/print_ci_commit_summary.sh)
- [`scripts/remote_deploy.sh`](scripts/remote_deploy.sh)

### 4.1 `build:dev`

触发条件：`CI_COMMIT_BRANCH == dev`

职责：

1. 打印版本号、短 SHA 和提交摘要
2. 将 `dev` 分支强制推送到 GitHub `dev`
3. 交由 GitHub Actions 构建镜像

说明：

- GitLab Runner 不再本地编译镜像
- 这么做是为了避开服务器 B 的内存瓶颈
- shell runner 中不引入 `node`、`jq` 等额外依赖

### 4.2 `deploy:dev`

触发条件：`build:dev` 成功后自动执行

职责：

1. 拷贝 `docker-compose-v6.yml`、`gost.sql`、`remote_deploy.sh`
2. 等待 Docker Hub 上的 `dev-latest` 可拉取
3. 在开发环境 B 执行部署脚本

镜像入口：

- `amerluya/flux-panel-yoga-frontend:dev-latest`
- `amerluya/flux-panel-yoga-backend:dev-latest`

### 4.3 `build:prod`

触发条件：`CI_COMMIT_BRANCH == main`

职责：

1. 打印版本号、短 SHA 和提交摘要
2. 将 `main` 强制推送到 GitHub `main`
3. 触发 GitHub Actions 构建生产镜像

### 4.4 `deploy:prod`

触发条件：`build:prod` 成功后，且手动确认

职责：

1. 等待 Docker Hub 上的 `latest` 可拉取
2. 在生产环境 C 执行部署脚本

### 4.5 `sync:github`

当前仍保留一个 `main` 分支的同步 job，用于把 GitLab `main` 再次同步到 GitHub。它更偏向兜底同步，不是镜像构建的唯一入口。

## 5. GitHub Actions 当前实际行为

核心文件：

- [`.github/workflows/docker-build-push.yml`](.github/workflows/docker-build-push.yml)

职责：

1. 检出 GitHub 上的 `dev` 或 `main`
2. 登录 Docker Hub
3. 读取版本号和短 SHA
4. 为前后端生成标签
5. 使用 Buildx 构建并推送镜像

### 5.1 标签策略

#### `dev`

- `amerluya/flux-panel-yoga-frontend:dev-latest`
- `amerluya/flux-panel-yoga-frontend:dev-<version>-<sha>`
- `amerluya/flux-panel-yoga-backend:dev-latest`
- `amerluya/flux-panel-yoga-backend:dev-<version>-<sha>`

#### `main`

- `amerluya/flux-panel-yoga-frontend:latest`
- `amerluya/flux-panel-yoga-frontend:<version>`
- `amerluya/flux-panel-yoga-frontend:<version>-<sha>`
- `amerluya/flux-panel-yoga-backend:latest`
- `amerluya/flux-panel-yoga-backend:<version>`
- `amerluya/flux-panel-yoga-backend:<version>-<sha>`

## 6. 版本语义与部署原则

项目当前统一遵守两层版本：

- 发布版本：例如 `v1.4.6`
- 构建标识：例如 `dev.089fca6`

### 6.1 为什么 Dev/Prod 仍保留 `dev-latest` / `latest`

因为开发环境 B 和生产环境 C 已经跑通，现阶段不能为了追踪性破坏已有部署入口。

所以当前策略是：

- 部署入口标签保持兼容
- 额外的版本化标签只用于追踪和审计

## 7. 服务器侧部署逻辑

核心文件：

- [`scripts/remote_deploy.sh`](scripts/remote_deploy.sh)

它会在目标机器上做这些事：

1. 生成或更新 `.env`
2. 写入镜像仓库和镜像标签
3. 拷贝 `docker-compose-v6.yml` 为 `docker-compose.yml`
4. `docker compose pull`
5. `docker compose up -d`
6. 等待 MySQL 健康
7. 检查业务表是否已初始化
8. 如需要则导入 `gost.sql`

这意味着：

- 镜像更新不会覆盖已有业务数据
- 数据持久化主要依赖 MySQL volume
- 只有涉及数据库结构变更时，才需要额外关注迁移逻辑

## 8. 本地验证与 CI 门禁

CI 之外，本地也有硬门槛。

核心文件：

- [`scripts/verify_build.sh`](scripts/verify_build.sh)

它当前会校验：

1. `.env` 是否存在
2. Maven / npm 是否可用
3. 前后端版本号是否一致
4. `.gitlab-ci.yml` 和 `.github/workflows/*.yml` YAML 语法是否正确
5. 后端 `mvn clean package -DskipTests`
6. 前端 `npm run build`

只有这一步通过，才应该继续 `ship_dev`。

## 9. 这套 CI/CD 当前的工程要求

1. 不要在 `.gitlab-ci.yml` 中引入 runner 不保证存在的工具依赖
2. CI 日志要能直接看出：
   - 当前版本
   - 当前提交
   - 本次提交摘要
3. Dev/Prod 的部署入口标签不要随意改
4. 版本号必须同步：
   - `vite-frontend/package.json`
   - `springboot-backend/pom.xml`
   - `springboot-backend/src/main/resources/application.yml`

## 10. 当前已知限制

1. Dev 环境部署依赖 GitHub Actions 先完成构建，因此 GitLab 部署 job 会等待镜像可拉取
2. GitLab 和 GitHub 之间当前使用 push 同步，不是 GitLab 内置镜像仓库方案
3. 本地 `ship_dev` 先构建、后提交、再以新 commit 重建容器，因此第一次本地 verify 显示的短 SHA 总是“提交前的当前 HEAD”，这是正常现象

## 11. 运维排查顺序

如果 `dev` 或 `main` 的部署出问题，建议按这个顺序查：

1. GitLab CI 是否成功执行 `build:*`
2. GitHub Actions 是否成功构建并推送镜像
3. Docker Hub 目标 tag 是否存在
4. `deploy:*` 是否成功等待到镜像
5. 目标机器上的 `remote_deploy.sh` 是否执行成功
6. MySQL / 后端容器健康状态是否正常
