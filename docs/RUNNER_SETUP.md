# GitLab Runner 配置指南（Rn1-Runner-General-New）

> 最后更新: 2026-03-16
> 适用服务器: racknerd-9e16ced (RN1 DEV 环境)

---

## 一、架构总览

```
开发者本地 → git push → GitLab (gitlab.kingsungsz.com)
                              │
                    ┌─────────┴──────────┐
                    │ .gitlab-ci.yml     │
                    │  build:dev  ────────┼──→ push 到 GitHub → GitHub Actions 构建 Docker 镜像 → Docker Hub
                    │  deploy:dev ────────┼──→ Runner 在 DEV 服务器上拉取镜像并部署
                    │  build:prod ────────┼──→ push 到 GitHub → GitHub Actions 构建
                    │  deploy:prod ───────┼──→ Runner 在 PROD 服务器上拉取并部署（手动触发）
                    └────────────────────┘

Runner 配置:
  - DEV 服务器 (RN1):  Rn1-Runner-General-New  → 跑 build:dev + deploy:dev + build:prod
  - PROD 服务器 (RN2): Rn2-US-Runner-Gereral   → 跑 deploy:prod
```

---

## 二、Runner 完整创建流程

### 2.1 在 GitLab 创建 Runner 令牌

1. 打开 `https://gitlab.kingsungsz.com/admin/runners`
2. 点击 **"New instance runner"**
3. Platform: **Linux**
4. 勾选 **"Run untagged jobs"**
5. 点 **"Create runner"**
6. **复制 `glrt-xxxx` token**（只显示一次！）

> ⚠️ 新版 GitLab (16+) 的 `glrt-` token 不允许在命令行传 `--tag-list`，tag 必须在 UI 里设。

### 2.2 创建宿主机持久化目录

```bash
RUNNER_NAME="Rn1-Runner-General-New"

# 存放 config.toml（runner 注册信息），宿主机持久化，容器删了也不丢
mkdir -p /srv/$RUNNER_NAME

# 存放 SSH 密钥
mkdir -p /srv/$RUNNER_NAME/ssh
```

### 2.3 创建 Runner 容器

```bash
RUNNER_NAME="Rn1-Runner-General-New"

docker run -d \
  --name $RUNNER_NAME \
  --restart unless-stopped \
  \
  # ── 持久化配置（关键！用宿主机目录绑定，不用匿名卷） ──
  -v /srv/$RUNNER_NAME:/etc/gitlab-runner \
  -v /srv/$RUNNER_NAME/ssh:/root/.ssh \
  \
  # ── Docker 访问（让 CI job 能执行 docker pull / docker compose） ──
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /usr/bin/docker:/usr/bin/docker:ro \
  -v /usr/libexec/docker/cli-plugins:/usr/libexec/docker/cli-plugins:ro \
  \
  # ── 部署目录（deploy:dev 需要写 docker-compose 文件到这里） ──
  -v /opt/1panel/apps/local/flux-panel:/opt/1panel/apps/local/flux-panel \
  \
  # ── gitlab-runner 工作目录 ──
  -v /home/gitlab-runner:/home/gitlab-runner \
  \
  gitlab/gitlab-runner:latest
```

**卷挂载说明**:

| 挂载 | 用途 | 为什么需要 |
|---|---|---|
| `/srv/$RUNNER_NAME:/etc/gitlab-runner` | runner 配置 | 存 config.toml (含 token)，**宿主机绑定防止重建丢失** |
| `/srv/$RUNNER_NAME/ssh:/root/.ssh` | SSH 密钥 | 同上，持久化 |
| `/var/run/docker.sock` | Docker daemon | CI job 需要执行 `docker pull` / `docker compose` |
| `/usr/bin/docker:ro` | Docker CLI 二进制 | 容器内没有 docker 命令，需要从宿主机映射 |
| `/usr/libexec/docker/cli-plugins:ro` | Docker Compose 插件 | `docker compose` 命令需要此插件 |
| `/opt/1panel/apps/local/flux-panel` | 部署目录 | deploy:dev 要往这里写 docker-compose.yml 并执行部署 |
| `/home/gitlab-runner` | 工作目录 | runner 克隆代码和构建的工作目录 |

