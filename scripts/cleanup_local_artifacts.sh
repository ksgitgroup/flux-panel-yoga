#!/bin/bash

# =================================================================
# Flux Panel 本地清理脚本
# 作用：回收构建残留、npm 缓存和 Docker 冗余镜像，降低本机磁盘压力
# 用法：
#   ./scripts/cleanup_local_artifacts.sh post-build
#   ./scripts/cleanup_local_artifacts.sh post-reload
#   ./scripts/cleanup_local_artifacts.sh post-ship
# =================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-post-build}"

echo "🧹 开始清理本地构建残留 (${MODE}) ..."

rm -rf springboot-backend/target 2>/dev/null || true
rm -rf vite-frontend/dist 2>/dev/null || true
rm -rf .cache/npm 2>/dev/null || true
find "$ROOT_DIR" -name '.DS_Store' -delete 2>/dev/null || true

if command -v docker >/dev/null 2>&1; then
  if [ "$MODE" = "post-reload" ] || [ "$MODE" = "post-ship" ]; then
    docker image prune -af >/dev/null 2>&1 || true
  else
    docker image prune -f >/dev/null 2>&1 || true
  fi
  docker builder prune -af >/dev/null 2>&1 || true
fi

echo "📦 当前项目目录占用:"
du -sh "$ROOT_DIR" 2>/dev/null || true
echo "💽 当前磁盘余量:"
df -h "$ROOT_DIR" | sed -n '2p' || true
