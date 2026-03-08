#!/bin/bash

# =================================================================
# Flux Panel 本地开发环境搭建脚本
# - macOS: 调用 Homebrew + Colima 初始化
# - Ubuntu: 使用 apt + Docker 初始化
# =================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$(uname -s)" = "Darwin" ]; then
    exec "$SCRIPT_DIR/setup_dev_macos.sh" "$@"
fi

echo "开始配置 Flux Panel 本地开发环境..."

# 1. 检查操作系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    if [ "$ID" != "ubuntu" ]; then
        echo "警告: 本脚本针对 Ubuntu 优化，检测到操作系统为 $ID，部分命令可能失败。"
    fi
fi

# 2. 更新系统包列表
echo "正在更新系统包列表..."
sudo apt-get update

# 3. 安装 Java 21 (JDK)
echo "正在安装 OpenJDK 21..."
sudo apt-get install -y openjdk-21-jdk
java -version

# 4. 安装 Maven
echo "正在安装 Maven 3.9.x..."
sudo apt-get install -y maven
mvn -version

# 5. 安装 Node.js 20 (LTS)
echo "正在安装 Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v

# 6. 安装 Docker
if ! command -v docker &> /dev/null; then
    echo "正在安装 Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "Docker 安装完成，请在脚本结束后重新登录以使组权限生效。"
else
    echo "Docker 已安装: $(docker -v)"
fi

# 7. 初始化环境变量
if [ ! -f ".env" ]; then
    echo "创建 .env 配置文件 (Local A 环境测试配置)..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "已从 .env.example 复制创建 .env。"
    else
        cat > .env << EOF
IMAGE_REGISTRY=flux-panel
IMAGE_TAG=local
DB_NAME=zA3EMMEJql6jomuC
DB_USER=root
DB_PASSWORD=root
JWT_SECRET=local_dev_secret_key_6365
BACKEND_PORT=6365
FRONTEND_PORT=8080
IAM_AUTH_MODE=hybrid
IAM_LOCAL_ADMIN_ENABLED=true
DINGTALK_OAUTH_ENABLED=
DINGTALK_CLIENT_ID=
DINGTALK_CLIENT_SECRET=
DINGTALK_CORP_ID=
DINGTALK_REDIRECT_URI=
DINGTALK_ALLOWED_ORG_IDS=[]
DINGTALK_REQUIRED_EMAIL_DOMAIN=
EOF
        echo "已创建默认 .env 配置文件。"
    fi
fi

echo "正在强制同步本地环境配置 (Local A)..."
# 统一替换逻辑，确保所有占位符或旧值被替换为本地开发模式
sed -i 's|IMAGE_REGISTRY=.*|IMAGE_REGISTRY=flux-panel|' .env
sed -i 's|IMAGE_TAG=.*|IMAGE_TAG=local|' .env
sed -i 's|DB_NAME=.*|DB_NAME=gost|' .env
sed -i 's|DB_USER=.*|DB_USER=gost|' .env
sed -i 's|DB_PASSWORD=.*|DB_PASSWORD=gost_password_123|' .env
sed -i 's|JWT_SECRET=.*|JWT_SECRET=local_dev_secret_key_6365|' .env

echo "================================================================="
echo "环境搭建完成！"
echo "Java: $(java -version 2>&1 | head -n 1)"
echo "Maven: $(mvn -version | head -n 1)"
echo "Node: $(node -v)"
echo "Docker: $(docker -v)"
echo "================================================================="
echo "提示: 如果您刚刚安装了 Docker，请运行 'newgrp docker' 或重新登录。"
