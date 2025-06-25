#!/bin/bash
set -e

# 解决 macOS 下 tr 可能出现的非法字节序列问题
export LANG=en_US.UTF-8
export LC_ALL=C

# 全局下载地址配置
DOCKER_COMPOSE_URL="https://ghfast.top/https://github.com/bqlpfy/forward-panel/raw/refs/heads/main/docker-compose.yml"
GOST_SQL_URL="https://ghfast.top/https://github.com/bqlpfy/forward-panel/raw/refs/heads/main/gost.sql"

# 检查 docker-compose 或 docker compose 命令
check_docker() {
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
}

# 检查Docker IPv6支持的多种方法
check_docker_ipv6_support() {
  echo "🔍 验证Docker IPv6支持..."
  
  # 方法1: 检查daemon.json配置文件
  if [ -f "/etc/docker/daemon.json" ]; then
    if grep -q '"ipv6".*true' /etc/docker/daemon.json 2>/dev/null; then
      echo "✅ daemon.json配置检查通过"
      return 0
    fi
  fi
  
  # 方法2: 尝试创建IPv6测试网络
  echo "🧪 尝试创建IPv6测试网络..."
  if docker network create --ipv6 --subnet=2001:db8:test::/64 ipv6-test-net 2>/dev/null; then
    echo "✅ IPv6网络创建成功"
    # 清理测试网络
    docker network rm ipv6-test-net >/dev/null 2>&1
    return 0
  fi
  
  # 方法3: 检查docker info的详细输出
  if docker info 2>/dev/null | grep -i ipv6 | grep -q true; then
    echo "✅ docker info IPv6检查通过"
    return 0
  fi
  
  # 方法4: 检查Docker版本和配置
  DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null)
  if [ -n "$DOCKER_VERSION" ]; then
    echo "ℹ️ Docker版本: $DOCKER_VERSION"
    # 对于新版本Docker，配置可能需要更多时间生效
    echo "⏳ 等待Docker配置生效..."
    sleep 5
    
    # 再次尝试网络创建
    if docker network create --ipv6 --subnet=2001:db8:test2::/64 ipv6-test-net2 2>/dev/null; then
      echo "✅ 延迟检查IPv6网络创建成功"
      docker network rm ipv6-test-net2 >/dev/null 2>&1
      return 0
    fi
  fi
  
  echo "⚠️ IPv6支持验证失败，但配置可能已生效"
  echo "ℹ️ 建议手动验证: docker network create --ipv6 --subnet=2001:db8:test::/64 test-net"
  return 1
}

# 检查IPv6支持
check_ipv6_support() {
  echo "🔍 检查IPv6支持..."
  
  # 检查内核是否支持IPv6
  if [ ! -f /proc/net/if_inet6 ]; then
    echo "⚠️ 警告：系统内核不支持IPv6"
    return 1
  fi
  
  # 检查Docker是否支持IPv6
  if ! check_docker_ipv6_support; then
    echo "⚠️ Docker守护进程未启用IPv6支持，正在自动配置..."
    
    # 自动配置Docker daemon.json
    configure_docker_ipv6
    
    # 重新检查
    if ! check_docker_ipv6_support; then
      echo "❌ Docker IPv6配置失败，请手动检查"
      return 1
    fi
  fi
  
  echo "✅ IPv6支持检查通过"
  return 0
}

