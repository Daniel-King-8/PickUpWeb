# 取个件呗 Web 版

校园快递代取平台（Web 版）：学生发布取件需求 → 扫码/加微信付款 → 管理员核对 → 同学抢单代取 → 送达拍照 → 雇主确认 → 每日线下结算。**平台通过抽成赚取服务费。**

> 小程序版（微信云开发）在隔壁仓库 `KD`，本仓库是 Web 版（Docker 一键部署，自建服务器）。

## 角色与流程

```
雇主                    平台（管理员）                跑腿员
  │ ① 下单(自动算费)         │                          │
  │ ② 扫码/加微信付款         │ ③ 核对截图→标记已支付      │
  │                       │ ── 订单进入接单大厅 ─────► ④ 抢单(取件码可见)
  │                       │ ◄────────────────────── ⑤ 送达拍照
  │ ⑥ 确认收货              │ ⑦ 晚间生成结算单→线下转账   │
  └─────── 资金：雇主 → 平台 → 跑腿员（抽成计入平台） ────┘
```

## 技术栈

- 前端：Vue3 + Vant4 + Axios（Vite 构建）
- 后端：Node.js + Express + Sequelize
- 数据库：SQLite（单文件，零运维；Docker 卷持久化）
- 部署：Docker 单容器（多阶段构建）· docker-compose

## Docker 部署（你的 Linux 服务器）

```bash
# 1. 克隆代码
git clone git@github.com:.../PickUpWeb.git
cd PickUpWeb

# 2. 修改 docker-compose.yml 里的两个必改项：
#    - ADMIN_PASSWORD 管理员初始密码
#    - JWT_SECRET 随机长字符串（如 openssl rand -hex 32 生成）

# 3. 一键构建并启动
docker compose up -d --build

# 4. 访问
#    http://服务器IP:3000
```

- 数据（数据库 + 上传图片）持久化在宿主机 `./data`，容器删除/升级不丢数据
- 更新代码：`git pull` 后再次 `docker compose up -d --build`
- 外网部署建议：域名解析到服务器 + Nginx/caddy 反代 3000 端口 + HTTPS（Cloudflare 可免费）

## 管理员使用手册

1. 访问 `/login`，用 admin 账号登录 → 自动进入管理后台
2. **设置 tab**：先上传微信/支付宝收款码、填写加微信引导文案；费率（驿站基础价/楼栋附加/抽成）JSON 编辑保存
3. **待核对 tab**：雇主付款后上传截图 → 核对微信/支付宝收款记录 → 点「标记已支付」→ 订单进入大厅
4. **每日结算 tab**：晚上选日期 → 看预览（跑腿员应得=合计-抽成）→ 生成结算单 → 线下转账 → 点「已转账」
5. **订单管理 tab**：异常订单可取消

## Kook 机器人对接（通知 + 接单大厅）

Web 端所有订单状态变化实时推送到 Kook（WebSocket 出站连接，无需公网端口）：

```
用户网站下单并上传付款截图 → #订单待确定 频道卡片（【确认到账并发布】按钮）
  → 管理员点按钮 → #接单大厅 频道订单卡片（【抢单】按钮，取件码脱敏）
  → 猎人点抢单 → 双方私聊通知（取件码解锁 / 标记送达 / 确认收货按钮）
  → 全程可在 Kook 内完成，无需打开网页
```

0. **Kook 服务器需建两个子频道**：# 订单待确定、# 接单大厅
1. [Kook 开发者中心](https://developer.kookapp.cn) 创建机器人 → 复制 Bot Token → 邀请机器人进你的服务器
2. 管理后台 **「Kook 对接」tab**：填 Token 与两个频道 ID（频道 ID 在开发者中心「频道管理」复制）→ 保存 → 点「测试」验证
3. 用户端：用户在「我的 → 绑定 Kook 机器人」生成绑定码 → Kook 里私聊机器人发送「绑定 xxxxxx」即完成绑定（绑定后 Kook 按钮操作即代表该用户）
4. 也可用环境变量 `KOOK_BOT_TOKEN` 注入 Token（后台配置优先）；不配置则整个模块自动禁用，Web 功能不受影响

## 本地开发（win11 / mac）

```bash
# 后端
cd server && npm install && npm start        # http://localhost:3000

# 前端（热更新，/api 已配置代理到 3000）
cd web && npm install && npm run dev         # http://localhost:5173
```

## 目录结构

```
pickup-web/
├── server/            # Express 后端
│   └── src/
│       ├── app.js         # 入口（建表+种子数据+启动）
│       ├── models/        # User/Order/Settlement/Setting
│       ├── routes/        # users/orders/admin/public/kook
│       ├── services/      # orderService（订单状态机，Web 与 Kook 共用）
│       ├── kook/          # Kook 机器人（WS 客户端/卡片/事件处理/通知矩阵）
│       ├── middleware/    # auth(JWT)/upload(multer)
│       └── utils/helpers.js  # 算费/脱敏/日期/单号
├── web/               # Vue3 前端
│   └── src/views/     # 登录/下单/订单/支付/大厅/跑单/管理后台
├── Dockerfile         # 多阶段构建（web build → node runtime）
├── docker-compose.yml
└── data/              # 运行数据（git 忽略，卷挂载）
```

## 合规提示（重要）

- **收款**：当前为人工确认模式（收款码截图核对）。经营性收款请尽快办理个体工商户并申请微信/支付宝商家收款码，避免个人收款码被风控。
- **抽成收入**：建议按月记账，依法申报。
- 校园用户多为学生，注意隐私（取件码仅在抢单后可见、电话加密展示）。
