#!/bin/bash

# =================================================================
# Flux Panel 自动校验与全量同步脚本 (A -> B)
# =================================================================

set -e

echo "🚀 开始自动化同步流程 (Local A -> Remote B)..."

# 1. 执行本地构建校验
if [ -x "./scripts/verify_build.sh" ]; then
    echo "🔍 正在进行本地编译校验..."
    ./scripts/verify_build.sh
else
    echo "⚠️ 未找到 verify_build.sh，尝试手动执行校验..."
    cd springboot-backend && mvn clean compile -DskipTests && cd ..
fi

echo "✅ 本地校验通过！准备推送代码..."

# 2. 检查 Git 状态
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "dev" ]; then
    echo "⚠️ 当前不在 dev 分支 (当前是 $CURRENT_BRANCH)。"
    read -p "是否强制推送到远程 dev 分支？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ 同步取消。"
        exit 1
    fi
fi

# 3. 执行推送
echo "📤 正在推送到远程 gitlab.kingsungsz.com (branch: dev)..."
git push origin HEAD:dev

echo "================================================================="
echo "🎉 同步成功！远程 CI/CD 已触发。"
echo "请前往 GitLab 查看部署进度。"
echo "================================================================="