# 配置Docker IPv6支持
configure_docker_ipv6() {
  echo "🔧 正在配置Docker IPv6支持..."
  
  DAEMON_JSON_PATH="/etc/docker/daemon.json"
  
  # 检查是否有写入权限
  if [ ! -w "/etc/docker" ] && [ ! -w "$DAEMON_JSON_PATH" ]; then
    echo "⚠️ 需要管理员权限来配置Docker"
    echo "🔐 正在请求sudo权限..."
  fi
  
  # 备份现有配置
  if [ -f "$DAEMON_JSON_PATH" ]; then
    sudo cp "$DAEMON_JSON_PATH" "$DAEMON_JSON_PATH.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || {
      echo "❌ 无法备份daemon.json文件，请检查权限"
      return 1
    }
    echo "✅ 已备份现有daemon.json配置"
  fi
  
  # 创建或更新daemon.json
  if [ -f "$DAEMON_JSON_PATH" ]; then
    # 文件存在，检查是否已配置IPv6
    if grep -q '"ipv6".*true' "$DAEMON_JSON_PATH" 2>/dev/null; then
      echo "ℹ️ daemon.json已配置IPv6支持"
    else
      echo "🔧 更新现有daemon.json配置..."
      # 尝试多种方式更新JSON
      JSON_UPDATED=false
      
      # 方法1: 使用jq
      if command -v jq &> /dev/null; then
        if sudo jq '. + {"ipv6": true, "fixed-cidr-v6": "2001:db8:1::/64"}' "$DAEMON_JSON_PATH" > /tmp/daemon.json.tmp 2>/dev/null && \
           sudo mv /tmp/daemon.json.tmp "$DAEMON_JSON_PATH" 2>/dev/null; then
          JSON_UPDATED=true
          echo "✅ 使用jq更新JSON配置"
        fi
      fi
      
      # 方法2: 使用Python3
      if [ "$JSON_UPDATED" = false ] && command -v python3 &> /dev/null; then
        if sudo python3 -c "
import json
try:
    with open('$DAEMON_JSON_PATH', 'r') as f:
        config = json.load(f)
except:
    config = {}
config['ipv6'] = True
config['fixed-cidr-v6'] = '2001:db8:1::/64'
with open('$DAEMON_JSON_PATH', 'w') as f:
    json.dump(config, f, indent=2)
print('JSON updated successfully')
" 2>/dev/null; then
          JSON_UPDATED=true
          echo "✅ 使用Python3更新JSON配置"
        fi
      fi
      
      # 方法3: 手动创建新文件（简单覆盖）
      if [ "$JSON_UPDATED" = false ]; then
        echo "⚠️ 无法解析现有JSON，将创建新的配置文件"
        read -p "这将覆盖现有的daemon.json配置，是否继续？(y/N): " confirm
        if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
          sudo tee "$DAEMON_JSON_PATH" > /dev/null <<EOF
{
  "ipv6": true,
  "fixed-cidr-v6": "2001:db8:1::/64"
}
EOF
          JSON_UPDATED=true
          echo "✅ 创建新的daemon.json配置"
        else
          echo "❌ 用户取消操作"
          return 1
        fi
      fi
      
      if [ "$JSON_UPDATED" = false ]; then
        echo "❌ 无法更新daemon.json，请手动配置"
        return 1
      fi
    fi
  else
    # 文件不存在，创建新的
    echo "🆕 创建新的daemon.json配置..."
    sudo mkdir -p /etc/docker 2>/dev/null || {
      echo "❌ 无法创建/etc/docker目录"
      return 1
    }
    sudo tee "$DAEMON_JSON_PATH" > /dev/null <<EOF
{
  "ipv6": true,
  "fixed-cidr-v6": "2001:db8:1::/64"
}
EOF
  fi
  
  echo "✅ Docker IPv6配置完成"
  echo "🔄 重启Docker服务..."
  
  # 重启Docker服务
  if command -v systemctl &> /dev/null; then
    if sudo systemctl restart docker 2>/dev/null; then
      echo "⏳ 等待Docker服务启动..."
      sleep 5
      if sudo systemctl is-active docker &> /dev/null; then
        echo "✅ Docker服务重启成功"
      else
        echo "❌ Docker服务启动失败"
        sudo systemctl status docker --no-pager -l
        return 1
      fi
    else
      echo "❌ 无法重启Docker服务"
      return 1
    fi
  elif command -v service &> /dev/null; then
    if sudo service docker restart 2>/dev/null; then
      sleep 5
      echo "✅ Docker服务重启完成"
    else
      echo "❌ 无法重启Docker服务"
      return 1
    fi
  else
    echo "⚠️ 无法自动重启Docker服务，请手动重启:"
    echo "   sudo systemctl restart docker"
    echo "   或者: sudo service docker restart"
    return 1
  fi
  
  return 0
}

