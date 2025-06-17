#!/bin/bash
set -e

# 解决 macOS 下 tr 可能出现的非法字节序列问题
export LANG=en_US.UTF-8
export LC_ALL=C

# 检查 docker-compose 或 docker compose 命令
if command -v docker-compose &> /dev/null; then
  DOCKER_CMD="docker-compose"
elif command -v docker &> /dev/null; then
  if docker compose version &> /dev/null; then
    DOCKER_CMD="docker compose"
  else
    echo "错误：检测到 docker，但不支持 'docker compose' 命令。请安装 docker-compose 或更新 docker 版本。"
    exit 1
  fi
else
  echo "错误：未检测到 docker 或 docker-compose 命令。请先安装 Docker。"
  exit 1
fi

echo "检测到 Docker 命令：$DOCKER_CMD"

echo "🔽 下载必要文件..."
curl -L -o docker-compose.yml https://github.com/bqlpfy/forward-panel/raw/refs/heads/main/docker-compose.yml
curl -L -o gost.sql https://github.com/bqlpfy/forward-panel/raw/refs/heads/main/gost.sql
echo "✅ 下载完成"

generate_random() {
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c16
}

read -p "数据库名（留空则随机）: " DB_NAME
DB_NAME=${DB_NAME:-$(generate_random)}

read -p "数据库账号（留空则随机）: " DB_USER
DB_USER=${DB_USER:-$(generate_random)}

read -s -p "数据库密码（留空则随机）: " DB_PASSWORD
echo
DB_PASSWORD=${DB_PASSWORD:-$(generate_random)}

read -p "JWT 密钥（留空则随机）: " JWT_SECRET
JWT_SECRET=${JWT_SECRET:-$(generate_random)}

echo "服务器地址ip:port，用于节点连接服务端，不能挂 CDN，端口默认 6365"
while true; do
  read -p "服务器地址ip:port（必填）: " SERVER_HOST
  if [ -n "$SERVER_HOST" ]; then
    break
  else
    echo "服务器地址不能为空，请输入。"
  fi
done

cat > .env <<EOF
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
SERVER_HOST=$SERVER_HOST
EOF

echo "✅ .env 文件内容："
echo "DB_NAME=$DB_NAME"
echo "DB_USER=$DB_USER"
echo "DB_PASSWORD=$DB_PASSWORD"
echo "JWT_SECRET=$JWT_SECRET"
echo "SERVER_HOST=$SERVER_HOST"

echo "🚀 启动 docker 服务..."
$DOCKER_CMD up -d

echo "🎉 部署完成"
