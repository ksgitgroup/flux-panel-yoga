#!/bin/bash

# =================================================================
# Flux Panel 本地清理脚本
# 作用：回收构建残留、npm 缓存和 Docker 冗余镜像，降低本机磁盘压力
# 用法：
#   ./scripts/cleanup_local_artifacts.sh post-build
#   ./scripts/cleanup_local_artifacts.sh post-reload
#   ./scripts/cleanup_local_artifacts.sh post-ship
#   ./scripts/cleanup_local_artifacts.sh deep-host
# =================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-post-build}"

echo "🧹 开始清理本地构建残留 (${MODE}) ..."

print_disk_summary() {
  echo "📦 当前项目目录占用:"
  du -sh "$ROOT_DIR" 2>/dev/null || true
  echo "💽 当前磁盘余量:"
  df -h "$ROOT_DIR" | sed -n '2p' || true
}

if [ "$MODE" = "deep-host" ]; then
  echo "🔎 清理前宿主机关键目录占用:"
  du -sh "$HOME/.colima" 2>/dev/null || true
  du -sh "$HOME/Library/Caches/Homebrew" 2>/dev/null || true
  du -sh "$HOME/.npm" 2>/dev/null || true
  du -sh "$HOME/.m2" 2>/dev/null || true
  du -sh /opt/homebrew/Cellar 2>/dev/null || true
  printf '\n'
fi

rm -rf springboot-backend/target 2>/dev/null || true
rm -rf vite-frontend/dist 2>/dev/null || true
rm -rf .cache/npm 2>/dev/null || true
find "$ROOT_DIR" -name '.DS_Store' -delete 2>/dev/null || true

if command -v docker >/dev/null 2>&1; then
  if [ "$MODE" = "post-reload" ] || [ "$MODE" = "post-ship" ] || [ "$MODE" = "deep-host" ]; then
    docker image prune -af >/dev/null 2>&1 || true
  else
    docker image prune -f >/dev/null 2>&1 || true
  fi
  docker builder prune -af >/dev/null 2>&1 || true
  if [ "$MODE" = "deep-host" ]; then
    docker container prune -f >/dev/null 2>&1 || true
    docker network prune -f >/dev/null 2>&1 || true
    docker volume prune -f >/dev/null 2>&1 || true
  fi
fi

if [ "$MODE" = "deep-host" ]; then
  if command -v npm >/dev/null 2>&1; then
    npm cache clean --force >/dev/null 2>&1 || true
  fi
  rm -rf "$HOME/.npm/_cacache" 2>/dev/null || true

  if command -v brew >/dev/null 2>&1; then
    HOMEBREW_NO_AUTO_UPDATE=1 brew cleanup -s >/dev/null 2>&1 || true
  fi

  find "$HOME/.m2" -name "*.lastUpdated" -delete 2>/dev/null || true
  find "$HOME/.m2" -name "_remote.repositories" -delete 2>/dev/null || true

  echo "🧾 清理后宿主机关键目录占用:"
  du -sh "$HOME/.colima" 2>/dev/null || true
  du -sh "$HOME/Library/Caches/Homebrew" 2>/dev/null || true
  du -sh "$HOME/.npm" 2>/dev/null || true
  du -sh "$HOME/.m2" 2>/dev/null || true
  du -sh /opt/homebrew/Cellar 2>/dev/null || true
  printf '\n'
fi

print_disk_summary
