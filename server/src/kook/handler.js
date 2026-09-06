/**
 * Kook 事件处理器：文本指令 + 卡片按钮点击
 *
 * 文本指令（任何频道可发，绑定码即凭证）：
 *   「绑定 123456」→ 绑定该 Kook 用户到平台账号（码由 Web「我的」页生成，10 分钟过期）
 *   「帮助」→ 私聊回复绑定指引
 *
 * 按钮点击：value = { act, id }（cards.js encodeBtn）
 *   act 白名单：accept/deliver/confirm/mark-paid
 *   点击者身份：kookId → 平台用户（未绑定则 DM 提示先绑定）
 *   操作走 orderService（CAS 保证与 Web 抢单完全同语义）
 *
 * 所有处理函数吞错只打日志：任何事件异常不得影响进程与后续事件。
 */
const { User } = require('../models');
const { getKookConfig } = require('./config');
const { sendDirectMessage } = require('./api');
const { decodeBtn } = require('./cards');
// 注意：orderService 须在函数内惰性 require（handler ← orderService ← kook/index ← handler 存在循环依赖，
// 顶部 require 会在对手模块尚未完成时拿到空对象导致 "xxx is not a function"）

/** 绑定码存储：Map<code, { userId, expireAt }>（内存态，重启丢失可重新生成） */
const bindCodes = new Map();
const BIND_CODE_TTL = 10 * 60 * 1000; // 10 分钟

/** Bot 自身 id（启动时由 facade 注入；Bot 的消息事件也会推送到 WS，必须过滤避免自回复） */
let botId = '';
function setBotId(id) {
  botId = id;
}

/** 生成/覆盖某个用户的绑定码（同账号同时只有一个有效码） */

/** 生成/覆盖某个用户的绑定码（同账号同时只有一个有效码） */
function createBindCode(userId) {
  // 清理过期码
  const now = Date.now();
  for (const [code, entry] of bindCodes) {
    if (entry.expireAt < now) bindCodes.delete(code);
  }
  // 移除该用户旧码，避免多码并存
  for (const [code, entry] of bindCodes) {
    if (entry.userId === userId) bindCodes.delete(code);
  }
  const code = String(100000 + Math.floor(Math.random() * 900000));
  bindCodes.set(code, { userId, expireAt: now + BIND_CODE_TTL });
  return { code, expireAt: now + BIND_CODE_TTL };
}

/** 统计当前剩余有效码（调试用，无 UI 需求可不展示） */
function bindCodeCount() {
  const now = Date.now();
  let n = 0;
  for (const [, entry] of bindCodes) if (entry.expireAt > now) n++;
  return n;
}

/** 向 Kook 用户发私聊文本（失败静默；私信走 direct-message 专用接口） */
async function dm(token, kookId, text) {
  await sendDirectMessage(token, kookId, 1, text);
}

/* ---------- 绑定流程 ---------- */

async function handleBind(token, kookUserId, code) {
  const entry = bindCodes.get(code);
  if (!entry || entry.expireAt < Date.now()) {
    bindCodes.delete(code);
    return dm(token, kookUserId, '绑定码无效或已过期，请到网页「我的-绑定Kook」重新生成');
  }
  // 该 Kook 账号不可重复绑定其他平台账号
  const exist = await User.findOne({ where: { kookId: kookUserId } });
  if (exist) {
    bindCodes.delete(code);
    return dm(token, kookUserId, `该 Kook 账号已绑定平台用户「${exist.username}」，如需更换请先在网页解绑`);
  }
  const user = await User.findByPk(entry.userId);
  if (!user) {
    bindCodes.delete(code);
    return dm(token, kookUserId, '绑定失败：对应的平台账号不存在');
  }
  bindCodes.delete(code); // 一次性
  await user.update({ kookId: kookUserId });
  return dm(token, kookUserId, `✅ 绑定成功！「${user.username}」— 现在你可以在 Kook 里接单/处理订单了。`);
}

/* ---------- 按钮点击 ---------- */

/**
 * 从事件里解析出按钮点击（官方格式 message_btn_click）：
 * extra.type = 'message_btn_click'，extra.body = { value, msg_id, user_id, target_id }
 * 兼容性兜底：extra.buttons 数组形态
 */
function extractButtons(event) {
  const extra = event && event.extra;
  if (!extra) return [];
  if (extra.type === 'message_btn_click' && extra.body && extra.body.value !== undefined) {
    const b = extra.body;
    return [{ user_id: b.user_id, msg_id: b.msg_id || event.msg_id, value: b.value }];
  }
  const arr = extra.buttons || (extra.button ? [extra.button] : []);
  return arr.map((b) => ({
    user_id: b.user_id,
    msg_id: b.msg_id || event.msg_id,
    value: b.value,
  }));
}

