# DingTalk Env Deployment

## Goal

将 B / C 环境的 DingTalk 基础配置从数据库迁移到 `.env` / 容器环境变量，避免在 `vite_config` 中明文存储 `client_secret`。

当前运行规则：

- 环境变量优先
- 数据库作为兼容回退
- 如果某个键已由环境变量接管，后台配置接口会拒绝改写该键

## Variables

后端支持以下环境变量：

```env
IAM_AUTH_MODE=hybrid
IAM_LOCAL_ADMIN_ENABLED=true
DINGTALK_OAUTH_ENABLED=true
DINGTALK_CLIENT_ID=
DINGTALK_CLIENT_SECRET=
DINGTALK_CORP_ID=
DINGTALK_REDIRECT_URI=
DINGTALK_ALLOWED_ORG_IDS=[]
DINGTALK_REQUIRED_EMAIL_DOMAIN=
```

说明：

- `IAM_AUTH_MODE`
  - 推荐 `hybrid`
  - 保留本地超级管理员入口，便于灰度与应急
- `IAM_LOCAL_ADMIN_ENABLED`
  - 推荐 `true`
- `DINGTALK_OAUTH_ENABLED`
  - 联调或上线时设为 `true`
- `DINGTALK_REDIRECT_URI`
  - 必须是前端回调页面，例如 `https://dev.example.com/login/dingtalk/callback`
- `DINGTALK_ALLOWED_ORG_IDS`
  - 当前版本可先填 `[]`
  - 字段已支持环境变量接入，但登录逻辑暂未用它做强校验

## Environment B

建议准备一个单独的开发 DingTalk 应用，不要和生产共用。

### 1. 编辑 `.env`

示例：

```env
IMAGE_REGISTRY=registry.gitlab.kingsungsz.com/yoga/flux-panel-yoga
IMAGE_TAG=dev-latest
DB_NAME=gost
DB_USER=gost
DB_PASSWORD=CHANGE_ME
JWT_SECRET=CHANGE_ME_RANDOM_JWT_SECRET
BACKEND_PORT=6365
FRONTEND_PORT=8080

IAM_AUTH_MODE=hybrid
IAM_LOCAL_ADMIN_ENABLED=true
DINGTALK_OAUTH_ENABLED=true
DINGTALK_CLIENT_ID=dev_client_id
DINGTALK_CLIENT_SECRET=dev_client_secret
DINGTALK_CORP_ID=ding_dev_corp_id
DINGTALK_REDIRECT_URI=https://dev.example.com/login/dingtalk/callback
DINGTALK_ALLOWED_ORG_IDS=[]
DINGTALK_REQUIRED_EMAIL_DOMAIN=your-company.com
```

### 2. 重启容器

如果 B 使用 `docker-compose-v4.yml`：

```bash
docker compose -f docker-compose-v4.yml down
docker compose -f docker-compose-v4.yml up -d
```

如果 B 使用远端脚本部署，更新 `.env` 后重新执行部署脚本即可。

### 3. 验证环境变量已进入后端

```bash
docker exec springboot-backend env | grep -E 'IAM_|DINGTALK_'
```

### 4. 验证登录入口

打开登录页，应同时看到：

- 管理员登录
- 使用钉钉登录

### 5. 验证 IAM 试点账号

先确保 `sys_user` 已存在，且：

- `auth_source = dingtalk`
- `enabled = 1`
- `org_active = 1`
- 已分配角色

### 6. 验证登录链路

至少验证：

- 本地管理员登录仍正常
- DingTalk 登录成功
- `DEVELOPER` 只能读
- `DEV_ADMIN` 可写
- `HR` 只见组织类页面
- `sys_session` 有新会话
- `sys_login_audit` 有成功/失败记录

## Environment C

建议使用独立的生产 DingTalk 应用。

### 1. 生产 `.env`

示例：

```env
IMAGE_REGISTRY=registry.gitlab.kingsungsz.com/yoga/flux-panel-yoga
IMAGE_TAG=latest
DB_NAME=gost
DB_USER=gost
DB_PASSWORD=CHANGE_ME
JWT_SECRET=CHANGE_ME_RANDOM_JWT_SECRET
BACKEND_PORT=6365
FRONTEND_PORT=8080

IAM_AUTH_MODE=hybrid
IAM_LOCAL_ADMIN_ENABLED=true
DINGTALK_OAUTH_ENABLED=true
DINGTALK_CLIENT_ID=prod_client_id
DINGTALK_CLIENT_SECRET=prod_client_secret
DINGTALK_CORP_ID=ding_prod_corp_id
DINGTALK_REDIRECT_URI=https://panel.example.com/login/dingtalk/callback
DINGTALK_ALLOWED_ORG_IDS=[]
DINGTALK_REQUIRED_EMAIL_DOMAIN=your-company.com
```

### 2. 灰度上线建议

- 先发后端和前端
- 保持 `IAM_AUTH_MODE=hybrid`
- 保持 `IAM_LOCAL_ADMIN_ENABLED=true`
- 先只给试点账号启用 DingTalk 登录
- 观察登录审计和会话表现后，再扩大范围

### 3. 清理数据库旧明文

确认环境变量生效后，再清理库里的 DingTalk 明文：

```sql
UPDATE vite_config
SET value = ''
WHERE name IN (
  'dingtalk_client_id',
  'dingtalk_client_secret',
  'dingtalk_corp_id',
  'dingtalk_redirect_uri',
  'dingtalk_allowed_org_ids',
  'dingtalk_required_email_domain'
);
```

保留以下非敏感项在数据库中无妨，但也可继续由环境变量统一接管：

- `iam_auth_mode`
- `iam_local_admin_enabled`
- `dingtalk_oauth_enabled`

## Verification Commands

查看 IAM / DingTalk 相关配置是否生效：

```bash
docker exec springboot-backend env | grep -E 'IAM_|DINGTALK_'
```

查看登录页入口配置返回：

```bash
curl -sS -X POST http://localhost:6365/api/v1/iam/auth/options
```

查看数据库里是否还留有旧值：

```bash
docker exec gost-mysql mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
select name, value from vite_config
where name in (
  'iam_auth_mode',
  'iam_local_admin_enabled',
  'dingtalk_oauth_enabled',
  'dingtalk_client_id',
  'dingtalk_client_secret',
  'dingtalk_corp_id',
  'dingtalk_redirect_uri',
  'dingtalk_allowed_org_ids',
  'dingtalk_required_email_domain'
);"
```

## Current Limitation

当前版本已经支持：

- DingTalk SSO
- Flux 侧角色/权限校验
- `org_active` 手工离组封禁
- 环境变量接管 DingTalk 凭据

当前版本尚未完成：

- 使用 `DINGTALK_CORP_ID`
- 使用 `DINGTALK_ALLOWED_ORG_IDS`
- 自动组织同步 / 自动离组失效

因此生产阶段仍建议保留本地超级管理员入口作为应急通道。
