#!/bin/bash

# =================================================================
# Flux Panel 本地清理脚本
# 作用：回收构建残留、npm 缓存和 Docker 冗余镜像，降低本机磁盘压力
# 用法：
#   ./scripts/cleanup_local_artifacts.sh pre-build
#   ./scripts/cleanup_local_artifacts.sh post-build
#   ./scripts/cleanup_local_artifacts.sh post-reload
#   ./scripts/cleanup_local_artifacts.sh post-ship
#   ./scripts/cleanup_local_artifacts.sh deep-host
# =================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-post-build}"
LOW_SPACE_MB="${LOW_SPACE_MB:-6144}"
CRITICAL_SPACE_MB="${CRITICAL_SPACE_MB:-3072}"

read_free_mb() {
  df -Pm "$ROOT_DIR" | awk 'NR==2 {print $4}'
}

print_disk_summary() {
  local free_mb
  free_mb="$(read_free_mb)"
  echo "📦 当前项目目录占用:"
  du -sh "$ROOT_DIR" 2>/dev/null || true
  echo "💽 当前磁盘余量:"
  df -h "$ROOT_DIR" | sed -n '2p' || true
  if [ "$free_mb" -lt "$CRITICAL_SPACE_MB" ]; then
    echo "⚠️ 当前可用空间仅 ${free_mb}MB，已低于建议阈值 ${CRITICAL_SPACE_MB}MB。"
  elif [ "$free_mb" -lt "$LOW_SPACE_MB" ]; then
    echo "⚠️ 当前可用空间 ${free_mb}MB，建议继续清理后再执行大体积构建。"
  fi
}

print_host_summary() {
  echo "🔎 宿主机关键目录占用:"
  du -sh "$HOME/.colima" 2>/dev/null || true
  du -sh "$HOME/Library/Caches/Homebrew" 2>/dev/null || true
  du -sh "$HOME/.npm" 2>/dev/null || true
  du -sh "$HOME/.m2" 2>/dev/null || true
  du -sh /opt/homebrew/Cellar 2>/dev/null || true
  printf '\n'
}

run_logged_cleanup() {
  local label="$1"
  shift
  echo "🧽 ${label}"
  "$@" || true
}

cleanup_project_artifacts() {
  run_logged_cleanup "清理后端 target" rm -rf springboot-backend/target
  run_logged_cleanup "清理前端 dist" rm -rf vite-frontend/dist
  run_logged_cleanup "清理项目 npm 缓存" rm -rf .cache/npm
  run_logged_cleanup "清理 Finder 元数据" find "$ROOT_DIR" -name '.DS_Store' -delete
}

cleanup_docker_artifacts() {
  local free_mb
  free_mb="$(read_free_mb)"
  if ! command -v docker >/dev/null 2>&1; then
    echo "ℹ️ 未检测到 Docker，跳过 Docker 清理。"
    return
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "⚠️ Docker 守护进程不可用，跳过 Docker 清理。"
    return
  fi

  echo "🐳 Docker 清理前磁盘占用:"
  docker system df || true

  case "$MODE" in
    pre-build)
      if [ "$free_mb" -lt "$CRITICAL_SPACE_MB" ]; then
        run_logged_cleanup "低空间模式：清理未使用镜像" docker image prune -af
        run_logged_cleanup "低空间模式：清理构建缓存" docker builder prune -af
        run_logged_cleanup "低空间模式：清理未使用网络" docker network prune -f
      else
        run_logged_cleanup "清理悬空镜像" docker image prune -f
        run_logged_cleanup "清理构建缓存" docker builder prune -af
      fi
      ;;
    post-build)
      run_logged_cleanup "清理悬空镜像" docker image prune -f
      run_logged_cleanup "清理构建缓存" docker builder prune -af
      ;;
    post-reload|post-ship|deep-host)
      run_logged_cleanup "清理未使用镜像" docker image prune -af
      run_logged_cleanup "清理构建缓存" docker builder prune -af
      ;;
  esac

  if [ "$MODE" = "deep-host" ]; then
    run_logged_cleanup "清理未使用容器" docker container prune -f
    run_logged_cleanup "清理未使用网络" docker network prune -f
    run_logged_cleanup "清理未使用卷" docker volume prune -f
  fi

  echo "🐳 Docker 清理后磁盘占用:"
  docker system df || true
}

cleanup_host_caches() {
  if command -v npm >/dev/null 2>&1; then
    run_logged_cleanup "清理 npm 全局缓存" npm cache clean --force
  fi
  run_logged_cleanup "清理 npm _cacache" rm -rf "$HOME/.npm/_cacache"

  if command -v brew >/dev/null 2>&1; then
    run_logged_cleanup "清理 Homebrew 历史缓存" env HOMEBREW_NO_AUTO_UPDATE=1 brew cleanup -s
  fi

  run_logged_cleanup "清理 Maven lastUpdated" find "$HOME/.m2" -name "*.lastUpdated" -delete
  run_logged_cleanup "清理 Maven remote 索引" find "$HOME/.m2" -name "_remote.repositories" -delete
}

echo "🧹 开始清理本地构建残留 (${MODE}) ..."
echo "💽 清理前可用空间: $(read_free_mb)MB"

if [ "$MODE" = "deep-host" ]; then
  print_host_summary
fi

cleanup_project_artifacts
cleanup_docker_artifacts

if [ "$MODE" = "deep-host" ]; then
  cleanup_host_caches
  echo "🧾 深度清理后宿主机关键目录占用:"
  print_host_summary
fi

print_disk_summary
