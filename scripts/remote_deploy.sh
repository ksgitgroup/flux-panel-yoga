#!/bin/bash
# ============================================================
# remote_deploy.sh — 部署脚本（纯本地镜像版）
#
# 用法：
#   bash remote_deploy.sh <IMAGE_BASE> <IMAGE_TAG> <DEPLOY_DIR>
#
# 功能：
#   1. 自动生成 .env 或更新镜像版本参数
#   2. 直接使用本地打好的镜像启动（无需 pull）
# ============================================================
set -e

IMAGE_BASE="$1"
IMAGE_TAG="$2"
DEPLOY_DIR="${3:-/opt/1panel/apps/local/flux-panel}"

echo "📂 部署目录: $DEPLOY_DIR"
echo "🏷️  使用本地镜像 Tag: $IMAGE_BASE/...:$IMAGE_TAG"

cd "$DEPLOY_DIR"

# 自动生成 .env（仅首次）
if [ ! -f .env ]; then
  echo "📝 首次部署：自动生成 .env（随机强密码）..."
  DB_NAME="gost_$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c6)"
  DB_USER="user_$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c8)"
  DB_PASSWORD="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c24)"
  JWT_SECRET="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c32)"
  echo "IMAGE_REGISTRY=$IMAGE_BASE" > .env
  echo "IMAGE_TAG=$IMAGE_TAG" >> .env
  echo "DB_NAME=$DB_NAME" >> .env
  echo "DB_USER=$DB_USER" >> .env
  echo "DB_PASSWORD=$DB_PASSWORD" >> .env
  echo "JWT_SECRET=$JWT_SECRET" >> .env
  echo "FRONTEND_PORT=6366" >> .env
  echo "BACKEND_PORT=6365" >> .env
  echo "✅ .env 已生成（密码已随机化）"
else
  echo "⏭️  .env 已存在，仅更新镜像信息..."
  sed -i "s|^IMAGE_REGISTRY=.*|IMAGE_REGISTRY=$IMAGE_BASE|" .env
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$IMAGE_TAG|" .env
fi

cp docker-compose-v6.yml docker-compose.yml

# 剔除 docker login 和 docker compose pull，因为镜像是就在本机刚打完的
docker compose up -d --remove-orphans

echo "✅ 容器启动完成 → $IMAGE_TAG"
