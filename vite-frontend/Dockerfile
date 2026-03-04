# ============================================================
# 前端 Dockerfile — 多阶段构建（Multi-stage build）
#
# 核心概念：Docker 每一行 FROM/COPY/RUN 都是一个"层（Layer）"
# 层是可以被缓存的：如果这一行和上一次构建完全一样，Docker 直接用缓存
# 一旦某一层发生变化，该层及其之后的所有层都会重新执行
# ============================================================

# ─────────────────────────────────────────────
# 阶段一：Builder（构建阶段）
# 作用：安装依赖、编译构建，产出 dist 目录
# 这个阶段的结果只用于阶段二，不会出现在最终镜像里
# ─────────────────────────────────────────────

# 层1：基础镜像（极少变化 → 几乎永远命中缓存）
# node:20.19.0 是固定版本，不会自动升级，所以这层永远是缓存命中
FROM node:20.19.0 AS builder

# 层2：设置工作目录（固定，永远缓存）
WORKDIR /app

# ★ 关键技巧：先只复制 package.json，不复制源码 ★
# 层3：只复制依赖描述文件（package.json / package-lock.json）
# 只有当 package.json 发生变化（新增/删除/升级依赖）时，这层才失效
# 纯前端代码改动不会影响这层 → 缓存命中
COPY package*.json ./

# 层4：安装依赖（只有 package.json 变了才重新安装）
# 你改了 src/pages/xxx.tsx？这层还是缓存 → npm install 不会重跑
# ★ 这就是为什么"只改前端代码"比"修改依赖"快得多 ★
#
# --legacy-peer-deps：使用宽松的对等依赖策略（npm v6 风格）
# 原因：@heroui 各组件包的版本号不完全统一，若不加此参数 npm 会拒绝安装
RUN npm install --legacy-peer-deps

# 层5：复制所有源代码（src, public, 配置文件等）
# 每次改了任何前端文件，这层都会失效 → 导致层6也失效
COPY . .

# 层6：编译构建（层5变了就会重跑）
# 只有这层和层5需要重新执行，层1-4全部复用缓存
# 这就是"只改前端代码 1-3 分钟"的原因：只有 npm run build 需要重跑
RUN npm run build

# ─────────────────────────────────────────────
# 阶段二：Production（生产阶段）
# 作用：用极小的 nginx 镜像装载编译产物，最终运行的就是这个
# 不包含 node、node_modules 等开发工具 → 镜像体积极小
# ─────────────────────────────────────────────

# 层7：更换为极小的 nginx 基础镜像（stable-alpine ≈ 25MB）
FROM nginx:stable-alpine AS production-stage

# 层8：复制 nginx 配置（配置不变，缓存命中）
COPY nginx.conf /etc/nginx/nginx.conf

# 层9：从阶段一的构建结果复制到 nginx 的静态目录
# --from=builder 表示从上面的 builder 阶段取结果
COPY --from=builder /app/dist /usr/share/nginx/html

# 声明容器对外暴露 80 端口（nginx 默认）
EXPOSE 80

# 容器启动命令：前台运行 nginx（daemon off 防止容器立即退出）
CMD ["nginx", "-g", "daemon off;"]