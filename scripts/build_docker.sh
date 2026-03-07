#!/bin/bash

# =================================================================
# Flux Panel 本地 Docker 构建工具
# =================================================================

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOW_SPACE_MB="${LOW_SPACE_MB:-6144}"
CRITICAL_SPACE_MB="${CRITICAL_SPACE_MB:-3072}"
MIN_REQUIRED_SPACE_MB="${MIN_REQUIRED_SPACE_MB:-2048}"

cleanup_on_exit() {
    bash "$ROOT_DIR/scripts/cleanup_local_artifacts.sh" post-build || true
}

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

trap cleanup_on_exit EXIT

TAG=${1:-local}
REGISTRY=${2:-flux-panel}
APP_VERSION="$(awk -F'"' '/"version"/ {print $4; exit}' vite-frontend/package.json 2>/dev/null || echo '0.0.0')"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'local')"
GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'local')"
BUILD_TIME="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

export VITE_APP_VERSION="$APP_VERSION"
export VITE_GIT_SHA="$GIT_SHA"
export VITE_GIT_BRANCH="$GIT_BRANCH"
export VITE_BUILD_TIME="$BUILD_TIME"

echo "开始本地 Docker 构建任务 (Tag: $TAG)..."
echo "发布版本: v$APP_VERSION"
echo "构建标识: ${GIT_BRANCH}.${GIT_SHA}"
ensure_local_free_space "Docker 构建"

if [ "$TAG" = "local" ] && [ "$(uname -s)" = "Darwin" ]; then
    JAVA_PREFIX="$(brew --prefix openjdk@21 2>/dev/null || true)"
    NODE_PREFIX="$(brew --prefix node@20 2>/dev/null || true)"
    CACHE_DIR="$ROOT_DIR/.cache"
    MAVEN_REPO_LOCAL="$CACHE_DIR/m2"
    NPM_CACHE_DIR="$CACHE_DIR/npm"

    if [ -n "$JAVA_PREFIX" ] && [ -n "$NODE_PREFIX" ]; then
        export JAVA_HOME="$JAVA_PREFIX/libexec/openjdk.jdk/Contents/Home"
        export PATH="$JAVA_HOME/bin:$NODE_PREFIX/bin:$PATH"
    fi

    mkdir -p "$MAVEN_REPO_LOCAL" "$NPM_CACHE_DIR"
    export npm_config_cache="$NPM_CACHE_DIR"

    echo "检测到 macOS 本地构建，先在主机上生成后端与前端产物..."

    echo "---------------------------------------------------"
    echo "正在打包后端 JAR..."
    echo "---------------------------------------------------"
    ensure_local_free_space "后端 JAR 打包"
    (
        cd springboot-backend
        mvn -Dmaven.repo.local="$MAVEN_REPO_LOCAL" clean package -Dmaven.test.skip=true
    )

    echo "---------------------------------------------------"
    echo "正在构建前端 dist..."
    echo "---------------------------------------------------"
    ensure_local_free_space "前端 dist 构建"
    (
        cd vite-frontend
        if [ ! -d node_modules ]; then
            npm install --legacy-peer-deps --prefer-offline
        fi
        NODE_OPTIONS="--max-old-space-size=4096" npx vite build
    )

    echo "---------------------------------------------------"
    echo "正在构建后端镜像: $REGISTRY/springboot-backend:$TAG"
    echo "---------------------------------------------------"
    ensure_local_free_space "后端镜像构建"
    docker build \
        --build-arg APP_VERSION="$APP_VERSION" \
        --build-arg GIT_SHA="$GIT_SHA" \
        --build-arg GIT_BRANCH="$GIT_BRANCH" \
        --build-arg BUILD_TIME="$BUILD_TIME" \
        -f springboot-backend/Dockerfile.local \
        -t "$REGISTRY/springboot-backend:$TAG" \
        ./springboot-backend

    echo "---------------------------------------------------"
    echo "正在构建前端镜像: $REGISTRY/vite-frontend:$TAG"
    echo "---------------------------------------------------"
    ensure_local_free_space "前端镜像构建"
    docker build \
        --build-arg APP_VERSION="$APP_VERSION" \
        --build-arg GIT_SHA="$GIT_SHA" \
        --build-arg GIT_BRANCH="$GIT_BRANCH" \
        --build-arg BUILD_TIME="$BUILD_TIME" \
        -f vite-frontend/Dockerfile.local \
        -t "$REGISTRY/vite-frontend:$TAG" \
        ./vite-frontend

    echo "================================================================="
    echo "构建成功！"
    docker images | grep "$REGISTRY"
    echo "================================================================="
    echo "提示: 如需让 localhost 立即加载新代码，请继续执行："
    echo "./scripts/reload_local_stack.sh"
    exit 0
fi

# 1. 构建后端镜像
echo "---------------------------------------------------"
echo "正在构建后端镜像: $REGISTRY/springboot-backend:$TAG"
echo "---------------------------------------------------"
ensure_local_free_space "后端镜像构建"
docker build \
    --build-arg APP_VERSION="$APP_VERSION" \
    --build-arg GIT_SHA="$GIT_SHA" \
    --build-arg GIT_BRANCH="$GIT_BRANCH" \
    --build-arg BUILD_TIME="$BUILD_TIME" \
    -t "$REGISTRY/springboot-backend:$TAG" \
    ./springboot-backend

# 2. 构建前端镜像
echo "---------------------------------------------------"
echo "正在构建前端镜像: $REGISTRY/vite-frontend:$TAG"
echo "---------------------------------------------------"
ensure_local_free_space "前端镜像构建"
docker build \
    --build-arg APP_VERSION="$APP_VERSION" \
    --build-arg GIT_SHA="$GIT_SHA" \
    --build-arg GIT_BRANCH="$GIT_BRANCH" \
    --build-arg BUILD_TIME="$BUILD_TIME" \
    -t "$REGISTRY/vite-frontend:$TAG" \
    ./vite-frontend

echo "================================================================="
echo "构建成功！"
docker images | grep "$REGISTRY"
echo "================================================================="
echo "提示: 您可以使用以下命令启动容器 (需先配置 .env):"
echo "docker-compose -f docker-compose-v4.yml up -d"