/** 按错误码回执 DM 文案（与 Web 拦截器提示保持一致） */
const FAIL_TEXT = {
  NOT_FOUND: '订单不存在',
  ONESELF: '不能接自己发布的单',
  NOT_HUNTER: '只有赏金猎人才能接单，请先到网页「我的」申请',
  OCCUPIED: '手慢了，订单已被接走',
  CAMPUS: '订单校区与你的所属校区不一致',
  NOT_RUNNER: '你不是该单跑腿员',
  NOT_PUBLISHER_CONFIRM: '只有雇主可确认收货',
  NOT_PUBLISHER_CANCEL: '只有雇主可取消订单',
  STATE: '当前状态不允许操作（可能已被处理）',
  NOT_PAYING: '订单状态不是待支付（可能已核销）',
};

async function handleButton(token, clicker, buttons) {
  for (const btn of buttons) {
    const payload = decodeBtn(btn.value);
    if (!payload) continue;
    const { act, id } = payload;
    if (!['accept', 'deliver', 'confirm', 'mark-paid'].includes(act)) continue;

    // 点击者身份：kookId → 平台用户
    const user = await User.findOne({ where: { kookId: clicker } });
    if (!user) {
      await dm(token, clicker, '请先到网页「我的-绑定Kook」绑定账号后再操作');
      continue;
    }
    // mark-paid 仅管理员
    if (act === 'mark-paid' && user.role !== 'admin') {
      await dm(token, clicker, '只有管理员可确认到账');
      continue;
    }
    let res;
    try {
      const orderService = require('../services/orderService'); // 惰性加载，避开循环依赖初始化顺序
      switch (act) {
        case 'accept':
          res = await orderService.acceptOrder(id, user);
          break;
        case 'deliver':
          res = await orderService.deliverOrder(id, user, { photo: '' });
          break;
        case 'confirm':
          res = await orderService.confirmOrder(id, user);
          break;
        case 'mark-paid':
          res = await orderService.markPaidOrder(id);
          break;
      }
    } catch (e) {
      console.warn('[kook] 按钮处理异常:', e.message);
      continue;
    }
    if (!res || !res.ok) {
      await dm(token, clicker, FAIL_TEXT[res.code] || '操作失败，请去网页处理');
    }
    // 成功时由 orderService 通知矩阵负责各端通知，无需额外回执
  }
}

/* ---------- 事件入口 ---------- */

/**
 * 处理一条事件（client.js 按 sn 保序调用）
 * @param {object} event s=0 的 d 字段
 */
async function routeEvent(event) {
  const { type, channel_type, author_id, extra } = event || {};

  // 调试日志：记录全部事件（联调期定位按钮/私聊格式问题，量产可保留便于排查）
  console.log('[kook-evt] channel=%s type=%s author=%s content=%s extra=%s',
    channel_type, type, author_id,
    String(event.content || '').slice(0, 40),
    JSON.stringify(extra || {}).slice(0, 400));

  // 按钮点击优先处理（若事件是按钮点击，点击者以 body.user_id 为准，此时 author_id 不作过滤依据）
  const buttons = extractButtons(event);
  if (buttons.length > 0) {
    const cfg = await getKookConfig();
    if (cfg.token) await handleButton(cfg.token, buttons[0].user_id || event.author_id, buttons);
    return;
  }
  if (author_id === '1') return; // 系统消息忽略
  if (botId && author_id === String(botId)) return; // Bot 自己的消息忽略（防自回复）
  if (!['GROUP', 'PERSON'].includes(channel_type)) return;

  const cfg = await getKookConfig();
  if (!cfg.token) return;

  // 文本指令
  if (type === 1 || type === 9) {
    const content = String(event.content || '').trim();
    const m = content.match(/^绑定\s*(\d{6})$/);
    if (m) {
      // 仅限私聊绑定（频道内绑定易被他人关注，改私信统一入口）
      if (channel_type !== 'PERSON') {
        await dm(cfg.token, author_id, '绑定请私聊机器人发送「绑定 123456」完成（频道内发送不生效）');
        return;
      }
      await handleBind(cfg.token, author_id, m[1]);
      return;
    }
    if (/^(帮助|help)$/i.test(content)) {
      await dm(cfg.token, author_id, '绑定指引：打开网页「我的 → 绑定Kook」生成 6 位绑定码，回复「绑定 123456」即可完成绑定。');
      return;
    }
    // 群聊未匹配指令静默；私聊未匹配简洁提示
    if (channel_type === 'PERSON') {
      await dm(cfg.token, author_id, '回复「绑定 123456」可绑定取个件呗账号，或回复「帮助」查看指引。');
    }
  }
}

module.exports = { routeEvent, createBindCode, bindCodeCount, setBotId };
