/**
 * 用户接口：注册 / 登录 / 当前用户信息 / 选择校区 / 我的统计
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { User, Order } = require('../models');
const { signToken } = require('../middleware/auth');
const { generateUid } = require('../utils/helpers');

/** 允许的校区 id（与 config/campus 保持一致） */
const CAMPUS_ALLOWED = ['scyz', 'cdny'];

module.exports = (ctx) => {
  const router = express.Router();
  const { auth } = ctx;

  /** 返回用户公开字段（不含密码） */
  function publicUser(u) {
    return {
      id: u.id,
      uid: u.uid,
      username: u.username,
      nickname: u.nickname || '',
      role: u.role,
      phone: u.phone,
      campus: u.campus,
      isHunter: !!u.isHunter,
      hunterApplyAt: u.hunterApplyAt || null,
    };
  }

  /** 注册（默认普通用户；管理员由后台种子账号创建） */
  router.post('/register', async (req, res) => {
    const { username, password, phone = '' } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
    }
    if (String(username).length > 50 || String(password).length < 6) {
      return res.status(400).json({ code: 400, message: '密码至少 6 位,用户名最长 50 字符' });
    }
    const exist = await User.findOne({ where: { username } });
    if (exist) {
      return res.status(400).json({ code: 400, message: '用户名已被注册' });
    }
    const user = await User.create({
      uid: generateUid(), // 10 位纯数字用户ID（注册自动生成，保证唯一）
      username,
      password: bcrypt.hashSync(String(password), 10),
      phone: String(phone).slice(0, 20),
      role: 'user',
      campus: '', // 注册后由选择校区页绑定
    });
    return res.json({ code: 0, data: { token: signToken(user), user: publicUser(user) } });
  });

  /** 登录 */
  router.post('/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
    }
    const user = await User.findOne({ where: { username } });
    if (!user || !bcrypt.compareSync(String(password), user.password)) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' });
    }
    return res.json({
      code: 0,
      data: { token: signToken(user), user: publicUser(user) },
    });
  });

  /** 当前登录用户信息 */
  router.get('/me', auth, async (req, res) => {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(401).json({ code: 401, message: '用户不存在' });
    return res.json({ code: 0, data: publicUser(user) });
  });

  /** 选择/切换校区（scyz / cdny），服务端校验白名单 */
  router.post('/campus', auth, async (req, res) => {
    const { campus } = req.body || {};
    if (!CAMPUS_ALLOWED.includes(campus)) {
      return res.status(400).json({ code: 400, message: '校区参数不合法' });
    }
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(401).json({ code: 401, message: '用户不存在' });
    await user.update({ campus });
    return res.json({ code: 0, data: publicUser(user) });
  });

  /**
   * 修改名称（名称即登录账号：张三 → 李四，登录时须使用李四）
   * 校验名称唯一（排除自己），成功后清空旧昵称避免展示残留
   */
  router.put('/profile', auth, async (req, res) => {
    const { name = '' } = req.body || {};
    const newName = String(name).trim();
    if (!newName) return res.status(400).json({ code: 400, message: '名称不能为空' });
    if (newName.length > 50) return res.status(400).json({ code: 400, message: '名称最长 50 字符' });
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(401).json({ code: 401, message: '用户不存在' });
    const exist = await User.findOne({ where: { username: newName } });
    if (exist && exist.id !== user.id) {
      return res.status(400).json({ code: 400, message: '该名称已被使用，请换一个' });
    }
    await user.update({ username: newName, nickname: '' });
    return res.json({ code: 0, data: publicUser(user) });
  });

  /** 申请成为赏金猎人（提交后等待管理员审核） */
  router.post('/hunter-apply', auth, async (req, res) => {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(401).json({ code: 401, message: '用户不存在' });
    if (user.isHunter) return res.status(400).json({ code: 400, message: '你已经是赏金猎人了' });
    if (user.hunterApplyAt) return res.status(400).json({ code: 400, message: '已提交申请，请等待管理员审核' });
    await user.update({ hunterApplyAt: new Date() });
    return res.json({ code: 0, data: publicUser(user) });
  });

  /** 我的统计：累计发布 / 累计完成（跑腿）+ 基本信息 */
  router.get('/stats', auth, async (req, res) => {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(401).json({ code: 401, message: '用户不存在' });
    const [publishTotal, runCompleted, runOngoing] = await Promise.all([
      Order.count({ where: { publisherId: req.user.id } }),
      Order.count({
        where: { runnerId: req.user.id, status: ['CONFIRMED', 'SETTLED'] },
      }),
      Order.count({ where: { runnerId: req.user.id, status: ['ACCEPTED', 'DELIVERED'] } }),
    ]);
    return res.json({
      code: 0,
      data: { ...publicUser(user), publishTotal, runCompleted, runOngoing },
    });
  });

  return router;
};
