#!/bin/bash
# ============================================================
# remote_deploy.sh — 部署脚本（由 CI/CD 通过 SSH 调用）
#
# 用法：
#   bash remote_deploy.sh <IMAGE_BASE> <IMAGE_TAG> \
#        <REGISTRY_USER> <REGISTRY_PASS> <REGISTRY> <DEPLOY_DIR>
#
# 功能：
#   1. 登录 Docker Registry
#   2. 首次运行时自动生成 .env（随机密码）
#   3. 非首次只更新 IMAGE_REGISTRY / IMAGE_TAG
#   4. docker compose pull && up
# ============================================================
set -e

IMAGE_BASE="$1"
IMAGE_TAG="$2"
REGISTRY_USER="$3"
REGISTRY_PASS="$4"
REGISTRY="$5"
DEPLOY_DIR="${6:-/opt/1panel/apps/local/flux-panel}"

echo "📂 部署目录: $DEPLOY_DIR"
echo "🏷️  镜像 Tag: $IMAGE_TAG"

cd "$DEPLOY_DIR"

# 登录 Registry
docker login -u "$REGISTRY_USER" -p "$REGISTRY_PASS" "$REGISTRY"

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
docker compose pull
docker compose up -d --remove-orphans
echo "✅ 部署完成 → $IMAGE_TAG"
