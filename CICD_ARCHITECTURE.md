# CI/CD 架构闭环设计：从开发到生产

根据您的需求，实现 **本机A (开发) -> 内部 GitLab B (主存/CI) -> GitHub (分发) -> 服务器C (生产集群)** 的完美闭环，这是一种非常经典且安全的企业级高可用架构。

在这种架构下：
- **内部 GitLab B** 承担全公司的代码把控和 CI/CD 测试打包工作，保证核心资产私有安全。
- **外部 GitHub** 作为一个无情的“全球静态文件 CDN 兼分发通道”。由于 GitHub 在全球各地的服务器上拉取速度远比公司内网机器快，所以非常适合做终端节点的分发。
- **生产服务器 C** 只认 GitHub 的代码，不和公司内网直接联通，提高了生产环境的隔离安全性。

以下是如何将这个流程彻底闭环的详细配置指南：

---

## 第一环：本机A 到 GitLab B（日常开发）

这一步没有任何变化，你在本机 A 上完成代码修改后，正常执行：
```bash
git add .
git commit -m "update features"
git push origin main
```
代码会被推送到你们内部的 `gitlab.kingsungsz.com` 仓库中。

---

## 第二环：GitLab B 自动同步代码到 GitHub（镜像推送）

你不必（也不应该）让 GitLab 的 Runner 跑一段脚本去强推 GitHub，GitLab 本身内置了一个非常强大的功能叫做 **Repository Mirroring（仓库镜像）**。

**操作步骤**：
1. **在 GitHub 准备仓库**：如果你还没建，先在 GitHub 上建一个同名的空仓库（如 `prokingyoga/yoga-panel`），设为 Public 或 Private 均可。
2. **在 GitHub 获取 Token**：前往 GitHub -> Settings -> Developer settings -> Personal access tokens (Classic) -> 生成一个拥有 `repo` 权限的新 Token 并复制。
3. **在 GitLab 配置镜像**：
   - 登录你的 GitLab `Yoga-Panel` 项目。
   - 左下角进入 **Settings (设置)** -> **Repository (仓库)**。
   - 展开 **Mirroring repositories (镜像仓库)**。
   - **Git repository URL**: 填入你要推送到哪里的 GitHub 地址，**注意格式必须带上用户名**。例如：`https://prokingyoga@github.com/prokingyoga/yoga-panel.git`
   - **Mirror direction**: 选择 `Push`（推送端）。
   - **Authentication method**: 选择 `Password`。
   - **Password**: 粘贴你刚才在 GitHub 生成的 Token。
   - 勾选 `Keep divergent refs` 和 `Only mirror protected branches`（按需）。
   - 点击 **Mirror repository** 保存。
   - *(保存后可以点击旁边的刷新按钮立刻手动触发一次测试)*。

**效果**：从此以后，你只要在 A 机器 `push` 任何代码到 GitLab，GitLab 就会在后台**自动且实时地**将这些变动推送到 GitHub 的目标仓库里！

---

## 第三环：GitLab Runner 自动打包（CI/CD）

仅仅推代码还不够，由于节点端（`go-gost`）需要二进制可执行文件，你需要配置 `.gitlab-ci.yml` 让 GitLab 在代码变动时自动帮你“编译程序”。

1. 在项目根目录新建 `.gitlab-ci.yml`。
2. 配置当 `go-gost` 目录有变动时，触发 Go 编译，并将编译出的二进制运行文件也通过 GitLab CI 推送到 GitHub 的 Release 或特定分支。

---

## 第四环：服务器 C（生产环境）从 GitHub 安装与更新

既然我们的终结点分发通道定在了 GitHub，那么我们在生产环境 C 上执行的脚本，其内部的拉取链接**必须全量指回 GitHub**。

**注意**：之前我们已经把脚本全改成了 GitLab 的地址，为了适配这个新的闭环架构，我会把当前代码库中的配置文件重新修改，把下载地址指回你新公开的 `https://raw.githubusercontent.com/prokingyoga/yoga-panel`。

**服务器 C 的使用方法**：
当 GitLab 同步完代码到 GitHub 后（通常只要几秒钟）：
1. 登录服务器 C。
2. 执行面向 GitHub 的安装或更新指令（如果 GitHub 也是私有的，需要加上 Token，如果是公有的直接跑即可）：
```bash
curl -L https://raw.githubusercontent.com/prokingyoga/yoga-panel/main/panel_install.sh -o panel_install.sh && chmod +x panel_install.sh && ./panel_install.sh
```
3. 在脚本弹出的菜单中选择 **“更新面板”**。脚本就又会去最新的 GitHub 仓库里把更新下来的 `docker-compose.yml` 等拖下来，重新编排启动 Docker。


### 🎉 整个闭环总结：
1. **开发者(你)**：写完代码只管向 GitLab 提交（`git push`）。
2. **GitLab**：收到代码后，触发内置 Mirror 机制，瞬间将源码 1:1 复制到 GitHub。
3. **生产服务器 C**：需要升级时，直接跑指向 GitHub 的一行更新脚本，通过 GitHub 高速且稳定的全球网络完成部署。
