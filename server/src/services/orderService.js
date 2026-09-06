/**
 * 订单状态迁移服务（Web 路由与 Kook 机器人按钮共用）
 *
 * - CAS 条件更新语义原样保留：update 的 where 不改变，affected !== 1 即冲突，
 *   这是平台防重复抢单/防并发操作的唯一机制（不用事务，不"优化"）。
 * - 统一返回 { ok:true, order } | { ok:false, code, message }；
 *   HTTP 层映射状态码与文案，避免 Web 响应与现状不一致。
 * - 成功分支末尾统一触发 Kook 通知（notifyOrderEvent，幂等降级，失败不影响业务）。
 */
const { Order, User } = require('../models');
const kook = require('../kook');

/** 订单状态操作返回码 → 用户可读文案（与既有路由文案保持一字不差） */
const MESSAGES = {
  NOT_FOUND: '订单不存在',
  ONESELF: '不能接自己发布的单',
  NOT_HUNTER: '只有赏金猎人才能接单，请先申请',
  OCCUPIED: '手慢了，订单已被接走',
  CAMPUS: '订单校区与你的所属校区不一致',
  NOT_RUNNER: '只有跑腿员可标记送达',
  NOT_PUBLISHER_CONFIRM: '只有雇主可确认收货',
  NOT_PUBLISHER_CANCEL: '只有雇主可取消订单',
  STATE: '当前状态不允许操作',
  CANCELED_BUSY: '订单已被接单，请先联系管理员',
  CANT_CANCEL: '该订单不可取消',
  NOT_PAYING: '订单状态不是待支付',
};

const fail = (code) => ({ ok: false, code, message: MESSAGES[code] || MESSAGES.STATE });

/**
 * 抢单：必须是赏金猎人，且订单归属校区与用户一致；CAS 防重复
 */
async function acceptOrder(id, user) {
  const order = await Order.findByPk(id);
  if (!order) return fail('NOT_FOUND');
  if (order.publisherId === user.id) return fail('ONESELF');
  const me = await User.findByPk(user.id);
  if (!me || !me.isHunter) return fail('NOT_HUNTER');
  // 校区兜底：订单校区从雇主档案继承不可变，读后校验即可（无 TOCTOU）
  if (me.campus && order.campus !== me.campus) return fail('CAMPUS');
  const [affected] = await Order.update(
    { runnerId: user.id, status: 'ACCEPTED', acceptedAt: new Date() },
    { where: { id: order.id, status: 'PAID', runnerId: null } }
  );
  if (affected !== 1) return fail('OCCUPIED');
  const fresh = await Order.findByPk(id);
  kook.notifyOrderEvent('ACCEPTED', id);
  return { ok: true, order: fresh };
}

/**
 * 标记送达：仅该单跑腿员；照片可选（Kook 端无照片）
 */
async function deliverOrder(id, user, { photo = '' } = {}) {
  const order = await Order.findByPk(id);
  if (!order) return fail('NOT_FOUND');
  if (order.runnerId !== user.id) return fail('NOT_RUNNER');
  const [affected] = await Order.update(
    { deliveryPhoto: photo, status: 'DELIVERED', deliveredAt: new Date() },
    { where: { id: order.id, status: 'ACCEPTED', runnerId: user.id } }
  );
  if (affected !== 1) return fail('STATE');
  const fresh = await Order.findByPk(id);
  kook.notifyOrderEvent('DELIVERED', id);
  return { ok: true, order: fresh };
}

/**
 * 雇主确认收货：仅雇主（DELIVERED → CONFIRMED）
 */
async function confirmOrder(id, user) {
  const order = await Order.findByPk(id);
  if (!order) return fail('NOT_FOUND');
  if (order.publisherId !== user.id) return fail('NOT_PUBLISHER_CONFIRM');
  const [affected] = await Order.update(
    { status: 'CONFIRMED', confirmedAt: new Date() },
    { where: { id: order.id, status: 'DELIVERED', publisherId: user.id } }
  );
  if (affected !== 1) return fail('STATE');
  const fresh = await Order.findByPk(id);
  kook.notifyOrderEvent('CONFIRMED', id);
  return { ok: true, order: fresh };
}

/**
 * 雇主取消：仅 PAYING / 未被接单的 PAID
 */
async function cancelOrderByUser(id, user) {
  const order = await Order.findByPk(id);
  if (!order) return fail('NOT_FOUND');
  if (order.publisherId !== user.id) return fail('NOT_PUBLISHER_CANCEL');
  const [affected] = await Order.update(
    { status: 'CANCELED' },
    { where: { id: order.id, status: ['PAYING', 'PAID'], runnerId: null } }
  );
  if (affected !== 1) return fail('CANCELED_BUSY');
  kook.notifyOrderEvent('CANCELED', id);
  return { ok: true, order };
}

/**
 * 管理员取消：任意未完成订单（保留原有读后改语义）
 */
async function cancelOrderByAdmin(id) {
  const order = await Order.findByPk(id);
  if (!order) return fail('NOT_FOUND');
  if (['CANCELED', 'CONFIRMED', 'SETTLED'].includes(order.status)) return fail('CANT_CANCEL');
  await order.update({ status: 'CANCELED' });
  kook.notifyOrderEvent('CANCELED', id);
  return { ok: true, order };
}

/**
 * 核对后标记已支付（PAYING → PAID，订单进入接单大厅）
 */
async function markPaidOrder(id) {
  const [affected] = await Order.update(
    { status: 'PAID', paidAt: new Date() },
    { where: { id, status: 'PAYING' } }
  );
  if (affected !== 1) return fail('NOT_PAYING');
  kook.notifyOrderEvent('PAID', id);
  const order = await Order.findByPk(id);
  return { ok: true, order };
}

module.exports = {
  acceptOrder,
  deliverOrder,
  confirmOrder,
  cancelOrderByUser,
  cancelOrderByAdmin,
  markPaidOrder,
};
