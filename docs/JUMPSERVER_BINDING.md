# JumpServer 与 Flux 资产绑定说明

## 绑定关系概览

Flux Panel 的「服务器资产」与 JumpServer 的资产通过以下两种方式关联，用于**一键跳转到 JumpServer Web 终端**：

| 方式 | 说明 |
|------|------|
| **按 IP 隐式匹配** | Flux 资产填写了「主 IP」，点击「终端登录」时，后端用该 IP 调 JumpServer 接口 `GET /api/v1/assets/hosts/?address={ip}` 查找主机，找到则用其 ID 创建 ConnectionToken，返回 Luna 地址。 |
| **显式绑定 JumpServer 资产 ID** | 在「编辑资产」中绑定 JumpServer 主机 ID（UUID）。点击「终端登录」时优先使用该 ID 创建 ConnectionToken，不再按 IP 查询。适用于：同一 IP 对应多台 JS 主机、或 Flux 资产未填 IP 但需对应 JumpServer 某台主机。 |

**跳转流程**（无论哪种方式）：

1. 用户在生产页资产详情中点击「终端登录」。
2. 后端根据资产「绑定 ID」或「主 IP」解析出 JumpServer 资产 ID。
3. 后端调用 JumpServer `POST /api/v1/authentication/connection-token/`，传入 `asset`、`account`、`protocol`、`connect_method=web_cli`。
4. JumpServer 返回 token id，后端拼出 `{jumpserver_url}/luna/?token={tokenId}`。
5. 前端新开标签页打开该 URL，即进入 JumpServer Web 终端连接该资产。

因此：**不是「只给一个登录入口二级域名」**，而是**每次点击都会用 API 创建一次 ConnectionToken，得到指向该资产的直连 URL**。JumpServer 的「入口」在系统配置中统一填写（`jumpserver_url`），资产级绑定的是「哪一台主机」。

---

## 配置与使用

### 1. 系统配置（必做）

在 **系统工作台 → JumpServer 堡垒机** 中配置：

- **JumpServer 地址**：完整访问地址（如 `https://jump.example.com`）。
- **Access Key ID / Secret**：在 JumpServer 个人信息 → API Key 中创建。

### 2. 编辑资产中绑定

- 打开 **服务器资产 → 某资产 → 编辑**。
- 若已启用 JumpServer，会看到 **「JumpServer 堡垒机」** 区块：
  - **JumpServer 资产 ID**：可手动粘贴 JumpServer 中该主机的 UUID；留空则使用「按主 IP 匹配」。
  - **按主 IP 匹配并绑定**：点击后后端用当前资产主 IP 在 JumpServer 中查找主机，若找到则自动写入「JumpServer 资产 ID」并保存到资产（无需再点保存即可生效绑定）。
- 保存资产后，详情页「终端登录」将按上述优先级（先绑定 ID，再 IP）跳转。

### 3. 一键跳转

- 在资产详情弹窗中，若已配置 JumpServer 且该资产**有主 IP 或已绑定 JumpServer 资产 ID**，会显示 **「终端登录」** 按钮。
- 点击后新开标签页进入 JumpServer Luna，直接连接该资产（默认 SSH、root 账号，可在后续扩展协议/账号选择）。

---

## 技术细节

- **JumpServer 侧**：资产为 `assets.Host`，有 `id`（UUID）、`name`、`address`（IP/主机名）。ConnectionToken 创建接口需要 `asset`（主机 ID）、`account`、`protocol`、`connect_method`。
- **Flux 侧**：`asset_host` 表新增 `jumpserver_asset_id`（VARCHAR，可为空）。有值则 `createConnectionToken` 直接用该 ID；否则用 `primary_ip` 调 `GET /api/v1/assets/hosts/?address=...` 解析 ID 再创建 Token。
- **API**：
  - `POST /api/v1/jumpserver/connect`：传入 `assetId`（Flux 资产 ID），返回 `{ url, tokenId }`。
  - `POST /api/v1/jumpserver/hosts`：拉取 JumpServer 主机列表（可选 `search`），供下拉选择等扩展用。
  - `POST /api/v1/jumpserver/match-by-ip`：传入 `assetId`、`save`（是否写回资产），按主 IP 匹配并返回/写入 `jumpserver_asset_id`。