# 配置IPv6网络
configure_ipv6_network() {
  if [[ "$ENABLE_IPV6" == "true" ]]; then
    echo "🌐 配置IPv6网络..."
    
    # 检查IPv6支持
    if ! check_ipv6_support; then
      echo "❌ IPv6支持检查失败"
      echo ""
      echo "📋 您有以下选择："
      echo "1. 继续安装（仅使用IPv4网络）"
      echo "2. 取消安装，手动配置IPv6后重试"
      echo ""
      read -p "请选择 (1/2): " ipv6_choice
      
      case $ipv6_choice in
        1)
          echo "ℹ️ 继续安装，将使用IPv4网络"
          ENABLE_IPV6=false
          echo "✅ 网络配置完成（仅IPv4）"
          echo "ℹ️ IPv4子网: 172.20.0.0/16"
          return 0
          ;;
        2)
          echo "❌ 安装已取消"
          echo "ℹ️ 请参考以下步骤手动配置IPv6:"
          echo "   1. 确保系统内核支持IPv6"
          echo "   2. 编辑 /etc/docker/daemon.json 添加:"
          echo '      {"ipv6": true, "fixed-cidr-v6": "2001:db8:1::/64"}'
          echo "   3. 重启Docker服务: sudo systemctl restart docker"
          echo "   4. 重新运行此安装脚本"
          echo "ℹ️ 脚本会自动选择不冲突的IPv6子网"
          exit 1
          ;;
        *)
          echo "❌ 无效选择，安装已取消"
          exit 1
          ;;
      esac
    fi
    
    # 创建支持IPv6的docker-compose.yml配置
    echo "🔧 正在创建IPv6网络配置..."
    
    # 检查文件是否已包含IPv6配置
    if grep -q "enable_ipv6: true" docker-compose.yml && (grep -q "2001:db8:1::/64" docker-compose.yml || grep -q "2001:db8:2::/64" docker-compose.yml); then
      EXISTING_IPV6_SUBNET=$(grep -o "2001:db8:[0-9]::/64" docker-compose.yml)
      echo "✅ IPv6配置已存在"
      echo "✅ IPv6网络配置完成"
      echo "ℹ️ IPv6子网: $EXISTING_IPV6_SUBNET"
      echo "ℹ️ IPv4子网: 172.20.0.0/16"
    else
      # 安全地添加IPv6配置，只修改networks部分
      echo "⚙️ 正在添加IPv6网络支持..."
      
      # 检测daemon.json中的IPv6子网，选择不冲突的子网
      IPV6_SUBNET="2001:db8:2::/64"  # 默认使用2号子网
      if [ -f "/etc/docker/daemon.json" ]; then
        if grep -q "2001:db8:2::/64" /etc/docker/daemon.json 2>/dev/null; then
          IPV6_SUBNET="2001:db8:3::/64"  # 如果2号被占用，使用3号
        fi
      fi
      echo "ℹ️ 将使用IPv6子网: $IPV6_SUBNET"
      
      # 创建临时文件来安全修改
      cp docker-compose.yml docker-compose.yml.backup
      
      # 使用awk来精确修改networks部分
      awk -v ipv6_subnet="$IPV6_SUBNET" '
      /^networks:/ { in_networks = 1 }
      /^[a-zA-Z]/ && !/^networks:/ && in_networks { in_networks = 0 }
      /^  gost-network:/ && in_networks { in_gost_network = 1 }
      /^  [a-zA-Z]/ && !/^  gost-network:/ && in_gost_network { in_gost_network = 0 }
      /^    driver: bridge$/ && in_gost_network && !ipv6_added { 
        print $0
        print "    enable_ipv6: true"
        ipv6_added = 1
        next
      }
      /^        - subnet: 172\.20\.0\.0\/16$/ && in_gost_network && !subnet_added {
        print $0
        print "        - subnet: " ipv6_subnet
        subnet_added = 1
        next
      }
      { print }
      ' docker-compose.yml.backup > docker-compose.yml
      
      # 验证修改是否成功
      if grep -q "enable_ipv6: true" docker-compose.yml && grep -q "$IPV6_SUBNET" docker-compose.yml; then
        echo "✅ IPv6网络配置添加成功"
        rm -f docker-compose.yml.backup
        echo "✅ IPv6网络配置完成"
        echo "ℹ️ IPv6子网: $IPV6_SUBNET"
        echo "ℹ️ IPv4子网: 172.20.0.0/16"
      else
        echo "❌ IPv6网络配置添加失败"
        echo "🔍 请检查docker-compose.yml文件"
        if [ -f docker-compose.yml.backup ]; then
          echo "📁 备份文件: docker-compose.yml.backup"
        fi
      fi
    fi
  else
    echo "ℹ️ 跳过IPv6网络配置，仅使用IPv4网络"
    echo "✅ 网络配置完成（仅IPv4）"
    echo "ℹ️ IPv4子网: 172.20.0.0/16"
  fi
}

