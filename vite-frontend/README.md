# Flux Panel Yoga Frontend

这个目录不是通用 Vite 模板，而是 Flux Panel Yoga 的前端管理应用。

## 当前职责

- 登录与验证码
- 首页摘要
- 诊断看板
- 转发管理
- 隧道管理
- 节点监控
- 系统工作台
- 用户 / 协议 / 标签 / 限速管理
- 个人中心与 2FA 绑定

## 技术栈

- Vite
- React
- TypeScript
- HeroUI
- Tailwind CSS
- Recharts

## 本地开发

如果只跑前端开发服务器：

```bash
npm install --legacy-peer-deps
npm run dev
```

生产构建：

```bash
npm run build
```

## 重要说明

1. 这个前端依赖根仓库的版本与构建元数据注入
2. 站点配置来自后端 `vite_config` 和本地缓存
3. 更完整的项目说明请先看根目录：
   - [README.md](../README.md)
   - [PROJECT_ANALYSIS.md](../PROJECT_ANALYSIS.md)
   - [LOCAL_MACOS_SETUP.md](../LOCAL_MACOS_SETUP.md)
