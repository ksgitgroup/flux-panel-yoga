#!/bin/bash

# =================================================================
# Flux Panel 本地 Docker 构建工具
# =================================================================

set -e

TAG=${1:-local}
REGISTRY=${2:-flux-panel}

echo "开始本地 Docker 构建任务 (Tag: $TAG)..."

# 1. 构建后端镜像
echo "---------------------------------------------------"
echo "正在构建后端镜像: $REGISTRY/springboot-backend:$TAG"
echo "---------------------------------------------------"
docker build -t "$REGISTRY/springboot-backend:$TAG" ./springboot-backend

# 2. 构建前端镜像
echo "---------------------------------------------------"
echo "正在构建前端镜像: $REGISTRY/vite-frontend:$TAG"
echo "---------------------------------------------------"
docker build -t "$REGISTRY/vite-frontend:$TAG" ./vite-frontend

echo "================================================================="
echo "构建成功！"
docker images | grep "$REGISTRY"
echo "================================================================="
echo "提示: 您可以使用以下命令启动容器 (需先配置 .env):"
echo "docker-compose -f docker-compose-v4.yml up -d"
