#!/bin/bash

ARCH=$(uname -m)
if [[ "$ARCH" != "x86_64" ]]; then
  echo "❌ 不支持的架构: $ARCH，仅支持 x86_64。"
  exit 1
fi

# 下载地址
DOWNLOAD_URL="https://github.com/bqlpfy/forward-panel/releases/download/gost/gost"

# 解析参数
while getopts "a:p:s:" opt; do
  case $opt in
    a) SERVER_ADDR="$OPTARG" ;;
    p) PORT="$OPTARG" ;;
    s) SECRET="$OPTARG" ;;
    *) echo "❌ 无效参数"; exit 1 ;;
  esac
done

if [[ -z "$SERVER_ADDR" || -z "$PORT" || -z "$SECRET" ]]; then
  echo "用法: $0 -a 服务器地址 -p 端口 -s 密钥"
  exit 1
fi

INSTALL_DIR="/etc/gost"
mkdir -p "$INSTALL_DIR"

# 停止并禁用已有服务
if systemctl list-units --full -all | grep -Fq "gost.service"; then
  echo "🔍 检测到已存在的gost服务"
  systemctl stop gost 2>/dev/null && echo "🛑 停止服务"
  systemctl disable gost 2>/dev/null && echo "🚫 禁用自启"
fi

# 删除旧文件
[[ -f "$INSTALL_DIR/gost" ]] && echo "🧹 删除旧文件 gost" && rm -f "$INSTALL_DIR/gost"

# 下载 gost
echo "⬇️ 下载 gost 中..."
curl -L "$DOWNLOAD_URL" -o "$INSTALL_DIR/gost"
if [[ ! -f "$INSTALL_DIR/gost" || ! -s "$INSTALL_DIR/gost" ]]; then
  echo "❌ 下载失败，请检查网络或下载链接。"
  exit 1
fi
chmod +x "$INSTALL_DIR/gost"
echo "✅ 下载完成"

# 打印版本
echo "🔎 gost 版本：$($INSTALL_DIR/gost -V)"

# 写入 config.json
CONFIG_FILE="$INSTALL_DIR/config.json"
if [[ -f "$CONFIG_FILE" ]]; then
  echo "📝 更新配置: config.json"
  sed -i.bak "s|\"addr\": \".*\"|\"addr\": \"$SERVER_ADDR\"|g" "$CONFIG_FILE"
  sed -i.bak "s|\"secret\": \".*\"|\"secret\": \"$SECRET\"|g" "$CONFIG_FILE"
  rm -f "$CONFIG_FILE.bak"
else
  echo "📄 创建新配置: config.json"
  cat > "$CONFIG_FILE" <<EOF
{
  "addr": "$SERVER_ADDR",
  "secret": "$SECRET"
}
EOF
fi

# 写入 gost.json
GOST_CONFIG="$INSTALL_DIR/gost.json"
if [[ -f "$GOST_CONFIG" ]]; then
  echo "📝 更新配置: gost.json"
  sed -i.bak "s|\"addr\": \":.*\"|\"addr\": \":$PORT\"|g" "$GOST_CONFIG"
  sed -i.bak "s|\"username\": \".*\"|\"username\": \"$SECRET\"|g" "$GOST_CONFIG"
  sed -i.bak "s|\"password\": \".*\"|\"password\": \"$SECRET\"|g" "$GOST_CONFIG"
  rm -f "$GOST_CONFIG.bak"
else
  echo "📄 创建新配置: gost.json"
  cat > "$GOST_CONFIG" <<EOF
{
  "services": [
    {
      "name": "web_api",
      "addr": ":$PORT",
      "handler": {
        "type": "api",
        "auth": {
          "username": "$SECRET",
          "password": "$SECRET"
        },
        "metadata": {
          "pathPrefix": "/api"
        }
      },
      "listener": {
        "type": "tls"
      }
    }
  ]
}
EOF
fi

# 加强权限
chmod 600 "$INSTALL_DIR"/*.json

# 创建 systemd 服务
SERVICE_FILE="/etc/systemd/system/gost.service"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Gost Proxy Service
After=network.target

[Service]
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/gost
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# 启动服务
systemctl daemon-reload
systemctl enable gost
systemctl start gost

# 检查状态
echo "🔄 检查服务状态..."
if systemctl is-active --quiet gost; then
  echo "✅ 安装完成，gost服务已启动并设置为开机启动。"
  echo "📁 配置目录: $INSTALL_DIR"
  echo "🔧 服务状态: $(systemctl is-active gost)"
else
  echo "❌ gost服务启动失败，请执行以下命令查看日志："
  echo "journalctl -u gost -f"
fi
