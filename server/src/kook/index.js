/**
 * Kook 机器人门面（对外唯一入口）
 *
 * - start()                启动 WS 客户端（无 token 自动跳过，平台功能零影响）
 * - notifyOrderEvent()     订单状态变更通知矩阵（fire-and-forget，全 try/catch）
 * - createBindCode(userId) 生成绑定码（Web「我的」页用）
 * - status()               状态聚合（后台状态卡用）
 */
const path = require('path');
const fs = require('fs');
const { Order, User } = require('../models');
const { getKookConfig, enabled } = require('./config');
const client = require('./client');
const handler = require('./handler');
const { sendMessage, sendDirectMessage, updateMessage, uploadAsset, getMe } = require('./api');
const cards = require('./cards');

/** 已发送的"待核对"卡片索引：orderId -> { channelId, msgId }，被确认后更新为"已确认"占位卡 */
const sentCheckCards = new Map();
/** 已发送的"大厅"卡片索引：orderId -> { channelId, msgId }，被抢单后更新为"已被接单" */
const sentHallCards = new Map();
/** 通知串行队列：同一订单的 PAID(发卡记录 msg_id) 与 ACCEPTED(更新卡) 须按调用顺序执行，否则可能竞态丢更新 */
let notifyChain = Promise.resolve();

/** 启动：注册事件处理器 + 注入 Bot 自身 id（过滤自消息）+ 连接 */
async function start() {
  if (!(await enabled())) {
    console.log('[kook] 未配置 token，跳过启动（Web 功能不受影响）');
    return;
  }
  const cfg = await getKookConfig();
  const me = await getMe(cfg.token);
  if (me && me.id) handler.setBotId(me.id);
  client.onEvent(handler.routeEvent);
  await client.start();
}

/** 优雅停止（进程退出时） */
function stop() {
  client.stop();
}

/** 生成绑定码（委托 handler 内存表） */
function createBindCode(userId) {
  return handler.createBindCode(userId);
}

/** 后台状态卡聚合 */
async function status() {
  const isEnabled = await enabled();
  const cfg = await getKookConfig();
  return {
    enabled: isEnabled,
    botTokenSet: !!cfg.token,
    guildId: cfg.guildId,
    hallChannelId: cfg.hallChannelId,
    adminChannelId: cfg.adminChannelId,
    bindCodeCount: handler.bindCodeCount(),
    ...client.status(),
  };
}

/** 后台「测试」：向管理员频道发一张测试卡片，验证 token/频道配置是否可用 */
async function sendTest() {
  try {
    const cfg = await getKookConfig();
    if (!cfg.token || !cfg.adminChannelId) return false;
    const card = {
      type: 'card',
      theme: 'primary',
      modules: [
        { type: 'header', text: { type: 'plain-text', content: '🔌 Kook 对接测试消息' } },
        { type: 'section', text: { type: 'kmarkdown', content: '机器人已连通！接下来部署订单通知与接单大厅。' } },
      ],
    };
    const msgId = await sendMessage(cfg.token, cfg.adminChannelId, 10, JSON.stringify([card]));
    return !!msgId;
  } catch (e) {
    console.warn('[kook] 测试消息发送失败:', e.message);
    return false;
  }
}

/* ---------- 通知矩阵 ---------- */

/** 向频道发卡片（失败静默由外层 try/catch；返回 msg_id 供后续更新） */
async function sendCard(token, targetId, card) {
  if (!targetId) return null;
  return sendMessage(token, targetId, 10, JSON.stringify([card]));
}

/** 向用户发卡片/文本（user.kookId 为空则跳过；私信走 direct-message 专用接口） */
async function dmCard(token, user, card) {
  if (!user || !user.kookId) return;
  await sendDirectMessage(token, user.kookId, 10, JSON.stringify([card]));
}
async function dmText(token, user, text) {
  if (!user || !user.kookId) return;
  await sendDirectMessage(token, user.kookId, 1, text);
}

/** 本地 /uploads/xxx → 磁盘绝对路径（供 asset 上传） */
function localFilePath(url) {
  if (!url) return '';
  const dir = process.env.UPLOAD_DIR || path.join(__dirname, '../data/uploads');
  return path.join(dir, path.basename(url));
}

/** 上传本地截图 → Kook 可用链接（失败返回 null，降级为无图卡片） */
async function uploadForCard(token, url) {
  const p = localFilePath(url);
  if (!p || !fs.existsSync(p)) return null;
  return uploadAsset(token, p);
}

/**
 * 订单状态变更通知矩阵
 * @param {string} transition PAY_UPLOADED|PAID|ACCEPTED|DELIVERED|CONFIRMED|CANCELED
 * @param {number} orderId 订单 id
 *
 * 注意：PAY_UPLOADED（截图上传）不改变状态，由路由在 pay-upload 后显式调用；
 *   其余 transition 由 orderService 成功分支统一调用（Web + Kook 双入口只写一处）。
 */
