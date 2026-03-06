#!/bin/bash

# =================================================================
# Flux Panel 本地开发环境搭建脚本 (macOS / Apple Silicon 友好)
# =================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ "$(uname -s)" != "Darwin" ]; then
    echo "错误: scripts/setup_dev_macos.sh 仅适用于 macOS。"
    exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
    echo "错误: 未检测到 Homebrew，请先安装 Homebrew 后再运行此脚本。"
    echo '安装命令: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    exit 1
fi

export HOMEBREW_NO_AUTO_UPDATE="${HOMEBREW_NO_AUTO_UPDATE:-1}"
export HOMEBREW_NO_ENV_HINTS="${HOMEBREW_NO_ENV_HINTS:-1}"

install_formula() {
    local formula="$1"
    if brew list "$formula" >/dev/null 2>&1; then
        echo "已安装: $formula"
    else
        echo "正在安装: $formula"
        brew install "$formula"
    fi
}

upsert_env() {
    local key="$1"
    local value="$2"

    if grep -q "^${key}=" .env 2>/dev/null; then
        perl -0pi -e "s/^${key}=.*/${key}=${value}/m" .env
    else
        printf '%s=%s\n' "$key" "$value" >> .env
    fi
}

echo "开始配置 Flux Panel 本地开发环境 (macOS)..."

install_formula openjdk@21
install_formula maven
install_formula node@20
install_formula docker
install_formula docker-compose
install_formula colima

JAVA_PREFIX="$(brew --prefix openjdk@21)"
NODE_PREFIX="$(brew --prefix node@20)"
export JAVA_HOME="$JAVA_PREFIX/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$NODE_PREFIX/bin:$PATH"

if [ ! -f ".env" ]; then
    echo "创建 .env 配置文件 (Local D / A 环境)..."
    cp .env.example .env
fi

echo "正在同步本地 .env 为 macOS 测试配置..."
upsert_env IMAGE_REGISTRY flux-panel
upsert_env IMAGE_TAG local
upsert_env DB_NAME gost
upsert_env DB_USER gost
upsert_env DB_PASSWORD gost_password_123
upsert_env JWT_SECRET local_dev_secret_key_6365
upsert_env BACKEND_PORT 6365
upsert_env FRONTEND_PORT 8080

if command -v colima >/dev/null 2>&1; then
    if ! colima status >/dev/null 2>&1; then
        echo "正在启动 Colima (Docker 运行时)..."
        colima start --cpu 4 --memory 8 --disk 60
    else
        echo "Colima 已运行。"
    fi
fi

echo "================================================================="
echo "macOS 环境准备完成。"
echo "Java Home: $JAVA_HOME"
echo "Node 20 Bin: $NODE_PREFIX/bin"
echo "Maven: $(command -v mvn)"
echo "Docker: $(command -v docker || echo '未找到 docker，请检查 brew 安装结果')"
echo "================================================================="
echo "当前 shell 若仍识别不到 java / node 20，请执行："
echo "export JAVA_HOME=\"$JAVA_HOME\""
echo "export PATH=\"$JAVA_HOME/bin:$NODE_PREFIX/bin:\$PATH\""
echo
echo "下一步建议："
echo "1. ./scripts/verify_build.sh"
echo "2. ./scripts/build_docker.sh"
echo "3. docker-compose -f docker-compose-v4.local.yml up -d"
