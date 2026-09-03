/**
 * 用户接口：注册 / 登录 / 当前用户信息
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { signToken } = require('../middleware/auth');

module.exports = (ctx) => {
  const router = express.Router();
  const { auth } = ctx;

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
      username,
      password: bcrypt.hashSync(String(password), 10),
      phone: String(phone).slice(0, 20),
      role: 'user',
    });
    return res.json({ code: 0, data: { token: signToken(user), user: { id: user.id, username: user.username, role: user.role } } });
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
      data: {
        token: signToken(user),
        user: { id: user.id, username: user.username, role: user.role, phone: user.phone },
      },
    });
  });

  /** 当前登录用户信息 */
  router.get('/me', auth, async (req, res) => {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(401).json({ code: 401, message: '用户不存在' });
    return res.json({
      code: 0,
      data: { id: user.id, username: user.username, role: user.role, phone: user.phone },
    });
  });

  return router;
};
