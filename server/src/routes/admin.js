/**
 * 管理员接口：
 * - 订单核对（付款截图/标记已支付/取消未接单）
 * - 费率与抽成设置、收款码管理、联系文案
 * - 每日结算单（预览/生成/标记已付）
 * - 用户列表
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Order, Setting, Settlement, User, Event, AgentLog } = require('../models');
const { uploadImage } = require('../middleware/upload');
const { cnToday, generateUid } = require('../utils/helpers');

/** 批量取用户信息并生成 { id -> {name(nickname||username), uid, phone} } map */
async function userMapByIds(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return {};
  const users = await User.findAll({ where: { id: uniq } });
  const map = {};
  users.forEach((u) => {
    map[u.id] = {
      name: u.nickname || u.username,
      username: u.username,
      nickname: u.nickname,
      uid: u.uid,
      phone: u.phone,
    };
  });
  return map;
}

/** 10 位纯数字校验 */
function isUidLike(uid) {
  return /^\d{10}$/.test(String(uid));
}

/** 后台用户返回（不含密码） */
function publicAdminUser(u) {
  return {
    id: u.id,
    uid: u.uid,
    username: u.username,
    nickname: u.nickname || '',
    phone: u.phone,
    role: u.role,
    campus: u.campus,
    isHunter: !!u.isHunter,
    hunterApplyAt: u.hunterApplyAt || null,
  };
}

