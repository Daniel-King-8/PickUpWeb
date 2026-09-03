# ============ 取个件呗 Web 版 多阶段构建 ============
# 阶段1：构建前端（Vue3 + Vite）
# 注：npm 使用国内镜像，避免国内服务器/构建机访问官方源与 GitHub 下载超时
FROM node:22-slim AS web-build
WORKDIR /app/web
COPY web/package.json ./
RUN npm install --registry=https://registry.npmmirror.com
COPY web/ ./
RUN npm run build

# 阶段2：后端（Express + Sequelize + SQLite）
# 预装编译工具链：sqlite3 的预编译二进制下载失败时，自动回退源码编译（无需依赖外网成功）
# apt 源换国内（阿里云），避免容器内拉包拖慢/失败
FROM node:22-slim AS server
WORKDIR /app/server
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' \
        /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list 2>/dev/null || true; \
    apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY server/package.json ./
RUN npm install --registry=https://registry.npmmirror.com \
    --sqlite3_binary_host_mirror=https://npmmirror.com/mirrors/sqlite3/
COPY server/ ./
# 前端构建产物复制到后端项目同级 web/dist（app.js 会去 ../web/dist 找）
COPY --from=web-build /app/web/dist /app/web/dist

WORKDIR /app
EXPOSE 3000
CMD ["node", "server/src/app.js"]
