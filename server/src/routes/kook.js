/**
 * Kook 绑定接口（用户侧，需登录）：
 * - POST /bind-code  生成 6 位绑定码（该码在 Kook 私聊/任意频道发「绑定 xxxxxx」完成绑定）
 * - POST /unbind     解绑自己的 Kook
 * - GET  /status     是否已绑定（kookId 打码展示）
 */
const express = require('express');
const { User } = require('../models');
const kook = require('../kook');

module.exports = (ctx) => {
  const router = express.Router();
  const { auth } = ctx;

  /** 生成绑定码（10 分钟过期；同账号只有一个有效码） */
  router.post('/bind-code', auth, async (req, res) => {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(401).json({ code: 401, message: '用户不存在' });
    if (user.kookId) {
      return res.status(400).json({ code: 400, message: `已绑定 Kook 用户 ${user.kookId}，如需更换请先解绑` });
    }
    const { code, expireAt } = kook.createBindCode(user.id);
    return res.json({ code: 0, data: { code, expireAt } });
  });

  /** 自助解绑 */
  router.post('/unbind', auth, async (req, res) => {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(401).json({ code: 401, message: '用户不存在' });
    await user.update({ kookId: null });
    return res.json({ code: 0, data: { success: true } });
  });

  /** 绑定状态 */
  router.get('/status', auth, async (req, res) => {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(401).json({ code: 401, message: '用户不存在' });
    // kookId 打码展示（保留后 4 位），避免泄露完整 Kook 用户 ID
    const kookId = user.kookId || '';
    const masked = kookId ? `****${kookId.slice(-4)}` : '';
    return res.json({ code: 0, data: { bound: !!user.kookId, kookId: masked } });
  });

  return router;
};