async function notifyOrderEvent(transition, orderId) {
  // 排队执行：保证同订单的过渡通知按触发顺序串行（发送卡片 → 记录 → 更新卡片）
  notifyChain = notifyChain.then(() => doNotifyOrderEvent(transition, orderId));
  return notifyChain;
}

async function doNotifyOrderEvent(transition, orderId) {
  try {
    const cfg = await getKookConfig();
    if (!cfg.token || !cfg.hallChannelId && !cfg.adminChannelId) {
      console.log(`[kook] 通知跳过：${transition} 订单${orderId}（token 或频道未配置）`);
      return;
    }
    const order = await Order.findByPk(orderId);
    if (!order) {
      console.log(`[kook] 通知跳过：${transition} 订单${orderId} 不存在`);
      return;
    }
    console.log(`[kook] 通知：${transition} 订单${orderId}（${order.orderNo}）`);
    // 雇主/跑腿员信息（name = 昵称 || 用户名）
    const { publisherId, runnerId } = order;
    const [publisher, runner] = await Promise.all([
      publisherId ? User.findByPk(publisherId) : null,
      runnerId ? User.findByPk(runnerId) : null,
    ]);
    const pubName = publisher ? publisher.nickname || publisher.username : '未知用户';
    const runName = runner ? runner.nickname || runner.username : '未知用户';

    switch (transition) {
      case 'NEW_ORDER': {
        // 下单即通知（截图选填）：雇主付款后管理员核对收款记录即可确认
        const msgId = await sendCard(cfg.token, cfg.adminChannelId, cards.adminCheckCard(order, pubName, publisher ? publisher.uid : '', ''));
        if (msgId) sentCheckCards.set(order.id, { channelId: cfg.adminChannelId, msgId });
        break;
      }
      case 'PAY_UPLOADED': {
        // 传截图：更新已发的待核对卡片（补上截图）；无记录（如进程重启过）则新发一张
        const shot = await uploadForCard(cfg.token, order.payerScreenshot);
        const prev = sentCheckCards.get(order.id);
        if (prev) {
          await updateMessage(cfg.token, prev.msgId, JSON.stringify([cards.adminCheckCard(order, pubName, publisher ? publisher.uid : '', shot)]));
        } else {
          const msgId = await sendCard(cfg.token, cfg.adminChannelId, cards.adminCheckCard(order, pubName, publisher ? publisher.uid : '', shot));
          if (msgId) sentCheckCards.set(order.id, { channelId: cfg.adminChannelId, msgId });
        }
        break;
      }
      case 'PAID': {
        // 更新旧"待核对"卡片 → 「✅ 已确认并发布」（按钮随之消失）
        const prev = sentCheckCards.get(order.id);
        if (prev) {
          await updateMessage(cfg.token, prev.msgId, JSON.stringify([cards.adminConfirmedCard(order)]));
          sentCheckCards.delete(order.id);
        }
        // 大厅卡片（记录 msg_id，供抢单后更新为"已被接单"）
        const hallMsgId = await sendCard(cfg.token, cfg.hallChannelId, cards.hallCard(order, pubName));
        if (hallMsgId) sentHallCards.set(order.id, { channelId: cfg.hallChannelId, msgId: hallMsgId });
        break;
      }
      case 'ACCEPTED': {
        // 更新大厅卡片 → 「已被接单」（抢单按钮消失）
        const hall = sentHallCards.get(order.id);
        if (hall) {
          await updateMessage(cfg.token, hall.msgId, JSON.stringify([cards.hallTakenCard(order, runName)]));
          sentHallCards.delete(order.id);
        }
        await dmCard(cfg.token, runner, cards.runnerAcceptedCard(order, pubName));
        await dmCard(cfg.token, publisher, cards.employerAcceptedCard(order, runName));
        break;
      }
      case 'DELIVERED': {
        const photo = await uploadForCard(cfg.token, order.deliveryPhoto);
        await dmCard(cfg.token, publisher, cards.employerDeliveredCard(order, photo));
        await dmText(cfg.token, runner, '📬 已标记送达，等待雇主确认收货');
        break;
      }
      case 'CONFIRMED': {
        await dmCard(cfg.token, runner, cards.runnerConfirmedCard(order));
        break;
      }
      case 'CANCELED': {
        const cancel = cards.cancelCard(order, '');
        await dmCard(cfg.token, publisher, cancel);
        await dmCard(cfg.token, runner, cancel);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.warn('[kook] 通知发送失败:', e.message);
  }
}

module.exports = { start, stop, createBindCode, status, sendTest, notifyOrderEvent };
