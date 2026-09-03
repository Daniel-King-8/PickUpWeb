/**
 * 管理员接口：
 * - 订单核对（付款截图/标记已支付/取消未接单）
 * - 费率与抽成设置、收款码管理、联系文案
 * - 每日结算单（预览/生成/标记已付）
 * - 用户列表
 */
const express = require('express');
const { Order, Setting, Settlement, User } = require('../models');
const { uploadImage } = require('../middleware/upload');
const { cnToday } = require('../utils/helpers');

module.exports = (ctx) => {
  const router = express.Router();
  const { authAdmin } = ctx;

  router.use(authAdmin); // 以下全部需要管理员权限

  /* ---------- 订单核对 ---------- */

  /** 订单列表（默认按状态筛选，含付款截图地址，供核对） */
  router.get('/orders', async (req, res) => {
    const { status = '' } = req.query;
    const where = status ? { status } : {};
    const list = await Order.findAll({ where, order: [['id', 'DESC']], limit: 200 });
    return res.json({ code: 0, data: list });
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
    return res.json({ code: 0, data: { created, count: created.length } });
  });

  /** 结算单列表（按日期倒序） */
  router.get('/settlements', async (req, res) => {
    const list = await Settlement.findAll({ order: [['id', 'DESC']], limit: 100 });
    return res.json({ code: 0, data: list });
  });

  /** 标记结算单已付（管理员线下转账后操作） */
  router.post('/settlements/:id/mark-paid', async (req, res) => {
    const s = await Settlement.findByPk(req.params.id);
    if (!s) return res.status(404).json({ code: 404, message: '结算单不存在' });
    await s.update({ status: 'paid', paidAt: new Date() });
    return res.json({ code: 0, data: { success: true } });
  });

  /* ---------- 用户 ---------- */

  router.get('/users', async (req, res) => {
    const list = await User.findAll({
      attributes: ['id', 'username', 'phone', 'role', 'createdAt'],
      order: [['id', 'DESC']],
    });
    return res.json({ code: 0, data: list });
  });

  return router;
};
