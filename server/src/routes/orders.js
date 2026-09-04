/**
 * 订单接口（用户侧）：
 * - 下单（后端按费率规则自动算费）
 * - 上传付款截图（待支付）
 * - 我的订单（雇主视角）/ 我的跑单（跑腿员视角）/ 接单大厅
 * - 抢单（CAS 防重复，抢单后取件码可见）
 * - 送达（跑腿员上传送达照片）
 * - 雇主确认收货
 * - 雇主取消（仅待支付/待接单）
 *
 * 取值码码权限：大厅列表全脱敏；详情仅 雇主/已抢单跑腿员 可见明文
 */
const express = require('express');
const { Order, Setting, User } = require('../models');
const { uploadImage } = require('../middleware/upload');
const { maskCode, generateOrderNo, calcFee } = require('../utils/helpers');

module.exports = (ctx) => {
  const router = express.Router();
  const { auth } = ctx;

  /** 读费率规则（按校区取；兼容旧格式未分级数据） */
  async function getFeeRulesForCampus(campus) {
    const s = await Setting.findOne({ where: { key: 'feeRules' } });
    if (!s) return null;
    let data;
    try {
      data = JSON.parse(s.value);
    } catch (e) {
      return null;
    }
    if (data && data.campuses) {
      return data.campuses[campus] || data.campuses.scyz || null;
    }
    // 旧格式：未按校区分级，两校区共用
    return data;
  }

  /** 下单 */
  router.post('/', auth, async (req, res) => {
    const { station, pickupCode, deliverPlace, contactPhone, remark = '' } = req.body || {};
    if (!station || !pickupCode || !deliverPlace || !contactPhone) {
      return res.status(400).json({ code: 400, message: '请填写完整信息' });
    }
    // 【校区硬隔离】订单校区从用户档案继承（前端不可传，服务端为准）
    const user = await User.findByPk(req.user.id);
    if (!user || !user.campus) {
      return res.status(400).json({ code: 400, message: '请先选择所在校区' });
    }
    const rules = await getFeeRulesForCampus(user.campus);
    if (!rules) return res.status(500).json({ code: 500, message: '费率未配置，联系管理员' });
    const { reward: baseReward, fee } = calcFee(rules);

    // 悬赏金额：雇主可自定义，最低 = 1 + 平台费（跑腿员保底 + 平台费）
    let reward = baseReward;
    const custom = Number(req.body.reward);
    if (req.body.reward !== undefined && req.body.reward !== null && req.body.reward !== '') {
      if (Number.isNaN(custom) || custom < baseReward) {
        return res.status(400).json({
          code: 400,
          message: `悬赏金额不得低于 ${baseReward.toFixed(2)} 元（基础 ¥1 + 平台费 ¥${fee.toFixed(2)}）`,
        });
      }
      if (custom > 500) {
        return res.status(400).json({ code: 400, message: '悬赏金额最高 500 元' });
      }
      reward = Number(custom.toFixed(2));
    }

    const order = await Order.create({
      orderNo: generateOrderNo(),
      campus: user.campus,
      station: String(station).slice(0, 50),
      pickupCode: String(pickupCode).slice(0, 50),
      deliverPlace: String(deliverPlace).slice(0, 100),
      contactPhone: String(contactPhone).slice(0, 20),
      remark: String(remark).slice(0, 255),
      reward,
      fee,
      status: 'PAYING',
      publisherId: req.user.id,
    });
    return res.json({ code: 0, data: { orderId: order.id, orderNo: order.orderNo, reward, fee } });
  });

  /** 订单列表附交易对手信息（publisherUid 等，供页面显示对方 ID） */
  async function attachUserInfo(list) {
    const ids = [];
    list.forEach((o) => {
      if (o.publisherId) ids.push(o.publisherId);
      if (o.runnerId) ids.push(o.runnerId);
    });
    if (ids.length === 0) return list;
    const uniq = [...new Set(ids)];
    const users = await User.findAll({ where: { id: uniq } });
    const umap = {};
    users.forEach((u) => {
      umap[u.id] = { uid: u.uid, username: u.username };
    });
    return list.map((o) => {
      const p = umap[o.publisherId];
      const r = umap[o.runnerId];
      return {
        ...o.toJSON(),
        publisherUid: p ? p.uid : '',
        publisherName: p ? p.username : '',
        runnerUid: r ? r.uid : '',
        runnerName: r ? r.username : '',
      };
    });
  }

  /** 我的订单（雇主视角） */
  router.get('/mine', auth, async (req, res) => {
    const list = await Order.findAll({
      where: { publisherId: req.user.id },
      order: [['id', 'DESC']],
    });
    return res.json({ code: 0, data: await attachUserInfo(list) });
  });

  /** 我的跑单（跑腿员视角） */
  router.get('/run-mine', auth, async (req, res) => {
    const list = await Order.findAll({
      where: { runnerId: req.user.id },
      order: [['id', 'DESC']],
    });
    return res.json({ code: 0, data: await attachUserInfo(list) });
  });

  /** 接单大厅（已支付待接单；取件码全脱敏；【校区隔离】仅本校区订单） */
  router.get('/hall', auth, async (req, res) => {
    const user = await User.findByPk(req.user.id);
    if (!user || !user.campus) {
      return res.status(400).json({ code: 400, message: '请先选择所在校区' });
    }
    let list = await Order.findAll({
      where: { status: 'PAID', campus: user.campus },
      order: [['id', 'ASC']],
    });
    // 大厅展示：取件码打码，不暴露联系电话
    list = list.map((o) => ({
      ...o.toJSON(),
      pickupCode: maskCode(o.pickupCode),
      contactPhone: maskCode(o.contactPhone),
      canAccept: o.publisherId !== req.user.id, // 不能接自己的单
    }));
    return res.json({ code: 0, data: list });
  });

  /**
   * 订单详情
   * 权限：雇主 / 已抢单跑腿员 可看取件码明文；其他用户脱敏 + 隐藏电话
   */
  router.get('/:id', auth, async (req, res) => {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
    const [json] = await attachUserInfo([order]);
    const isPublisher = order.publisherId === req.user.id;
    const isRunner = order.runnerId === req.user.id;
    if (!isPublisher && !isRunner) {
      json.pickupCode = maskCode(order.pickupCode);
      json.contactPhone = '';
    }
    json.canAccept = order.status === 'PAID' && order.publisherId !== req.user.id;
    return res.json({ code: 0, data: json });
  });

  /** 上传付款截图（PAYING → 等待管理员确认，不改变状态） */
  router.post('/:id/pay-upload', auth, uploadImage, async (req, res) => {
    if (!req.file) return res.status(400).json({ code: 400, message: '请选择图片' });
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
    if (order.publisherId !== req.user.id) {
      return res.status(403).json({ code: 403, message: '无权限操作该订单' });
    }
    await order.update({ payerScreenshot: `/uploads/${req.file.filename}` });
    return res.json({ code: 0, data: { screenshot: order.payerScreenshot } });
  });

  /**
   * 抢单（CAS 原子更新：仅 PAID 且无跑腿员时成功）
   * 防重复抢单：Sequelize update where 条件含 status='PAID' && runnerId=null，
   * 影响行数 ≠1 即被他人抢走
   */
  router.post('/:id/accept', auth, async (req, res) => {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
    if (order.publisherId === req.user.id) {
      return res.status(400).json({ code: 400, message: '不能接自己发布的单' });
    }
    const [affected] = await Order.update(
      { runnerId: req.user.id, status: 'ACCEPTED', acceptedAt: new Date() },
      { where: { id: order.id, status: 'PAID', runnerId: null } }
    );
    if (affected !== 1) {
      return res.status(400).json({ code: 400, message: '手慢了，订单已被接走' });
    }
    return res.json({ code: 0, data: { success: true } });
  });

  /** 送达：跑腿员上传照片并标记已完成（ACCEPTED → DELIVERED） */
  router.post('/:id/deliver', auth, uploadImage, async (req, res) => {
    if (!req.file) return res.status(400).json({ code: 400, message: '请选择送达照片' });
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
    if (order.runnerId !== req.user.id) {
      return res.status(403).json({ code: 403, message: '只有跑腿员可标记送达' });
    }
    const [affected] = await Order.update(
      { deliveryPhoto: `/uploads/${req.file.filename}`, status: 'DELIVERED', deliveredAt: new Date() },
      { where: { id: order.id, status: 'ACCEPTED', runnerId: req.user.id } }
    );
    if (affected !== 1) {
      return res.status(400).json({ code: 400, message: '当前状态不允许操作' });
    }
    return res.json({ code: 0, data: { success: true } });
  });

  /** 雇主确认收货（DELIVERED → CONFIRMED） */
  router.post('/:id/confirm', auth, async (req, res) => {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
    if (order.publisherId !== req.user.id) {
      return res.status(403).json({ code: 403, message: '只有雇主可确认收货' });
    }
    const [affected] = await Order.update(
      { status: 'CONFIRMED', confirmedAt: new Date() },
      { where: { id: order.id, status: 'DELIVERED', publisherId: req.user.id } }
    );
    if (affected !== 1) {
      return res.status(400).json({ code: 400, message: '当前状态不允许操作' });
    }
    return res.json({ code: 0, data: { success: true } });
  });

  /** 雇主取消（仅 PAYING / 未被接单的 PAID） */
  router.post('/:id/cancel', auth, async (req, res) => {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
    if (order.publisherId !== req.user.id) {
      return res.status(403).json({ code: 403, message: '只有雇主可取消订单' });
    }
    const [affected] = await Order.update(
      { status: 'CANCELED' },
      { where: { id: order.id, status: ['PAYING', 'PAID'], runnerId: null } }
    );
    if (affected !== 1) {
      return res.status(400).json({ code: 400, message: '订单已被接单，请先联系管理员' });
    }
    return res.json({ code: 0, data: { success: true } });
  });

  return router;
};