# 显示菜单
show_menu() {
  echo "==============================================="
  echo "          面板管理脚本"
  echo "==============================================="
  echo "请选择操作："
  echo "1. 安装面板"
  echo "2. 更新面板"
  echo "3. 卸载面板"
  echo "4. 退出"
  echo "==============================================="
}

generate_random() {
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c16
}

# 获取用户输入的配置参数
get_config_params() {
  echo "🔧 请输入配置参数："

  echo "📡 节点端服务器和面板通信的地址，需要能正常访问（IPv6不需要加[]）"
  while true; do
    read -p "当前面板服务器地址: " SERVER_HOST
    if [ -n "$SERVER_HOST" ]; then
      break
    else
      echo "面板服务器地址不能为空，请输入。"
    fi
  done

  read -p "前端端口（默认 6366）: " FRONTEND_PORT
  FRONTEND_PORT=${FRONTEND_PORT:-6366}

  read -p "后端端口（默认 6365）: " BACKEND_PORT
  BACKEND_PORT=${BACKEND_PORT:-6365}

  # 询问是否开启IPv6支持
  echo ""
  echo "🌐 IPv6 支持配置"
  echo "开启IPv6可以让容器支持IPv6网络连接"
  echo "ℹ️ 注意事项："
  echo "   - 需要系统内核支持IPv6"
  echo "   - 需要Docker守护进程启用IPv6支持"
  echo "   - 如果Docker未启用IPv6，请先配置Docker后再安装"
  echo ""
  read -p "是否开启IPv6支持？(y/N): " ENABLE_IPV6
  if [[ "$ENABLE_IPV6" == "y" || "$ENABLE_IPV6" == "Y" ]]; then
    ENABLE_IPV6=true
    echo "✅ 已选择开启IPv6支持"
    echo "ℹ️ 将根据系统配置自动选择合适的IPv6子网"
  else
    ENABLE_IPV6=false
    echo "ℹ️ 未开启IPv6支持，使用IPv4网络"
  fi

  DB_NAME=$(generate_random)
  DB_USER=$(generate_random)
  DB_PASSWORD=$(generate_random)
  JWT_SECRET=$(generate_random)
  SERVER_HOST_PORT="${SERVER_HOST}:${BACKEND_PORT}"
}

# 安装功能
install_panel() {
  echo "🚀 开始安装面板..."
  check_docker
  get_config_params
  
  echo "🔽 下载必要文件..."
  curl -L -o docker-compose.yml "$DOCKER_COMPOSE_URL"
  curl -L -o gost.sql "$GOST_SQL_URL"
  echo "✅ 下载完成"

  # 配置IPv6网络
  configure_ipv6_network

  cat > .env <<EOF
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
SERVER_HOST=$SERVER_HOST_PORT
FRONTEND_PORT=$FRONTEND_PORT
BACKEND_PORT=$BACKEND_PORT
ENABLE_IPV6=$ENABLE_IPV6
EOF

  echo "🚀 启动 docker 服务..."
  $DOCKER_CMD up -d

  echo "🎉 部署完成"
  echo "✅ .env 文件内容："
  echo "DB_NAME=$DB_NAME"
  echo "DB_USER=$DB_USER"
  echo "DB_PASSWORD=$DB_PASSWORD"
  echo "JWT_SECRET=$JWT_SECRET"
  echo "SERVER_HOST=$SERVER_HOST_PORT"
  echo "FRONTEND_PORT=$FRONTEND_PORT"
  echo "BACKEND_PORT=$BACKEND_PORT"
  echo "ENABLE_IPV6=$ENABLE_IPV6"
}

