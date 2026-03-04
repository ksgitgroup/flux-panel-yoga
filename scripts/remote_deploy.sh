#!/bin/bash
# ============================================================
# remote_deploy.sh — Flux Panel 自动化部署脚本
#
# 用法：
#   bash remote_deploy.sh <IMAGE_BASE> <IMAGE_TAG> <DEPLOY_DIR>
#
# 功能：
#   1. 自动生成 .env（含随机数据库密码）
#   2. 拉取 Docker Hub 镜像并启动容器
#   3. 主动检测并导入数据库（不依赖 Docker 的 initdb 机制）
# ============================================================
set -e

IMAGE_BASE="$1"
IMAGE_TAG="$2"
DEPLOY_DIR="${3:-/opt/1panel/apps/local/flux-panel}"

echo "📂 部署目录: $DEPLOY_DIR"
echo "🏷️  镜像标签: $IMAGE_TAG"

# ── 1. 自动检测 Docker Compose 命令 ──
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif docker-compose version >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "❌ 未找到 docker-compose！"
  exit 1
fi
echo "🐳 使用: $DC"

cd "$DEPLOY_DIR"

# ── 2. 安全检查：gost.sql 必须是文件 ──
[ -d "gost.sql" ] && rm -rf gost.sql
if [ ! -f "gost.sql" ]; then
  echo "❌ gost.sql 文件不存在！"
  exit 1
fi

# ── 3. 生成或更新 .env ──
if [ ! -f .env ]; then
  echo "📝 首次部署：生成 .env ..."
  cat > .env <<EOF
IMAGE_REGISTRY=$IMAGE_BASE
IMAGE_TAG=$IMAGE_TAG
DB_NAME=gost_$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c6)
DB_USER=user_$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c8)
DB_PASSWORD=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c24)
JWT_SECRET=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c32)
FRONTEND_PORT=6366
BACKEND_PORT=6365
EOF
  echo "✅ .env 已生成"
else
  echo "⏭️  .env 已存在，仅更新镜像标签..."
  sed -i "s|^IMAGE_REGISTRY=.*|IMAGE_REGISTRY=$IMAGE_BASE|" .env
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$IMAGE_TAG|" .env
fi

# 读取 .env 中的数据库变量，后面导入 SQL 时需要
source .env

# ── 4. 复制 compose 文件 ──
cp docker-compose-v6.yml docker-compose.yml

# ── 5. 停旧容器、拉新镜像、启动 ──
echo "🛑 停止旧容器..."
$DC down --remove-orphans 2>/dev/null || true

echo "📥 拉取最新镜像..."
$DC pull

echo "🚀 启动容器..."
$DC up -d

# ── 6. 等待 MySQL 健康 ──
echo "⏳ 等待 MySQL 启动..."
for i in $(seq 1 30); do
  status=$(docker inspect --format='{{.State.Health.Status}}' gost-mysql 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then
    echo "✅ MySQL 已健康"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "❌ MySQL 启动超时！"
    echo "📋 MySQL 日志："
    docker logs --tail=30 gost-mysql
    exit 1
  fi
  sleep 5
done

# ── 7. 关键步骤：主动检测并导入数据库表 ──
# Docker 的 initdb 机制极其脆弱（数据目录非空就跳过），
# 所以我们在这里直接检测表是否存在，如果不存在就手动导入。
echo "🔍 检查数据库表是否已初始化..."
TABLE_COUNT=$(docker exec gost-mysql mysql -uroot -p"$DB_PASSWORD" -N -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME';" 2>/dev/null || echo "0")

if [ "$TABLE_COUNT" -lt 5 ]; then
  echo "📦 数据库表不完整（当前 $TABLE_COUNT 张），正在导入 gost.sql ..."
  docker exec -i gost-mysql mysql -uroot -p"$DB_PASSWORD" "$DB_NAME" < gost.sql
  echo "✅ 数据库导入完成！"

  # 导入后授予用户权限（因为 gost.sql 里建的表归 root，需要授权给 DB_USER）
  docker exec gost-mysql mysql -uroot -p"$DB_PASSWORD" -e \
    "GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'%'; FLUSH PRIVILEGES;" 2>/dev/null
  echo "✅ 用户权限已授予"
else
  echo "✅ 数据库已有 $TABLE_COUNT 张表，无需重复导入"
fi

echo ""
echo "🎉 部署完成！"
echo "   前端: http://$(hostname -I | awk '{print $1}'):${FRONTEND_PORT}"
echo "   后端: http://$(hostname -I | awk '{print $1}'):${BACKEND_PORT}"
echo "   phpMyAdmin: http://$(hostname -I | awk '{print $1}'):8066"
echo "   默认账号: admin_user"
