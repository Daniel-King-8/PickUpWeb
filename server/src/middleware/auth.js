/**
 * 登录鉴权中间件
 * - auth：需要登录（雇主/跑腿员/管理员通用）
 * - authAdmin：仅管理员
 */
const jwt = require('jsonwebtoken');
const { User } = require('../models');

const SECRET = process.env.JWT_SECRET || 'pickup-web-secret-change-me';

/** 生成 token */
function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '7d' });
}

/** 从请求头解析 token → req.user */
function resolveUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || '');
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch (e) {
    return null;
  }
}

/** 需登录 */
function auth(req, res, next) {
  const payload = resolveUser(req);
  if (!payload) return res.status(401).json({ code: 401, message: '请先登录' });
  req.user = payload;
  next();
}

/** 需管理员 */
async function authAdmin(req, res, next) {
  const payload = resolveUser(req);
  if (!payload) return res.status(401).json({ code: 401, message: '请先登录' });
  const user = await User.findByPk(payload.id);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ code: 403, message: '需要管理员权限' });
  }
  req.user = payload;
  next();
}

module.exports = { auth, authAdmin, signToken };
