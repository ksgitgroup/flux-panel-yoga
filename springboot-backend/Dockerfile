# ============================================================
# 后端 Dockerfile — 多阶段构建（Multi-stage build）
#
# 同样原理：每个 FROM/COPY/RUN 是一层
# 只有变化的层才重建，之前的层复用缓存
# ============================================================

# ─────────────────────────────────────────────
# 阶段一：Build（Maven 编译阶段）
# 作用：用 Maven 把 Java 源码编译打包成 .jar 文件
# ─────────────────────────────────────────────

# 层1：Maven 构建环境（包含 JDK 21 + Maven 3.9.6）
# 这个基础镜像体积很大（~500MB），但只需下载一次，之后永远缓存
FROM maven:3.9.6-eclipse-temurin-21 AS build

WORKDIR /app

# ★ 关键技巧（和前端一样）：先只复制 pom.xml ★
# 层2：只复制 Maven 的依赖描述文件
# pom.xml 定义了所有 Java 依赖（类似 package.json）
# 只有 pom.xml 变化（新增/删除依赖）时这层才失效
COPY pom.xml .

# 层3：预下载所有 Maven 依赖，形成独立缓存层
# ★ 只要 pom.xml 不变，这层永远命中缓存，不会重新下载 jar 包 ★
# 改了 .java 业务代码？这层命中缓存 → 依赖不重载
RUN mvn dependency:go-offline -B

# 层4：复制 Java 源代码（src 目录）
# 每次改了任何 .java 文件，这层就失效 → 层5也跟着失效
# 但 pom.xml 层（层2、3）依然是缓存 → 依赖不重载
COPY src ./src

# 层5：Maven 编译打包（-DskipTests 跳过单元测试加快速度）
# 只有 src 或 pom.xml 变了才重跑这一步
# 这一步耗时最长，但有了层3的依赖缓存后，重跑时间大幅缩短
RUN mvn clean package -DskipTests

# ─────────────────────────────────────────────
# 阶段二：Runtime（运行阶段）
# 作用：只用 JRE（不含 JDK/Maven），装载 .jar 文件运行
# 不包含 Maven 和所有 Java 源码 → 镜像体积大幅减小
# ─────────────────────────────────────────────

# 层5：切换为轻量 JRE 运行环境（21-jre，只有运行时，不含编译工具）
FROM eclipse-temurin:21-jre

WORKDIR /app

# 层6-8：设置 JVM 内存和编码等环境变量（固定，永远缓存）
# -Xmx512m 最大堆内存 512MB，-Xms256m 初始堆内存 256MB
# 如果服务器内存不够，可以调小这两个值
ENV JAVA_OPTS="-Xmx512m -Xms256m -Dfile.encoding=UTF-8 -Duser.timezone=Asia/Shanghai"
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

# 从 GitHub Actions 传入的分支名（dev 或 main），用于构建正确的安装脚本 URL
ARG GIT_BRANCH=dev
ENV GIT_BRANCH=${GIT_BRANCH}

# 层9：安装字体（某些 PDF/图表功能需要，较慢但缓存后不会重跑）
# 换用中科大镜像加速 apt-get（避免国内访问 Ubuntu 源超时）
RUN sed -i 's/archive.ubuntu.com/mirrors.ustc.edu.cn/g' /etc/apt/sources.list \
    && sed -i 's/security.ubuntu.com/mirrors.ustc.edu.cn/g' /etc/apt/sources.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends fontconfig fonts-dejavu \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 层10：从阶段一复制编译好的 .jar 文件（业务代码变了这层才更新）
# 只有这一层包含会变化的内容，层5-9全部复用缓存
COPY --from=build /app/target/*.jar app.jar

# 声明容器对外暴露 6365 端口（与 application.yml 中的 server.port 一致）
EXPOSE 6365

# 容器启动命令：读取 JAVA_OPTS 环境变量后运行 jar
# exec 使 java 成为 PID 1，确保信号（如 docker stop）能正确传递
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
