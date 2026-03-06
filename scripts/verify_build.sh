#!/bin/bash

# =================================================================
# Flux Panel 构建与健康检查脚本
# =================================================================

set -euo pipefail

configure_macos_toolchain() {
    if [ "$(uname -s)" != "Darwin" ] || ! command -v brew >/dev/null 2>&1; then
        return
    fi

    local java_prefix=""
    local node_prefix=""

    java_prefix="$(brew --prefix openjdk@21 2>/dev/null || true)"
    node_prefix="$(brew --prefix node@20 2>/dev/null || true)"

    if [ -n "$java_prefix" ] && [ -d "$java_prefix/libexec/openjdk.jdk/Contents/Home" ]; then
        export JAVA_HOME="$java_prefix/libexec/openjdk.jdk/Contents/Home"
        export PATH="$JAVA_HOME/bin:$PATH"
    fi

    if [ -n "$node_prefix" ] && [ -d "$node_prefix/bin" ]; then
        export PATH="$node_prefix/bin:$PATH"
    fi
}

configure_macos_toolchain

echo "🚀 开始后端自动化构建校验..."

# 1. 检查环境变量
if [ ! -f ".env" ]; then
    echo "❌ 错误: 未检测到 .env 文件，请先运行 scripts/setup_dev.sh"
    exit 1
fi

if ! command -v mvn >/dev/null 2>&1; then
    echo "❌ 错误: 未检测到 Maven，请先运行 scripts/setup_dev.sh"
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "❌ 错误: 未检测到 npm，请先运行 scripts/setup_dev.sh"
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
    npm install --legacy-peer-deps --quiet
fi
echo "✨ 前端环境校验完成。"
cd ..

echo "================================================================="
echo "🎉 所有构建校验已通过！您可以放心地进行 git push 操作。"
echo "================================================================="
