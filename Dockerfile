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
# sqlite3 预编译二进制走 npmmirror 镜像下载
FROM node:22-slim AS server
WORKDIR /app/server
COPY server/package.json ./
RUN npm install --registry=https://registry.npmmirror.com \
    --sqlite3_binary_host_mirror=https://npmmirror.com/mirrors/sqlite3/
COPY server/ ./
# 前端构建产物复制到后端项目同级 web/dist（app.js 会去 ../web/dist 找）
COPY --from=web-build /app/web/dist /app/web/dist

WORKDIR /app
EXPOSE 3000
CMD ["node", "server/src/app.js"]
