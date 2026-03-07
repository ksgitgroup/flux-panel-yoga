#!/bin/bash

# =================================================================
# Flux Panel 本地容器重载脚本
# 作用：让最新构建出的 local 镜像真正替换正在运行的本地容器
# =================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

cleanup_on_exit() {
    bash ./scripts/cleanup_local_artifacts.sh post-reload || true
}

trap cleanup_on_exit EXIT

if docker compose version >/dev/null 2>&1; then
    DC="docker compose"
elif docker-compose version >/dev/null 2>&1; then
    DC="docker-compose"
else
    echo "❌ 未找到 docker compose / docker-compose"
    exit 1
fi

echo "🔄 正在使用最新 local 镜像重建本地容器..."
COMPOSE_PROJECT_NAME=flux-panel-yoga-local $DC -f docker-compose-v4.local.yml up -d --force-recreate
echo "✅ 本地容器已切换到最新镜像。"
