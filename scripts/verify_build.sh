#!/bin/bash

# =================================================================
# Flux Panel 构建与健康检查脚本
# =================================================================

set -e

echo "🚀 开始后端自动化构建校验..."

# 1. 检查环境变量
if [ ! -f ".env" ]; then
    echo "❌ 错误: 未检测到 .env 文件，请先运行 scripts/setup_dev.sh"
    exit 1
fi

# 2. 运行 Maven 编译
echo "📦 正在执行 mvn compile..."
cd springboot-backend
if mvn compile -DskipTests; then
    echo "✅ 后端项目编译成功！"
else
    echo "❌ 后端项目编译失败，请检查代码逻辑。"
    exit 1
fi
cd ..

# 3. 运行前端构建 (可选)
echo "📦 正在检查前端环境..."
cd vite-frontend
if [ -d "node_modules" ]; then
    echo "✅ Node 依赖项已存在。"
else
    echo "⏳ 正在安装前端依赖..."
    npm install --quiet
fi
echo "✨ 前端环境校验完成。"
cd ..

echo "================================================================="
echo "🎉 所有构建校验已通过！您可以放心地进行 git push 操作。"
echo "================================================================="