### 2.4 注册 Runner

```bash
RUNNER_NAME="Rn1-Runner-General-New"

docker exec -it $RUNNER_NAME gitlab-runner register \
  --non-interactive \
  --url "https://gitlab.kingsungsz.com/" \
  --token "glrt-你在步骤2.1复制的token" \
  --executor "shell" \
  --description "$RUNNER_NAME" \
  --clone-url "ssh://git@gitlab.kingsungsz.com:2222"
```

> **注意**: 不要加 `--tag-list`、`--run-untagged` 等参数，`glrt-` token 不允许，会直接 FATAL 退出。

### 2.5 在 GitLab UI 设置 Tag

注册完成后，runner 还没有 tag，CI job 无法匹配（表现为"等待中"）。

1. 打开 `https://gitlab.kingsungsz.com/admin/runners`
2. 找到刚注册的 runner → 点击 → **编辑**
3. **Tags** 填: `Rn1-Runner-General-New`
4. 确认 **"Run untagged jobs"** 已勾选
5. **保存**

### 2.6 配置 SSH（用于 Git 克隆）

GitLab 仓库通过 SSH (端口 2222) 克隆，runner 需要 SSH 密钥。

```bash
RUNNER_NAME="Rn1-Runner-General-New"

# 生成 SSH 密钥 + 添加 known_hosts + 配置端口
docker exec $RUNNER_NAME bash -c '
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
  echo "Host gitlab.kingsungsz.com" > ~/.ssh/config
  echo "  Port 2222" >> ~/.ssh/config
  chmod 600 ~/.ssh/config ~/.ssh/id_ed25519
  ssh-keyscan -p 2222 gitlab.kingsungsz.com > ~/.ssh/known_hosts 2>/dev/null
  echo "=== 公钥（添加到 GitLab）==="
  cat ~/.ssh/id_ed25519.pub
'

# 复制给 gitlab-runner 用户（job 以此用户执行）
docker exec $RUNNER_NAME bash -c '
  cp -r /root/.ssh /home/gitlab-runner/.ssh
  chown -R gitlab-runner:gitlab-runner /home/gitlab-runner/.ssh
  chmod 700 /home/gitlab-runner/.ssh
  chmod 600 /home/gitlab-runner/.ssh/id_ed25519 /home/gitlab-runner/.ssh/config
'
```

然后将输出的公钥添加到 GitLab:
- **Admin → Deploy Keys → Add** → 粘贴公钥 → 勾选对 `flux-panel-yoga` 仓库的读权限
- 或者: **个人设置 → SSH Keys → 粘贴公钥**

### 2.7 配置 Docker 权限

CI job 以 `gitlab-runner` 用户（uid 999）执行，需要 Docker 权限：

```bash
RUNNER_NAME="Rn1-Runner-General-New"

# 创建与宿主机相同 GID 的 docker 组，并把 gitlab-runner 加进去
docker exec $RUNNER_NAME bash -c "groupadd -g 988 docker 2>/dev/null; usermod -aG docker gitlab-runner"

# 确保工作目录可写
docker exec $RUNNER_NAME chown -R gitlab-runner:gitlab-runner /home/gitlab-runner
```

> GID 988 是宿主机上 docker 组的 GID（通过 `getent group docker` 查看）。
> 如果你的宿主机 docker 组 GID 不同，请替换 988 为实际值。

### 2.8 验证

```bash
RUNNER_NAME="Rn1-Runner-General-New"

# 1. 配置文件存在
docker exec $RUNNER_NAME cat /etc/gitlab-runner/config.toml

# 2. Runner 在线
docker exec $RUNNER_NAME gitlab-runner verify

# 3. Docker 可用
docker exec $RUNNER_NAME docker compose version
docker exec $RUNNER_NAME su -s /bin/bash gitlab-runner -c "docker ps"

# 4. SSH 可达
docker exec $RUNNER_NAME su -s /bin/bash gitlab-runner -c "ssh -T -p 2222 git@gitlab.kingsungsz.com"
```

---

## 三、重建 Runner 容器（不丢配置）

