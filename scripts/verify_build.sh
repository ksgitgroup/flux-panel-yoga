#!/bin/bash

# =================================================================
# Flux Panel 构建与健康检查脚本
# =================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOW_SPACE_MB="${LOW_SPACE_MB:-6144}"
CRITICAL_SPACE_MB="${CRITICAL_SPACE_MB:-3072}"
MIN_REQUIRED_SPACE_MB="${MIN_REQUIRED_SPACE_MB:-2048}"

read_free_mb() {
    df -Pm "$ROOT_DIR" | awk 'NR==2 {print $4}'
}

ensure_local_free_space() {
    local phase="$1"
    local free_mb
    free_mb="$(read_free_mb)"
    echo "💽 ${phase}前可用空间: ${free_mb}MB"

    if [ "$free_mb" -lt "$LOW_SPACE_MB" ]; then
        echo "⚠️ 可用空间低于 ${LOW_SPACE_MB}MB，先执行预清理..."
        bash "$ROOT_DIR/scripts/cleanup_local_artifacts.sh" pre-build || true
        free_mb="$(read_free_mb)"
        echo "💽 预清理后可用空间: ${free_mb}MB"
    fi

    if [ "$free_mb" -lt "$CRITICAL_SPACE_MB" ]; then
        echo "⚠️ 可用空间仍低于 ${CRITICAL_SPACE_MB}MB，执行深度清理..."
        bash "$ROOT_DIR/scripts/cleanup_local_artifacts.sh" deep-host || true
        free_mb="$(read_free_mb)"
        echo "💽 深度清理后可用空间: ${free_mb}MB"
    fi

    if [ "$free_mb" -lt "$MIN_REQUIRED_SPACE_MB" ]; then
        echo "❌ 可用空间仅剩 ${free_mb}MB，低于安全构建阈值 ${MIN_REQUIRED_SPACE_MB}MB。请先清理宿主机后再执行。"
        exit 1
    fi
}

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

read_release_version() {
    awk -F'"' '/"version"/ {print $4; exit}' vite-frontend/package.json
}

read_backend_version() {
    grep -m1 '<version>' springboot-backend/pom.xml | sed -E 's/.*<version>([^<]+)<\/version>.*/\1/'
}

read_config_version() {
    sed -n 's/^  version: //p' springboot-backend/src/main/resources/application.yml | head -n 1
}

echo "🚀 开始后端自动化构建校验..."
ensure_local_free_space "构建校验"

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

RELEASE_VERSION="$(read_release_version)"
BACKEND_VERSION="$(read_backend_version)"
CONFIG_VERSION="$(read_config_version)"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo local)"
CURRENT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo local)"

if [ "$RELEASE_VERSION" != "$BACKEND_VERSION" ] || [ "$RELEASE_VERSION" != "$CONFIG_VERSION" ]; then
    echo "❌ 错误: 版本号未同步。"
    echo "   - vite-frontend/package.json: $RELEASE_VERSION"
    echo "   - springboot-backend/pom.xml: $BACKEND_VERSION"
    echo "   - springboot-backend/src/main/resources/application.yml: $CONFIG_VERSION"
    exit 1
fi

export VITE_APP_VERSION="$RELEASE_VERSION"
export VITE_GIT_SHA="$CURRENT_SHA"
export VITE_GIT_BRANCH="$CURRENT_BRANCH"
export VITE_BUILD_TIME="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

echo "🏷️ 发布版本: v$RELEASE_VERSION"
echo "🧬 构建标识: ${CURRENT_BRANCH}.${CURRENT_SHA}"

if command -v ruby >/dev/null 2>&1; then
    echo "🧾 正在校验 CI YAML 语法..."
    ruby -e 'require "yaml"; YAML.load_file(".gitlab-ci.yml"); Dir.glob(".github/workflows/*.yml").each { |file| YAML.load_file(file) }; puts "✅ CI YAML 语法校验通过"' || {
        echo "❌ CI YAML 语法校验失败。"
        exit 1
    }
fi

# 2. 运行 Maven 编译
echo "📦 正在执行 mvn package..."
cd springboot-backend
ensure_local_free_space "后端编译"
if mvn clean package -DskipTests; then
    echo "✅ 后端项目构建成功！"
else
    echo "❌ 后端项目构建失败，请检查代码逻辑。"
    exit 1
fi
cd ..

# 3. 运行前端构建
echo "📦 正在执行前端构建..."
cd vite-frontend
if [ -d "node_modules" ]; then
    echo "✅ Node 依赖项已存在。"
else
    echo "⏳ 正在安装前端依赖..."
    npm install --legacy-peer-deps --quiet
fi
ensure_local_free_space "前端构建"
if NODE_OPTIONS="--max-old-space-size=4096" npm run build; then
    echo "✅ 前端项目构建成功！"
else
    echo "❌ 前端项目构建失败，请检查页面逻辑。"
    exit 1
fi
echo "✨ 前端环境校验完成。"
cd ..

echo "================================================================="
echo "🎉 所有构建校验已通过！当前流程已确保本地构建成功后才允许推送。"
echo "================================================================="