# 更新功能
update_panel() {
  echo "🔄 开始更新面板..."
  check_docker
  
  echo "🔽 下载最新配置文件..."
  curl -L -o docker-compose.yml "$DOCKER_COMPOSE_URL"
  echo "✅ 下载完成"



  echo "🛑 停止当前服务..."
  $DOCKER_CMD down
  
  echo "⬇️ 拉取最新镜像..."
  $DOCKER_CMD pull
  
  echo "🚀 启动更新后的服务..."
  $DOCKER_CMD up -d
  
  # 等待服务启动
  echo "⏳ 等待服务启动..."
  
  # 检查后端容器健康状态
  echo "🔍 检查后端服务状态..."
  for i in {1..90}; do
    if docker ps --format "{{.Names}}" | grep -q "^springboot-backend$"; then
      BACKEND_HEALTH=$(docker inspect -f '{{.State.Health.Status}}' springboot-backend 2>/dev/null || echo "unknown")
      if [[ "$BACKEND_HEALTH" == "healthy" ]]; then
        echo "✅ 后端服务健康检查通过"
        break
      elif [[ "$BACKEND_HEALTH" == "starting" ]]; then
        # 继续等待
        :
      elif [[ "$BACKEND_HEALTH" == "unhealthy" ]]; then
        echo "⚠️ 后端健康状态：$BACKEND_HEALTH"
      fi
    else
      echo "⚠️ 后端容器未找到或未运行"
      BACKEND_HEALTH="not_running"
    fi
    if [ $i -eq 90 ]; then
      echo "❌ 后端服务启动超时（90秒）"
      echo "🔍 当前状态：$(docker inspect -f '{{.State.Health.Status}}' springboot-backend 2>/dev/null || echo '容器不存在')"
      echo "🛑 更新终止"
      return 1
    fi
    # 每15秒显示一次进度
    if [ $((i % 15)) -eq 1 ]; then
      echo "⏳ 等待后端服务启动... ($i/90) 状态：${BACKEND_HEALTH:-unknown}"
    fi
    sleep 1
  done
  
  # 检查数据库容器健康状态
  echo "🔍 检查数据库服务状态..."
  for i in {1..60}; do
    if docker ps --format "{{.Names}}" | grep -q "^gost-mysql$"; then
      DB_HEALTH=$(docker inspect -f '{{.State.Health.Status}}' gost-mysql 2>/dev/null || echo "unknown")
      if [[ "$DB_HEALTH" == "healthy" ]]; then
        echo "✅ 数据库服务健康检查通过"
        break
      elif [[ "$DB_HEALTH" == "starting" ]]; then
        # 继续等待
        :
      elif [[ "$DB_HEALTH" == "unhealthy" ]]; then
        echo "⚠️ 数据库健康状态：$DB_HEALTH"
      fi
    else
      echo "⚠️ 数据库容器未找到或未运行"
      DB_HEALTH="not_running"
    fi
    if [ $i -eq 60 ]; then
      echo "❌ 数据库服务启动超时（60秒）"
      echo "🔍 当前状态：$(docker inspect -f '{{.State.Health.Status}}' gost-mysql 2>/dev/null || echo '容器不存在')"
      echo "🛑 更新终止"
      return 1
    fi
    # 每10秒显示一次进度
    if [ $((i % 10)) -eq 1 ]; then
      echo "⏳ 等待数据库服务启动... ($i/60) 状态：${DB_HEALTH:-unknown}"
    fi
    sleep 1
  done
  
  # 从容器环境变量获取数据库信息
  echo "🔍 获取数据库配置信息..."
  
  # 等待一下让服务完全就绪
  echo "⏳ 等待服务完全就绪..."
  sleep 5
  
  # 先检查后端容器是否在运行
  if ! docker ps --format "{{.Names}}" | grep -q "^springboot-backend$"; then
    echo "❌ 后端容器未运行，无法获取数据库配置"
    echo "🔍 当前运行的容器："
    docker ps --format "table {{.Names}}\t{{.Status}}"
    echo "🛑 更新终止"
    return 1
  fi
  
  DB_INFO=$(docker exec springboot-backend env | grep "^DB_" 2>/dev/null || echo "")
  
  if [[ -n "$DB_INFO" ]]; then
    DB_NAME=$(echo "$DB_INFO" | grep "^DB_NAME=" | cut -d'=' -f2)
    DB_PASSWORD=$(echo "$DB_INFO" | grep "^DB_PASSWORD=" | cut -d'=' -f2)
    DB_USER=$(echo "$DB_INFO" | grep "^DB_USER=" | cut -d'=' -f2)
    DB_HOST=$(echo "$DB_INFO" | grep "^DB_HOST=" | cut -d'=' -f2)
    
    echo "📋 数据库配置："
    echo "   数据库名: $DB_NAME"
    echo "   用户名: $DB_USER"
    echo "   主机: $DB_HOST"
  else
    echo "❌ 无法获取数据库配置信息"
    echo "🔍 尝试诊断问题："
    echo "   容器状态: $(docker inspect -f '{{.State.Status}}' springboot-backend 2>/dev/null || echo '容器不存在')"
    echo "   健康状态: $(docker inspect -f '{{.State.Health.Status}}' springboot-backend 2>/dev/null || echo '无健康检查')"
    
    # 尝试从 .env 文件读取配置
    if [[ -f ".env" ]]; then
      echo "🔄 尝试从 .env 文件读取配置..."
      DB_NAME=$(grep "^DB_NAME=" .env | cut -d'=' -f2 2>/dev/null)
      DB_PASSWORD=$(grep "^DB_PASSWORD=" .env | cut -d'=' -f2 2>/dev/null)
      DB_USER=$(grep "^DB_USER=" .env | cut -d'=' -f2 2>/dev/null)
      
      if [[ -n "$DB_NAME" && -n "$DB_PASSWORD" && -n "$DB_USER" ]]; then
        echo "✅ 从 .env 文件成功读取数据库配置"
        echo "📋 数据库配置："
        echo "   数据库名: $DB_NAME"
        echo "   用户名: $DB_USER"
      else
        echo "❌ .env 文件中的数据库配置不完整"
        echo "🛑 更新终止"
        return 1
      fi
    else
      echo "❌ 未找到 .env 文件"
      echo "🛑 更新终止"
      return 1
    fi
  fi
  
  # 检查必要的数据库配置
  if [[ -z "$DB_PASSWORD" || -z "$DB_USER" || -z "$DB_NAME" ]]; then
    echo "❌ 数据库配置不完整（缺少必要参数）"
    echo "🛑 更新终止"
    return 1
  fi
  
  # 执行数据库字段变更
  echo "🔄 执行数据库结构更新..."
  
  # 创建临时迁移文件（现在有了数据库信息）
  cat > temp_migration.sql <<EOF
-- 数据库结构更新
USE \`$DB_NAME\`;

-- user 表：删除 name 字段（如果存在）
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'user'
        AND column_name = 'name'
    ),
    'ALTER TABLE \`user\` DROP COLUMN \`name\`;',
    'SELECT "Column \`name\` not exists in \`user\`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- node 表：删除 port 字段、添加 server_ip 字段（如果不存在）
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'node'
        AND column_name = 'port'
    ),
    'ALTER TABLE \`node\` DROP COLUMN \`port\`;',
    'SELECT "Column \`port\` not exists in \`node\`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'node'
        AND column_name = 'server_ip'
    ),
    'ALTER TABLE \`node\` ADD COLUMN \`server_ip\` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;',
    'SELECT "Column \`server_ip\` already exists in \`node\`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 将 ip 赋值给 server_ip（如果字段都存在）
UPDATE \`node\`
SET \`server_ip\` = \`ip\`
WHERE \`server_ip\` IS NULL;

-- tunnel 表：添加 tcp_listen_addr、udp_listen_addr、protocol（如果不存在）

-- tcp_listen_addr
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'tunnel'
        AND column_name = 'tcp_listen_addr'
    ),
    'ALTER TABLE \`tunnel\` ADD COLUMN \`tcp_listen_addr\` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT "0.0.0.0";',
    'SELECT "Column \`tcp_listen_addr\` already exists in \`tunnel\`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- udp_listen_addr
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'tunnel'
        AND column_name = 'udp_listen_addr'
    ),
    'ALTER TABLE \`tunnel\` ADD COLUMN \`udp_listen_addr\` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT "0.0.0.0";',
    'SELECT "Column \`udp_listen_addr\` already exists in \`tunnel\`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- protocol
SET @sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE()
        AND table_name = 'tunnel'
        AND column_name = 'protocol'
    ),
    'ALTER TABLE \`tunnel\` ADD COLUMN \`protocol\` VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT "tls";',
    'SELECT "Column \`protocol\` already exists in \`tunnel\`";'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
EOF
  
  # 检查数据库容器
  if ! docker ps --format "{{.Names}}" | grep -q "^gost-mysql$"; then
    echo "❌ 数据库容器 gost-mysql 未运行"
    echo "🔍 当前运行的容器："
    docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
    echo "❌ 数据库结构更新失败，请手动执行 temp_migration.sql"
    echo "📁 迁移文件已保存为 temp_migration.sql"
    return 1
  fi
  
  # 执行数据库迁移
  if docker exec -i gost-mysql mysql -u "$DB_USER" -p"$DB_PASSWORD" < temp_migration.sql 2>/dev/null; then
    echo "✅ 数据库结构更新完成"
  else
    echo "⚠️ 使用用户密码失败，尝试root密码..."
    if docker exec -i gost-mysql mysql -u root -p"$DB_PASSWORD" < temp_migration.sql 2>/dev/null; then
      echo "✅ 数据库结构更新完成"
    else
      echo "❌ 数据库结构更新失败，请手动执行 temp_migration.sql"
      echo "📁 迁移文件已保存为 temp_migration.sql"
      echo "🔍 数据库容器状态: $(docker inspect -f '{{.State.Status}}' gost-mysql 2>/dev/null || echo '容器不存在')"
      echo "🛑 更新终止"
      return 1
    fi
  fi
  
  # 清理临时文件
  rm -f temp_migration.sql
  
  echo "✅ 更新完成"
}

# 卸载功能
uninstall_panel() {
  echo "🗑️ 开始卸载面板..."
  check_docker
  
  if [[ ! -f "docker-compose.yml" ]]; then
    echo "⚠️ 未找到 docker-compose.yml 文件，正在下载以完成卸载..."
    curl -L -o docker-compose.yml "$DOCKER_COMPOSE_URL"
    echo "✅ docker-compose.yml 下载完成"
  fi
  
  read -p "确认卸载面板吗？此操作将停止并删除所有容器和数据 (y/N): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "❌ 取消卸载"
    return 0
  fi

  echo "🛑 停止并删除容器、镜像、卷..."
  $DOCKER_CMD down --rmi all --volumes --remove-orphans
  echo "🧹 删除配置文件..."
  rm -f docker-compose.yml gost.sql .env
  echo "✅ 卸载完成"
}

# 主逻辑
main() {
  # 显示交互式菜单
  while true; do
    show_menu
    read -p "请输入选项 (1-4): " choice
    
    case $choice in
      1)
        install_panel
        break
        ;;
      2)
        update_panel
        break
        ;;
      3)
        uninstall_panel
        break
        ;;
      4)
        echo "👋 退出脚本"
        exit 0
        ;;
      *)
        echo "❌ 无效选项，请输入 1-4"
        echo ""
        ;;
    esac
  done
}

# 执行主函数
main