因为使用了宿主机目录绑定 `/srv/$RUNNER_NAME`，重建不会丢失 config.toml 和 SSH 密钥。

```bash
RUNNER_NAME="Rn1-Runner-General-New"

# 停止并删除旧容器
docker stop $RUNNER_NAME && docker rm $RUNNER_NAME

# 用完全相同的参数重建（见 2.3 的 docker run 命令）
docker run -d \
  --name $RUNNER_NAME \
  --restart unless-stopped \
  -v /srv/$RUNNER_NAME:/etc/gitlab-runner \
  -v /srv/$RUNNER_NAME/ssh:/root/.ssh \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /usr/bin/docker:/usr/bin/docker:ro \
  -v /usr/libexec/docker/cli-plugins:/usr/libexec/docker/cli-plugins:ro \
  -v /opt/1panel/apps/local/flux-panel:/opt/1panel/apps/local/flux-panel \
  -v /home/gitlab-runner:/home/gitlab-runner \
  gitlab/gitlab-runner:latest

# 重建后需要重新执行的（每次重建都要）:
docker exec $RUNNER_NAME bash -c "groupadd -g 988 docker 2>/dev/null; usermod -aG docker gitlab-runner"
docker exec $RUNNER_NAME chown -R gitlab-runner:gitlab-runner /home/gitlab-runner
docker exec $RUNNER_NAME bash -c '
  cp -r /root/.ssh /home/gitlab-runner/.ssh 2>/dev/null
  chown -R gitlab-runner:gitlab-runner /home/gitlab-runner/.ssh
'

# 验证
docker exec $RUNNER_NAME gitlab-runner verify
```

> **为什么 groupadd/usermod 每次重建都要？**
> 因为这些改动存在于容器的可写层（不在 volume 里），容器删除后就没了。
> config.toml 和 SSH 密钥在 `/srv/$RUNNER_NAME` 宿主机目录里，不受影响。

---

## 四、常见故障排查

| 症状 | 原因 | 修复 |
|---|---|---|
| CI job "等待中"不执行 | Runner 离线或 tag 不匹配 | 检查 GitLab UI 里 runner 状态和 tag |
| `Host key verification failed` | 容器内缺少 GitLab SSH host key | `ssh-keyscan -p 2222 gitlab.kingsungsz.com >> ~/.ssh/known_hosts` |
| `Permission denied (publickey)` | SSH 私钥缺失或公钥未添加到 GitLab | 重新生成密钥并添加 Deploy Key |
| `mkdir: cannot create directory '/home/gitlab-runner/builds': Permission denied` | gitlab-runner 用户无工作目录写权限 | `chown -R gitlab-runner:gitlab-runner /home/gitlab-runner` |
| `permission denied ... docker.sock` | gitlab-runner 不在 docker 组 | `groupadd -g 988 docker; usermod -aG docker gitlab-runner` |
| `docker compose: command not found` | 未挂载 compose 插件 | 重建容器时加 `-v /usr/libexec/docker/cli-plugins:/usr/libexec/docker/cli-plugins:ro` |
| `config.toml: No such file` | 注册失败或匿名卷丢失 | 重新注册（见 2.4）；以后务必用宿主机目录绑定 |
| Docker Hub 拉取限速 | 匿名拉取 100次/6h | 在 GitLab CI/CD Variables 配 `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` (PAT) |

---

## 五、GitLab CI 中的 Runner Tag 对应关系

`.gitlab-ci.yml` 中的 tag 配置：

| CI Job | Runner Tag | 运行在 |
|---|---|---|
| `build:dev` | `Rn1-Runner-General-New` | RN1 DEV 服务器 |
| `build:prod` | `Rn1-Runner-General-New` | RN1 DEV 服务器 |
| `deploy:dev` | `Rn1-Runner-General-New` | RN1 DEV 服务器 |
| `deploy:prod` | `Rn2-US-Runner-Gereral` | RN2 PROD 服务器 |

> 如果要改 tag 名称，需要同时改 `.gitlab-ci.yml` 中的 `tags:` 和 GitLab UI 中 runner 的 Tags 配置。
