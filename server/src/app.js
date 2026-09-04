/**
 * 取个件呗 Web 版 —— Express 服务入口
 *
 * - 服务 API（/api）
 * - 托管前端构建产物（/public）
 * - 上传文件（/uploads）
 * - 启动时自动建表 + 初始化 admin 管理员与默认费率设置
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { User, Setting } = require('./models');
const { generateUid } = require('./utils/helpers');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));

// 前端构建产物（Vite build 后由后端托管，单容器即单服务）
app.use(express.static(path.join(__dirname, '../../web/dist')));

// 上传目录（付款截图/送达照片）——Docker 中挂载卷持久化
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../data/uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

/** 登录鉴权中间件（JWT） */
const { auth, authAdmin } = require('./middleware/auth');
app.use('/api', require('./routes')({ auth, authAdmin }));

// 前端路由（单页应用 history 模式兜底；API/静态资源除外）
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  const indexHtml = path.join(__dirname, '../../web/dist/index.html');
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.status(200).send('前端未构建：请在 web/ 目录执行 npm run build');
  }
});

/**
 * 初始化：建表 + 种子数据
 * - admin 管理员账号（用户名 admin / 密码请在部署时设为 ADMIN_PASSWORD 环境变量）
 * - 默认费率与抽成规则
 */
async function bootstrap() {
  await db.sync({ alter: true }); // 建表（alter 方便开发期结构变化，正式环境可去掉）

  // 1. 管理员账号（幂等）
  const adminCount = await User.count({ where: { role: 'admin' } });
  if (adminCount === 0) {
    const pwd = process.env.ADMIN_PASSWORD || 'admin123456';
    await User.create({
      uid: generateUid(),
      username: 'admin',
      password: bcrypt.hashSync(pwd, 10),
      role: 'admin',
    });
    console.log(`[init] 已创建管理员账号 admin（默认密码 ${pwd}，部署时请用 ADMIN_PASSWORD 环境变量覆盖并尽快修改）`);
  }

  // 1.1 存量用户补齐 uid（升级兼容：早期注册的无 10 位 ID）
  const noUid = await User.findAll({ where: { uid: null } });
  for (const u of noUid) {
    let uid = generateUid();
    // 冲突重试一次
    if (await User.count({ where: { uid } }) > 0) uid = generateUid();
    await u.update({ uid });
    console.log(`[init] 为用户 ${u.username} 补齐 uid=${uid}`);
  }

  // 2. 默认费率设置（幂等）
  const defaults = {
    // 费率规则（按校区独立配置）：
    // 每单总价 = 基础 ¥1（跑腿员保底） + 平台费（后台可调，平台收入）
    // stations/destinations 为下单选项（名称列表，不参与计价）
    feeRules: JSON.stringify({
      campuses: {
        scyz: {
          platformFee: 1.5,
          stations: ['菜鸟驿站', '顺丰驿站', '韵达驿站', '京东驿站'],
          destinations: ['1-5号楼', '6-11号楼', '12号楼以上'],
        },
        cdny: {
          platformFee: 1.5,
          stations: ['菜鸟驿站', '顺丰驿站', '韵达驿站', '京东驿站'],
          destinations: ['1-5号楼', '6-11号楼', '12号楼以上'],
        },
      },
    }),
    payQrWx: '', // 微信收款码图片路径（管理后台上传）
    payQrAlipay: '', // 支付宝收款码图片路径
    contactWechat: '请添加微信好友发单支付', // 加微信支付引导文案
  };
  for (const [key, value] of Object.entries(defaults)) {
    const exist = await Setting.findOne({ where: { key } });
    if (!exist) {
      await Setting.create({ key, value });
    }
  }
  console.log('[init] 默认设置已就绪');
}

bootstrap()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] 取个件呗 Web 版启动成功: http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[server] 启动失败:', err);
    process.exit(1);
  });
