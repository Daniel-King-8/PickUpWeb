/**
 * Agent 接口（Hermes 专用，独立令牌）
 * 权限原则：唯一写操作 = 确认核对（mark-paid）；其余全部只读
 * 鉴权：Header `X-AGENT-TOKEN` 或 ?token=，与 Setting.agentToken 比对
 */
const express = require('express');
const { Order, Setting, Event, AgentLog } = require('../models');

/** 校验令牌 */
async function checkToken(req) {
  const s = await Setting.findOne({ where: { key: 'agentToken' } });
  if (!s || !s.value) return false;
  const token = req.headers['x-agent-token'] || req.query.token || '';
  return s.value === token;
}

function now() {
  return new Date();
}

module.exports = (ctx) => {
  const router = express.Router();

  router.use(async (req, res, next) => {
    if (!(await checkToken(req))) {
      return res.status(401).json({ code: 401, message: 'Agent 令牌无效或未配置' });
    }
    next();
  });

  /** 拉取待播报事件（pending 列表，最近 20 条） */
  router.get('/events', async (req, res) => {
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const list = await Event.findAll({
      where: { status: 'pending' },
      order: [['id', 'ASC']],
      limit,
    });
    return res.json({
      code: 0,
      data: list.map((ev) => {
        let attachments = [];
        try {
          attachments = JSON.parse(ev.payloadJson || '{}').attachments || [];
        } catch (e) {
          /* 忽略 */
        }
        return {
          id: ev.id,
          event: ev.type,
          title: ev.title,
          content: ev.content,
          orderNo: ev.orderNo,
          orderId: ev.orderId,
          attachments,
          ts: ev.createTime,
        };
      }),
    });
  });

  /** 标记已播报（Hermes 发群成功后调用，防重播） */
  router.post('/events/:id/acked', async (req, res) => {
    const ev = await Event.findByPk(req.params.id);
    if (!ev) return res.status(404).json({ code: 404, message: '事件不存在' });
    if (ev.status === 'pending') {
      await ev.update({ status: 'done', ackedAt: now() });
    }
    return res.json({ code: 0, data: { success: true } });
  });

  /** 只读：订单清单（?status=PAYING 兜底查询） */
  router.get('/orders', async (req, res) => {
    const { status = '' } = req.query;
    const where = status ? { status } : {};
    const list = await Order.findAll({ where, order: [['id', 'DESC']], limit: 50 });
    return res.json({ code: 0, data: list });
  });

  /** 只读：单笔订单（含付款截图 URL） */
  router.get('/order/:id', async (req, res) => {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
    return res.json({ code: 0, data: order });
  });

  /**
   * 唯一写操作：确认核对（PAYING → PAID）
   * - 幂等：已核对过的返回 already=true，不报错
   * - 成功后写入审计日志
   */
  router.post('/orders/:id/mark-paid', async (req, res) => {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });

    if (order.status === 'PAID') {
      return res.json({ code: 0, data: { success: true, already: true } });
    }
    const [affected] = await Order.update(
      { status: 'PAID', paidAt: now() },
      { where: { id: order.id, status: 'PAYING' } }
    );
    if (affected !== 1) {
      return res.status(400).json({ code: 400, message: '订单状态不是待支付' });
    }
    // 审计留痕
    await AgentLog.create({
      action: 'mark-paid',
      orderId: order.id,
      detail: `Hermes 确认核对 ${order.orderNo}`,
      createTime: now(),
    });
    // 订单发布到大厅：emit order.published 通知猎头
    const { emitEvent } = require('../utils/events');
    await emitEvent({
      type: 'order.published',
      title: '🎯 悬赏已发布到大厅',
      content: `雇主 ${order.publisherId ? '' : ''}${order.orderNo} · ¥${order.reward.toFixed(2)} · ${order.station} · 送至 ${order.deliverPlace}`,
      orderNo: order.orderNo,
      orderId: order.id,
    });
    return res.json({ code: 0, data: { success: true, already: false } });
  });

  return router;
};
