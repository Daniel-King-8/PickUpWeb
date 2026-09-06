/**
 * 出站事件工具：业务动作 → events 出站队列
 * Hermes 通过 GET /api/agent/events 拉取未播报事件，播完调 acked 标记
 */
const { Event } = require('../models');

/**
 * 写入/更新待播报事件
 * - 同一订单的同一类事件若还有 pending 未播报，则合并更新（如"待核对"先发布后补截图的场景）
 * @param {object} e { type, title, content, orderNo, orderId, attachments[] }
 */
async function emitEvent(e) {
  const { type, title, content, orderNo = '', orderId = null, attachments = [] } = e;
  const now = new Date();
  // 同一订单未播报的同类型事件：合并（更新内容/附件）
  if (orderId) {
    const exist = await Event.findOne({
      where: { type, orderId, status: 'pending' },
      order: [['id', 'DESC']],
    });
    if (exist) {
      return exist.update({
        title,
        content,
        orderNo,
        payloadJson: JSON.stringify({ attachments }),
        createTime: exist.createTime || now,
      });
    }
  }
  return Event.create({
    type,
    title,
    content,
    orderNo,
    orderId,
    payloadJson: JSON.stringify({ attachments }),
    status: 'pending',
    createTime: now,
  });
}

module.exports = { emitEvent };
