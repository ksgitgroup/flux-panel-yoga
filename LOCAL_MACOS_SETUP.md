# Flux Panel 本地迁移与测试流程 (macOS)

本文档用于把新的本地开发机 D/A（当前 MacBook Air）接入现有的云端开发 B 和生产 C 流程。

## 1. 目标流程

- 本地 D/A: 写代码、编译验证、Docker 本地联调
- 云端 B: 推送 `dev` 后由 GitLab CI 同步到 GitHub，再由 GitHub Actions 构建 Docker Hub `dev-latest` 镜像并自动部署
- 云端 C: 推送 `main` 后由 GitLab CI 同步到 GitHub，构建 `latest` 镜像，GitLab 手动确认后部署

## 2. 这台 Mac 需要的工具

- Homebrew
- Java 21
- Maven 3.9+
- Node 20
- Docker CLI
- Docker Compose
- Colima

项目内置脚本会尽量帮你准备这些工具：

```bash
./scripts/setup_dev.sh
```

在 macOS 上，这个脚本会自动转到 `scripts/setup_dev_macos.sh`。

## 3. 一次性初始化

```bash
git switch dev
git pull origin dev
./scripts/setup_dev.sh
```

如果当前 shell 仍识别不到 Java 21 或 Node 20，执行：

```bash
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$(brew --prefix node@20)/bin:$PATH"
```

初始化完成后，项目根目录会生成本地 `.env`，默认值如下：

- `IMAGE_REGISTRY=flux-panel`
- `IMAGE_TAG=local`
- `DB_NAME=gost`
- `DB_USER=gost`
- `DB_PASSWORD=gost_password_123`
- `JWT_SECRET=local_dev_secret_key_6365`
- `BACKEND_PORT=6365`
- `FRONTEND_PORT=8080`

## 4. 本地测试流程

### 4.1 代码级校验

```bash
./scripts/verify_build.sh
```

这一步会：

- 执行后端 `mvn clean package -DskipTests`
- 执行前端 `npm run build`
- 校验 `.gitlab-ci.yml` 与 `.github/workflows/*.yml` 的 YAML 语法
- 检查版本号是否同步

### 4.2 Docker 本地联调

```bash
./scripts/build_docker.sh
./scripts/reload_local_stack.sh
```

联调入口：

- 前端: `http://localhost:8080`
- 后端: `http://localhost:6365`
- phpMyAdmin: `http://localhost:8066`

查看日志：

```bash
docker logs -f springboot-backend
docker logs -f vite-frontend
```

停止本地环境：

```bash
docker-compose -f docker-compose-v4.local.yml down
```

说明：

- `./scripts/build_docker.sh` 只负责生成最新 `local` 镜像
- 如果本地容器已经在运行，必须执行 `./scripts/reload_local_stack.sh`
- 否则 `http://localhost:8080` / `http://localhost:6365` 仍可能是旧容器
- 以上两个脚本现在会自动调用 `./scripts/cleanup_local_artifacts.sh`，回收构建产物、npm 缓存和无用 Docker 镜像
- 这台 Mac 可用空间紧张时，优先执行：

```bash
./scripts/cleanup_local_artifacts.sh post-reload
```

## 5. 前端本地开发模式

如果你不想走前端 Docker 容器，也可以直接在主机上运行 Vite：

```bash
cd vite-frontend
npm install
npm run dev
```

仓库中的 `vite-frontend/.env.development` 已改为：

```bash
VITE_API_BASE=http://localhost:6365
```

这表示 Vite 开发服务器默认请求本机后端，而不是旧机器的局域网 IP。

## 6. 推送到云端

本地验证通过后，推送到开发环境 B：

```bash
git switch dev
./scripts/ship_dev.sh "feat: describe your change"
```

如果你已经提前完成本地提交，只需要推送现有提交，也可以继续使用：

```bash
./scripts/sync_dev.sh
```

说明：

- `./scripts/ship_dev.sh` 会先执行 `./scripts/verify_build.sh`
- 验证通过后才会创建本地 commit
- 然后按这个新 commit 重建本地 Docker 镜像并重载容器
- 最后再推送到 `origin/dev`
- 因此本地页面中的“提交标识”会和刚推送的 commit 保持一致

当需要发布到生产环境 C 时：

```bash
git switch main
git pull origin main
git merge dev
git push origin main
```

之后在 GitLab 中手动确认生产部署任务。

如果是通过 Merge Request 从 `dev` 合入 `main`，先在本地生成建议标题与描述：

```bash
./scripts/prepare_release_mr.sh
```

仓库已提供默认 MR 模板 `.gitlab/merge_request_templates/Default.md`，并在 GitLab CI 中校验：

- 标题不能只写 `dev`
- 必须填写“发布摘要 / 本次变更 / 本地验证 / 风险与回滚”

## 7. 当前项目对这台 Mac 的关键注意点

- 后端必须使用 Java 21
- CI 和 Docker 构建使用 Node 20，本地也建议对齐 Node 20
- `scripts/setup_dev.sh` 原先只适用于 Ubuntu，现在已可在 macOS 上调用专用脚本
- 本地只负责验证和推送，B/C 的部署逻辑已经在 GitLab CI 和 GitHub Actions 中存在
