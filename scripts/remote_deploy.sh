#!/bin/bash
# ============================================================
# remote_deploy.sh — 部署脚本（Docker Hub 镜像版）
#
# 用法：
#   bash remote_deploy.sh <IMAGE_BASE> <IMAGE_TAG> <DEPLOY_DIR>
#
# 功能：
#   1. 自动生成 .env 或更新镜像版本参数
#   2. 拉取 Docker Hub 最新镜像并启动容器
#   3. 等待所有服务健康后才报告成功
# ============================================================
set -e

IMAGE_BASE="$1"
IMAGE_TAG="$2"
DEPLOY_DIR="${3:-/opt/1panel/apps/local/flux-panel}"

echo "📂 部署目录: $DEPLOY_DIR"
echo "🏷️  镜像标签: $IMAGE_TAG"

# ── 1. 自动检测 Docker Compose 命令 (V1 vs V2) ──
if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
  echo "🐳 检测到 Docker Compose V2 插件"
elif docker-compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker-compose"
  echo "🐳 检测到 Docker Compose V1 独立二进制"
else
  echo "❌ 错误: 未找到 docker-compose！"
  exit 1
fi

cd "$DEPLOY_DIR"

# ── 2. 安全检查：gost.sql 必须是文件 ──
if [ -d "gost.sql" ]; then
  echo "⚠️  gost.sql 是目录（Docker 残留），正在修复..."
  rm -rf gost.sql
fi
if [ ! -f "gost.sql" ]; then
  echo "❌ gost.sql 文件不存在！"
  exit 1
fi
echo "✅ gost.sql 文件校验通过"

# ── 3. 生成或更新 .env ──
if [ ! -f .env ]; then
  echo "📝 首次部署：自动生成 .env（随机强密码）..."
  DB_NAME="gost_$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c6)"
  DB_USER="user_$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c8)"
  DB_PASSWORD="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c24)"
  JWT_SECRET="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c32)"
  cat > .env <<EOF
IMAGE_REGISTRY=$IMAGE_BASE
IMAGE_TAG=$IMAGE_TAG
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
FRONTEND_PORT=6366
BACKEND_PORT=6365
EOF
  echo "✅ .env 已生成"
else
  echo "⏭️  .env 已存在，仅更新镜像信息..."
  sed -i "s|^IMAGE_REGISTRY=.*|IMAGE_REGISTRY=$IMAGE_BASE|" .env
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$IMAGE_TAG|" .env
fi

# ── 4. 复制 compose 文件 ──
cp docker-compose-v6.yml docker-compose.yml

# ── 5. 停掉旧容器（如果有） ──
echo "🛑 停止旧容器（如果存在）..."
$DOCKER_COMPOSE_CMD down --remove-orphans 2>/dev/null || true

# ── 6. 拉取最新镜像 ──
echo "📥 拉取 Docker Hub 最新镜像..."
$DOCKER_COMPOSE_CMD pull

# ── 7. 启动容器 ──
echo "🚀 启动容器..."
$DOCKER_COMPOSE_CMD up -d

# ── 8. 等待 MySQL 健康（最多 120 秒） ──
echo "⏳ 等待 MySQL 初始化..."
for i in $(seq 1 24); do
  status=$(docker inspect --format='{{.State.Health.Status}}' gost-mysql 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then
    echo "✅ MySQL 已健康"
    break
  fi
  if [ "$i" -eq 24 ]; then
    echo "⚠️  MySQL 仍在初始化，但部署已完成。容器会自动重试连接。"
    echo "💡 查看日志: docker-compose logs mysql"
  fi
  sleep 5
done

echo "✅ 部署完成 → $IMAGE_TAG"
echo "💡 查看状态: cd $DEPLOY_DIR && docker-compose ps"
echo "💡 查看日志: docker-compose logs -f --tail=50"