module.exports = (ctx) => {
  const router = express.Router();
  const { authAdmin } = ctx;

  router.use(authAdmin); // 以下全部需要管理员权限

  /* ---------- 订单核对 ---------- */

  /**
   * 订单列表（支持筛选）：
   * - status：按状态
   * - orderNo：按订单号精确查询
   * - uid：按用户ID查询其发布的全部订单
   * - q：综合查询（KD 单号 / 雇主姓名、ID、电话模糊匹配）
   */
  router.get('/orders', async (req, res) => {
    const { Op } = require('sequelize');
    const { status = '', orderNo = '', uid = '', q = '' } = req.query;
    const where = {};
    if (status) where.status = status;
    if (orderNo) {
      where.orderNo = String(orderNo).slice(0, 32);
    }
    if (uid) {
      const u = await User.findOne({ where: { uid: String(uid) } });
      if (!u) return res.json({ code: 0, data: [] }); // 无此用户 ID → 空列表
      where.publisherId = u.id;
    }
    if (q) {
      const s = String(q).trim();
      if (/^kd/i.test(s)) {
        // KD 开头视为单号
        where.orderNo = s;
      } else {
        // 否则按雇主姓名/ID/电话模糊匹配
        const users = await User.findAll({
          where: {
            [Op.or]: [
              { username: { [Op.like]: `%${s}%` } },
              { uid: s },
              { phone: s },
            ],
          },
        });
        if (users.length === 0) return res.json({ code: 0, data: [] });
        where.publisherId = { [Op.in]: users.map((u) => u.id) };
      }
    }
    const list = await Order.findAll({ where, order: [['id', 'DESC']], limit: 200 });
    // 附用户信息（雇主/跑腿员姓名、10 位用户ID、联系电话）
    const umap = await userMapByIds(list.flatMap((o) => [o.publisherId, o.runnerId]));
    return res.json({
      code: 0,
      data: list.map((o) => ({
        ...o.toJSON(),
        publisherName: umap[o.publisherId] ? umap[o.publisherId].name : '',
        publisherUid: umap[o.publisherId] ? umap[o.publisherId].uid : String(o.publisherId || ''),
        publisherPhone: umap[o.publisherId] ? umap[o.publisherId].phone : '',
        runnerName: umap[o.runnerId] ? umap[o.runnerId].name : '',
        runnerUid: umap[o.runnerId] ? umap[o.runnerId].uid : String(o.runnerId || ''),
        runnerPhone: umap[o.runnerId] ? umap[o.runnerId].phone : '',
      })),
    });
  });

  /** 核对后标记已支付（PAYING → PAID，订单进入待接单） */
  router.post('/orders/:id/mark-paid', async (req, res) => {
    const [affected] = await Order.update(
      { status: 'PAID', paidAt: new Date() },
      { where: { id: req.params.id, status: 'PAYING' } }
    );
    if (affected !== 1) return res.status(400).json({ code: 400, message: '订单状态不是待支付' });
    return res.json({ code: 0, data: { success: true } });
  });

  /** 管理员取消任意未完成订单（PAYING/PAID/ACCEPTED/DELIVERED） */
  router.post('/orders/:id/cancel', async (req, res) => {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
    if (['CANCELED', 'CONFIRMED', 'SETTLED'].includes(order.status)) {
      return res.status(400).json({ code: 400, message: '该订单不可取消' });
    }
    await order.update({ status: 'CANCELED' });
    return res.json({ code: 0, data: { success: true } });
  });

  /** 删除订单（物理删除记录，并尽力清理其上传文件） */
  router.delete('/orders/:id', async (req, res) => {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
    // 清理该订单上传的截图/照片（尽力而为，文件不存在时忽略）
    const uploadDir = process.env.UPLOAD_DIR || '/data/uploads';
    [order.payerScreenshot, order.deliveryPhoto].forEach((filePath) => {
      if (!filePath) return;
      try {
        const full = path.join(uploadDir, path.basename(filePath));
        fs.unlinkSync(full);
      } catch (e) {
        /* 文件不存在等，忽略 */
      }
    });
    await order.destroy();
    return res.json({ code: 0, data: { success: true } });
  });

  /* ---------- 设置 ---------- */

  /** 读取设置（全部 key：费率/收款码/文案） */
  router.get('/settings', async (req, res) => {
    const list = await Setting.findAll();
    return res.json({ code: 0, data: list });
  });

  /** 更新设置（key 传 body：{ key, value }，value 为字符串或 JSON） */
  router.put('/settings', async (req, res) => {
    const { key, value } = req.body || {};
    const s = await Setting.findOne({ where: { key } });
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    if (s) {
      await s.update({ value: data });
    } else {
      await Setting.create({ key, value: data });
    }
    return res.json({ code: 0, data: { success: true } });
  });

  /** 上传收款码图片（type: wx | alipay） */
  router.post('/upload-qr', uploadImage, async (req, res) => {
    if (!req.file) return res.status(400).json({ code: 400, message: '请选择图片' });
    const type = req.body.type === 'alipay' ? 'payQrAlipay' : 'payQrWx';
    const s = await Setting.findOne({ where: { key: type } });
    if (s) {
      await s.update({ value: `/uploads/${req.file.filename}` });
    } else {
      await Setting.create({ key: type, value: `/uploads/${req.file.filename}` });
    }
    return res.json({ code: 0, data: { url: `/uploads/${req.file.filename}` } });
  });

  /* ---------- 每日结算 ---------- */

  /**
   * 结算预览：统计指定日期（默认今天，北京时间）确认收货、且未进入结算单的订单
   * 按跑腿员分组：应得 = 跑腿费合计 - 抽成合计
   */
  router.get('/settlements/preview', async (req, res) => {
    const date = req.query.date || cnToday();
    const start = new Date(`${date}T00:00:00+08:00`);
    const end = new Date(`${date}T23:59:59+08:00`);
    const orders = await Order.findAll({
      where: {
        status: 'CONFIRMED',
        confirmedAt: { [require('sequelize').Op.between]: [start, end] },
        settledInId: null,
      },
    });
    const byRunner = {};
    for (const o of orders) {
      if (!byRunner[o.runnerId]) {
        byRunner[o.runnerId] = { runnerId: o.runnerId, totalReward: 0, totalFee: 0, count: 0, orderIds: [] };
      }
      const g = byRunner[o.runnerId];
      g.totalReward += o.reward;
      g.totalFee += o.fee;
      g.count += 1;
      g.orderIds.push(o.id);
    }
    const groups = Object.values(byRunner).map((g) => ({
      ...g,
      totalReward: Number(g.totalReward.toFixed(2)),
      totalFee: Number(g.totalFee.toFixed(2)),
      netPay: Number((g.totalReward - g.totalFee).toFixed(2)),
    }));
    // 附上跑腿员信息（姓名/用户ID/电话），管理员转账时知道给谁
    const umap = await userMapByIds(groups.map((g) => g.runnerId));
    groups.forEach((g) => {
      const u = umap[g.runnerId];
      g.runnerName = u ? u.username : '用户已注销';
      g.runnerUid = u ? u.uid : String(g.runnerId);
      g.runnerPhone = u ? u.phone : '';
    });
    return res.json({ code: 0, data: { date, groups, totalCount: orders.length } });
  });

  /** 生成结算单：预览数据落库，并把订单标记为 SETTLED */
  router.post('/settlements/generate', async (req, res) => {
    const date = req.body.date || cnToday();
    // 防重复：该日已有未付结算单（含该跑腿员）则拒绝
    const exist = await Settlement.findOne({ where: { settleDate: date, status: 'pending' } });
    if (exist) {
      return res.status(400).json({ code: 400, message: `${date} 已有待付结算单，请先处理` });
    }
    // 重新拉预览数据（与 preview 相同逻辑，改用 Op.between）
    const start = new Date(`${date}T00:00:00+08:00`);
    const end = new Date(`${date}T23:59:59+08:00`);
    const orders = await Order.findAll({
      where: {
        status: 'CONFIRMED',
        confirmedAt: { [require('sequelize').Op.between]: [start, end] },
        settledInId: null,
      },
    });
    const byRunner = {};
    for (const o of orders) {
      if (!byRunner[o.runnerId]) byRunner[o.runnerId] = [];
      byRunner[o.runnerId].push(o);
    }
    const created = [];
    for (const [runnerId, os] of Object.entries(byRunner)) {
      const totalReward = Number(os.reduce((s, o) => s + o.reward, 0).toFixed(2));
      const totalFee = Number(os.reduce((s, o) => s + o.fee, 0).toFixed(2));
      const settlement = await Settlement.create({
        settleDate: date,
        runnerId: Number(runnerId),
        totalReward,
        totalFee,
        netPay: Number((totalReward - totalFee).toFixed(2)),
        orderIdsJson: JSON.stringify(os.map((o) => o.id)),
        status: 'pending',
      });
      await Order.update(
        { status: 'SETTLED', settledAt: new Date(), settledInId: settlement.id },
        { where: { id: os.map((o) => o.id) } }
      );
      created.push(settlement.id);
    }
    // 出站事件：结算单已生成（提醒管理员转账）
    if (created.length > 0) {
      const { emitEvent } = require('../utils/events');
      await emitEvent({
        type: 'settlement.created',
        title: '💰 当日结算单已生成',
        content: `${date} 共 ${created.length} 张结算单，请核对后线下转账`,
        orderNo: '',
        orderId: null,
      });
    }
    return res.json({ code: 0, data: { created, count: created.length } });
  });

  /** 结算单列表（按日期倒序，附跑腿员信息） */
  router.get('/settlements', async (req, res) => {
    const list = await Settlement.findAll({ order: [['id', 'DESC']], limit: 100 });
    const umap = await userMapByIds(list.map((s) => s.runnerId));
    return res.json({
      code: 0,
      data: list.map((s) => {
        const u = umap[s.runnerId];
        return {
          ...s.toJSON(),
          runnerName: u ? (u.nickname || u.username) : '用户已注销',
          runnerUid: u ? u.uid : String(s.runnerId),
          runnerPhone: u ? u.phone : '',
        };
      }),
    });
  });

  /** 标记结算单已付（管理员线下转账后操作） */
  router.post('/settlements/:id/mark-paid', async (req, res) => {
    const s = await Settlement.findByPk(req.params.id);
    if (!s) return res.status(404).json({ code: 404, message: '结算单不存在' });
    await s.update({ status: 'paid', paidAt: new Date() });
    return res.json({ code: 0, data: { success: true } });
  });

  /* ---------- Hermes Agent 对接 ---------- */

  /** 获取 Agent token 状态（不返回明文，仅是否已配置） */
  router.get('/agent', async (req, res) => {
    const s = await Setting.findOne({ where: { key: 'agentToken' } });
    const logCount = await AgentLog.count();
    return res.json({
      code: 0,
      data: {
        enabled: !!(s && s.value),
        tokenPreview: s && s.value ? `${s.value.slice(0, 6)}****${s.value.slice(-4)}` : '',
        logCount,
      },
    });
  });

  /** 生成/重置 Agent token（返回明文一次，请立即保存给 Hermes） */
  router.post('/agent/token', async (req, res) => {
    const crypto = require('crypto');
    const token = crypto.randomBytes(24).toString('hex'); // 48 位 hex
    const s = await Setting.findOne({ where: { key: 'agentToken' } });
    if (s) await s.update({ value: token });
    else await Setting.create({ key: 'agentToken', value: token });
    return res.json({ code: 0, data: { token } });
  });

  /** 禁用 Agent（清除 token） */
  router.delete('/agent/token', async (req, res) => {
    const s = await Setting.findOne({ where: { key: 'agentToken' } });
    if (s) await s.update({ value: '' });
    return res.json({ code: 0, data: { success: true } });
  });

  /** 事件队列记录（设置页展示） */
  router.get('/agent/events', async (req, res) => {
    const list = await Event.findAll({
      order: [['id', 'DESC']],
      limit: 30,
      attributes: ['id', 'type', 'title', 'orderNo', 'status', 'createTime', 'ackedAt'],
    });
    return res.json({ code: 0, data: list });
  });

  /** 测试事件：发一条验证 Hermes 链路 */
  router.post('/agent/test', async (req, res) => {
    const { emitEvent } = require('../utils/events');
    await emitEvent({
      type: 'agent.test',
      title: '🧪 Hermes 测试事件',
      content: `来自取个件呗 · 时间 ${require('../utils/helpers').cnToday()}`,
      orderNo: '',
      orderId: null,
    });
    return res.json({ code: 0, data: { success: true } });
  });

  /* ---------- 用户管理 ---------- */

  /** 新增用户（管理员创建账号，可指定/自动生成用户ID与猎头身份） */
  router.post('/users', async (req, res) => {
    const { username, password, phone = '', campus = '', isHunter = false, uid } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '用户名和密码必填' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ code: 400, message: '密码至少 6 位' });
    }
    const exist = await User.findOne({ where: { username } });
    if (exist) return res.status(400).json({ code: 400, message: '用户名已被占用' });
    // 用户ID：支持留空自动生成 / 指定 10 位纯数字（唯一）
    let finalUid = generateUid();
    if (uid !== undefined && uid !== '') {
      if (!isUidLike(uid)) return res.status(400).json({ code: 400, message: '用户ID必须是 10 位纯数字' });
      const hit = await User.findOne({ where: { uid: String(uid) } });
      if (hit) return res.status(400).json({ code: 400, message: '该用户ID已被占用' });
      finalUid = String(uid);
    }
    const user = await User.create({
      uid: finalUid,
      username,
      password: bcrypt.hashSync(String(password), 10),
      phone: String(phone).slice(0, 20),
      role: 'user',
      campus: ['scyz', 'cdny'].includes(campus) ? campus : '',
      isHunter: !!isHunter,
      hunterApplyAt: null,
    });
    return res.json({ code: 0, data: publicAdminUser(user) });
  });

  router.get('/users', async (req, res) => {
    const list = await User.findAll({
      attributes: ['id', 'uid', 'username', 'nickname', 'phone', 'role', 'campus', 'isHunter', 'hunterApplyAt', 'createdAt'],
      order: [['id', 'DESC']],
    });
    return res.json({ code: 0, data: list });
  });

  /** 赏金猎人申请列表（待审核） */
  router.get('/hunter-applications', async (req, res) => {
    const { Op } = require('sequelize');
    const list = await User.findAll({
      where: { hunterApplyAt: { [Op.ne]: null } },
      attributes: ['id', 'uid', 'username', 'nickname', 'phone', 'campus', 'hunterApplyAt'],
      order: [['hunterApplyAt', 'DESC']],
    });
    return res.json({ code: 0, data: list });
  });

  /** 同意申请：授予赏金猎人身份 */
  router.post('/hunter/:id/approve', async (req, res) => {
    const u = await User.findByPk(req.params.id);
    if (!u) return res.status(404).json({ code: 404, message: '用户不存在' });
    await u.update({ isHunter: true, hunterApplyAt: null });
    return res.json({ code: 0, data: { success: true } });
  });

  /** 拒绝申请：清除申请记录（用户可重新申请） */
  router.post('/hunter/:id/reject', async (req, res) => {
    const u = await User.findByPk(req.params.id);
    if (!u) return res.status(404).json({ code: 404, message: '用户不存在' });
    await u.update({ hunterApplyAt: null });
    return res.json({ code: 0, data: { success: true } });
  });

  /** 编辑用户（用户名/手机号/校区/用户ID） */
  router.put('/users/:id', async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });

    const { username, phone, campus, uid, isHunter } = req.body || {};
    // 用户名唯一
    if (username !== undefined && String(username) !== user.username) {
      const exist = await User.findOne({ where: { username } });
      if (exist) return res.status(400).json({ code: 400, message: '用户名已被占用' });
      user.username = String(username).slice(0, 50);
    }
    // 用户ID：10 位纯数字且唯一
    if (uid !== undefined && String(uid) !== user.uid) {
      if (!isUidLike(uid)) {
        return res.status(400).json({ code: 400, message: '用户ID必须是 10 位纯数字' });
      }
      const exist = await User.findOne({ where: { uid } });
      if (exist) return res.status(400).json({ code: 400, message: '该用户ID已被占用' });
      user.uid = String(uid);
    }
    if (phone !== undefined) user.phone = String(phone).slice(0, 20);
    if (campus !== undefined) user.campus = ['scyz', 'cdny'].includes(campus) ? campus : user.campus;
    if (isHunter !== undefined) user.isHunter = !!isHunter;
    await user.save();
    return res.json({ code: 0, data: publicAdminUser(user) });
  });

  /** 重置密码（管理员设置新密码） */
  router.put('/users/:id/password', async (req, res) => {
    const { password } = req.body || {};
    if (!password || String(password).length < 6) {
      return res.status(400).json({ code: 400, message: '密码至少 6 位' });
    }
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });
    user.password = bcrypt.hashSync(String(password), 10);
    await user.save();
    return res.json({ code: 0, data: { success: true } });
  });

  /** 删除用户（不能删自己/其他管理员） */
  router.delete('/users/:id', async (req, res) => {
    const target = await User.findByPk(req.params.id);
    if (!target) return res.status(404).json({ code: 404, message: '用户不存在' });
    if (target.id === req.user.id) {
      return res.status(400).json({ code: 400, message: '不能删除自己' });
    }
    if (target.role === 'admin') {
      return res.status(400).json({ code: 400, message: '不能删除管理员账号' });
    }
    await target.destroy();
    return res.json({ code: 0, data: { success: true } });
  });

  return router;
};
