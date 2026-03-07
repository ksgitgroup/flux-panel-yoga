#!/bin/bash

# =================================================================
# Flux Panel 一键验证、提交并推送到 dev
# 用法: ./scripts/ship_dev.sh "feat: your commit message"
# =================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

cleanup_on_exit() {
    bash ./scripts/cleanup_local_artifacts.sh post-ship || true
}

trap cleanup_on_exit EXIT

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "dev" ]; then
    echo "错误: 当前分支是 $CURRENT_BRANCH，ship_dev 仅允许在 dev 分支执行。"
    exit 1
fi

echo "🚀 开始执行验证、提交与推送流程..."

if [ -f "./scripts/verify_build.sh" ]; then
    echo "🔍 正在执行构建校验..."
    bash ./scripts/verify_build.sh
else
    echo "错误: 未找到 ./scripts/verify_build.sh"
    exit 1
fi

echo "📦 正在收集变更..."
git add -A

if git diff --cached --quiet; then
    echo "ℹ️ 没有新的已跟踪或未跟踪变更需要提交。"
else
    COMMIT_MESSAGE="${1:-}"
    if [ -z "$COMMIT_MESSAGE" ]; then
        echo "错误: 发现未提交变更，但没有提供提交说明。"
        echo "用法: ./scripts/ship_dev.sh \"feat: your commit message\""
        exit 1
    fi

    echo "📝 本次提交摘要："
    git diff --cached --stat
    echo "---------------------------------------------------------------"
    git commit --no-gpg-sign -m "$COMMIT_MESSAGE"
fi

if [ -f "./scripts/build_docker.sh" ] && [ -f "./scripts/reload_local_stack.sh" ]; then
    echo "🐳 正在按最新提交重建并重载本地容器..."
    bash ./scripts/build_docker.sh
    bash ./scripts/reload_local_stack.sh
fi

echo "📤 正在推送到 origin/dev ..."
git push origin HEAD:dev

echo "================================================================="
echo "🎉 dev 同步完成。"
echo "================================================================="
