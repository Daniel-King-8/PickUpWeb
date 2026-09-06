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
const { User, Order, Setting } = require('../models');
const { getKookConfig } = require('./config');
const { sendDirectMessage, uploadLocalAsset } = require('./api');
const cards = require('./cards');
const { decodeBtn } = cards;
const { calcFee, generateOrderNo, normalizeFeeRules, generateUid } = require('../utils/helpers');
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

/* ================= 交互式下单（私信会话状态机） ================= */

const SESSION_TTL = 15 * 60 * 1000; // 15 分钟无操作会话过期
/** kookId -> { state, data, expireAt } */
const sessions = new Map();

function getSession(kookId) {
  const s = sessions.get(kookId);
  if (!s || s.expireAt < Date.now()) {
    sessions.delete(kookId);
    return null;
  }
  return s;
}
function setSession(kookId, state, data) {
  const s = { state, data, expireAt: Date.now() + SESSION_TTL };
  sessions.set(kookId, s);
  return s;
}
function endSession(kookId) {
  sessions.delete(kookId);
}

/** 向用户发私信卡片 */
async function dmCard(token, kookId, card) {
  await sendDirectMessage(token, kookId, 10, JSON.stringify([card]));
}

/** 校区选项（与 users.js CAMPUS_ALLOWED 一致；两校区可扩展）
 * 若无校区则下单流程先让用户选择（Kook 用户无需注册 Web 账号，校区在此确认） */
const CAMPUS_OPTIONS = [
  { label: '四川邮电职业技术学院', val: 'scyz' },
  { label: '成都农业科技职业学院', val: 'cdny' },
];

/**
 * 获取 Kook 用户对应的平台账号（首次自动创建：username=kook_<KookID>，随机密码，
 * kookId 即写入 —— 相当于自动绑定，之后通知可正常私信该用户）
 */
async function getOrCreateKookUser(kookId, kookName) {
  let user = await User.findOne({ where: { kookId } });
  if (user) return user;
  const bcrypt = require('bcryptjs');
  let username = `kook_${kookId}`;
  const password = `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
  user = await User.create({
    uid: generateUid(),
    username,
    nickname: String(kookName || '').slice(0, 50),
    password: bcrypt.hashSync(password, 10),
    role: 'user',
    campus: '',
    kookId,
  });
  console.log(`[kook] 已自动创建用户 ${username}（Kook ${kookId}）`);
  return user;
}

/** 读当前校区费率 */
async function readFeeRules(campus) {
  const s = await Setting.findOne({ where: { key: 'feeRules' } });
  if (!s) return null;
  try {
    return normalizeFeeRules(JSON.parse(s.value), campus);
  } catch (e) {
    return null;
  }
}
/** 读收款信息（收款码 + 管理员微信） */
async function readPayInfo() {
  const [wx, ali, contact] = await Promise.all([
    Setting.findOne({ where: { key: 'payQrWx' } }),
    Setting.findOne({ where: { key: 'payQrAlipay' } }),
    Setting.findOne({ where: { key: 'contactWechat' } }),
  ]);
  return {
    payQrWx: wx ? wx.value : '',
    payQrAlipay: ali ? ali.value : '',
    contactWechat: contact ? contact.value : '',
  };
}

/** 下单入口（🎯 下单）：先确认校区（无则问），再走站点流程 */
async function startPublish(token, user) {
  // 无校区：先让用户选择（Kook 用户无需网页注册）
  if (!user.campus) {
    const s = setSession(user.kookId, 'chooseCampus', { user, saved: {} });
    await dmCard(token, user.kookId, {
      type: 'card',
      theme: 'info',
      modules: [
        header('🏫 请选择就读校区：'),
        { type: 'action-group', elements: CAMPUS_OPTIONS.map((c) => ({ type: 'button', theme: 'primary', value: JSON.stringify({ act: 'pick-campus', id: c.val }), click: 'return-val', text: { type: 'plain-text', content: c.label } })) },
      ],
    });
    return;
  }
  await continuePublish(token, user);
}

/** 选择校区后继续下单流程 */
async function pickCampus(token, user, campus) {
  const s = getSession(user.kookId);
  if (!s || s.state !== 'chooseCampus') return;
  await user.update({ campus });
  await dm(token, user.kookId, `✅ 校区已确认：${CAMPUS_OPTIONS.find((c) => c.val === campus)?.label || campus}`);
  await continuePublish(token, user);
}

/** 校区已就绪：拉费率/记忆信息，问站点 */
async function continuePublish(token, user) {
  const feeRules = await readFeeRules(user.campus);
  if (!feeRules || !feeRules.stations || !feeRules.stations.length) {
    await dm(token, user.kookId, '费率未配置，请联系管理员');
    return;
  }
  const s = setSession(user.kookId, 'chooseStation', { user, feeRules, saved: {} });
  // 记忆：该用户最近一单的目的地/电话（与 Web 端 localStorage 习惯一致）
  const last = await Order.findOne({
    where: { publisherId: user.id },
    attributes: ['deliverPlace', 'contactPhone'],
    order: [['id', 'DESC']],
  });
  if (last) {
    s.data.saved.deliverPlace = last.deliverPlace || '';
    s.data.saved.contactPhone = last.contactPhone || '';
  }
  await dmCard(token, user.kookId, cards.pickCard('🏬 请选择快递站点：', feeRules.stations, 'pick-station'));
}

/** 创建订单（规则同 Web 下单：取件码 50 位/地址 100 位/悬赏=基础+平台费） */
async function createKookOrder(s) {
  const { user, feeRules } = s.data;
  const { reward, fee } = calcFee(feeRules);
  const deliverPlace = `${s.data.destination || ''}${s.data.detail ? ` ${s.data.detail}` : ''}`;
  return Order.create({
    orderNo: generateOrderNo(),
    campus: user.campus,
    station: String(s.data.station).slice(0, 50),
    pickupCode: String(s.data.pickupCode).slice(0, 50),
    deliverPlace: String(deliverPlace).slice(0, 100),
    contactPhone: String(s.data.phone).slice(0, 20),
    remark: String(s.data.remark || '').slice(0, 255),
    reward,
    fee,
    status: 'PAYING',
    publisherId: user.id,
  });
}

/** 完成下单：发完成卡；有截图则更新管理员待核对卡（补图） */
async function finishPublish(token, kookId, order, hasShot) {
  await dmCard(token, kookId, cards.publishDoneCard(order));
  if (hasShot) {
    const kookDoor = require('./index'); // 惰性加载
    kookDoor.notifyOrderEvent('PAY_UPLOADED', order.id);
  }
  endSession(kookId);
}

/** 发送付款卡（收款码转 Kook 素材 + 微信 + 金额 + 【我已确认付款】） */
async function sendPayCard(token, kookId, order) {
  const payInfo = await readPayInfo();
  const cfg = await getKookConfig();
  let qr = '';
  if (cfg.token) {
    qr = (await uploadLocalAsset(cfg.token, payInfo.payQrWx || payInfo.payQrAlipay)) || '';
  }
  await dmCard(token, kookId, cards.payCard(order, { ...payInfo, payQrWx: qr, payQrAlipay: qr, contactWechat: payInfo.contactWechat }));
}

/* ---------- 会话推进（按钮/文本/图片各自触发） ---------- */

async function sessionPickStation(token, user, station) {
  const s = getSession(user.kookId);
  if (!s || s.state !== 'chooseStation') return;
  s.state = 'inputPickupCode';
  s.data.station = station;
  await dm(token, user.kookId, '📋 请发送取件码（多个取件码用逗号隔开）：');
}

async function sessionPickupCode(token, user, content) {
  const s = getSession(user.kookId);
  if (!s || s.state !== 'inputPickupCode') return;
  s.data.pickupCode = content.slice(0, 50);
  s.state = 'confirmInfo';
  if (s.data.saved.deliverPlace && s.data.saved.contactPhone) {
    await dm(token, user.kookId, `历史收货信息：\n送达：${s.data.saved.deliverPlace}\n电话：${s.data.saved.contactPhone}`);
    await dmCard(token, user.kookId, {
      type: 'card',
      theme: 'info',
      modules: [
        header('确认收货信息'),
        {
          type: 'section',
          text: { type: 'plain-text', content: '是否使用以上信息直接下单？' },
        },
        {
          type: 'action-group',
          elements: [
            { type: 'button', theme: 'success', value: JSON.stringify({ act: 'use-saved' }), click: 'return-val', text: { type: 'plain-text', content: '✔ 不更改，直接使用' } },
            { type: 'button', theme: 'warning', value: JSON.stringify({ act: 'change-info' }), click: 'return-val', text: { type: 'plain-text', content: '🔄 更改' } },
          ],
        },
      ],
    });
  } else {
    await askDestination(token, user);
  }
}

async function askDestination(token, user) {
  const s = getSession(user.kookId);
  if (!s) return;
  s.state = 'chooseDestination';
  await dmCard(token, user.kookId, cards.pickCard('🏨 请选择目的地：', s.data.feeRules.destinations || [], 'pick-destination'));
}

async function sessionPickDestination(token, user, dest) {
  const s = getSession(user.kookId);
  if (!s || s.state !== 'chooseDestination') return;
  s.state = 'inputDetail';
  s.data.destination = dest;
  await dm(token, user.kookId, '🏠 请输入详细地址（例如房间号：302 / A栋）：');
}

async function sessionDetail(token, user, content) {
  const s = getSession(user.kookId);
  if (!s || s.state !== 'inputDetail') return;
  s.data.detail = content.slice(0, 20);
  s.state = 'inputPhone';
  await dm(token, user.kookId, '📱 请输入联系电话（跑腿员接单后联系使用）：');
}

async function sessionPhone(token, user, content) {
  const s = getSession(user.kookId);
  if (!s || s.state !== 'inputPhone') return;
  s.data.phone = content.slice(0, 20);
  s.state = 'askRemark';
  s.data.remark = '';
  await dmCard(token, user.kookId, {
    type: 'card',
    theme: 'info',
    modules: [
      header('📝 备注（选填）'),
      { type: 'section', text: { type: 'plain-text', content: '直接发送文字填写备注（如：大件/需轻放），或选择无备注。' } },
      { type: 'action-group', elements: [{ type: 'button', theme: 'primary', value: JSON.stringify({ act: 'skip-remark' }), click: 'return-val', text: { type: 'plain-text', content: '⏭ 无备注' } }] },
    ],
  });
}

async function sessionRemark(token, user, content) {
  const s = getSession(user.kookId);
  if (!s || s.state !== 'askRemark') return;
  s.data.remark = content.slice(0, 255);
  await kookSubmitOrder(token, user);
}

/** 提交订单 → 通知管理员 + 发付款卡 */
async function kookSubmitOrder(token, user) {
  const s = getSession(user.kookId);
  if (!s || !s.data.pickupCode) return;
  try {
    const order = await createKookOrder(s);
    s.state = 'awaitConfirmPay';
    s.data.orderId = order.id;
    const kookDoor = require('./index');
    kookDoor.notifyOrderEvent('NEW_ORDER', order.id); // 管理员待核对卡
    await sendPayCard(token, user.kookId, order);
  } catch (e) {
    console.warn('[kook] 交互下单失败:', e.message);
    await dm(token, user.kookId, '下单失败，请稍后重试');
  }
}

async function confirmPaid(token, user, orderId) {
  const s = getSession(user.kookId);
  if (!s || s.state !== 'awaitConfirmPay' || s.data.orderId !== orderId) return;
  s.state = 'askShot';
  await dmCard(token, user.kookId, cards.screenshotAskCard(orderId));
}

async function askImage(token, user, orderId) {
  const s = getSession(user.kookId);
  if (!s || s.state !== 'askShot' || s.data.orderId !== orderId) return;
  s.state = 'awaitScreenshot';
  await dm(token, user.kookId, '📤 请发送付款截图图片（转账成功页面）：');
}

/** 收到图片（type=2）且处于等待截图 → 下载保存 + 完成；返回是否消费了该图片 */
async function saveShot(token, user, imageUrl) {
  const s = getSession(user.kookId);
  if (!s || s.state !== 'awaitScreenshot') return false;
  const { orderId } = s.data;
  try {
    const path = require('path');
    const fs = require('fs');
    const dir = process.env.UPLOAD_DIR || path.join(__dirname, '../data/uploads');
    fs.mkdirSync(dir, { recursive: true });
    const resp = await fetch(imageUrl);
    if (resp.ok) {
      const buf = Buffer.from(await resp.arrayBuffer());
      const name = `kook-shot-${Date.now()}.png`;
      fs.writeFileSync(path.join(dir, name), buf);
      const order = await Order.findByPk(orderId);
      if (order) await order.update({ payerScreenshot: `/uploads/${name}` });
    }
  } catch (e) {
    console.warn('[kook] 下载付款截图失败:', e.message);
  }
  const order = await Order.findByPk(orderId);
  if (order) await finishPublish(token, user.kookId, order, true);
  else endSession(user.kookId);
  return true;
}

async function notUpload(token, user, orderId) {
  const s = getSession(user.kookId);
  if (!s || s.state !== 'askShot' || s.data.orderId !== orderId) return;
  const order = await Order.findByPk(orderId);
  if (order) await finishPublish(token, user.kookId, order, false);
}

/** 使用保存的收货信息直接下单（跳到备注） */
async function useSaved(token, user) {
  const s = getSession(user.kookId);
  if (!s || s.state !== 'confirmInfo') return;
  s.data.destination = s.data.saved.deliverPlace;
  s.data.detail = '';
  s.data.phone = s.data.saved.contactPhone;
  s.state = 'askRemark';
  s.data.remark = '';
  await dmCard(token, user.kookId, {
    type: 'card',
    theme: 'info',
    modules: [
      header('📝 备注（选填）'),
      { type: 'section', text: { type: 'plain-text', content: '直接发送文字填写备注，或选择无备注。' } },
      { type: 'action-group', elements: [{ type: 'button', theme: 'primary', value: JSON.stringify({ act: 'skip-remark' }), click: 'return-val', text: { type: 'plain-text', content: '⏭ 无备注' } }] },
    ],
  });
}

/** 雇主取消订单（审核完成卡上的取消按钮）→ 退款提示 */
async function cancelOwnOrder(token, user, orderId) {
  const orderService = require('../services/orderService');
  const res = await orderService.cancelOrderByUser(orderId, user);
  if (!res.ok) {
    await dm(token, user.kookId, res.message || '当前状态不允许操作');
    return;
  }
  const payInfo = await readPayInfo();
  await dmCard(token, user.kookId, cards.cancelRefundCard(payInfo.contactWechat));
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
    const info = b.user_info || {};
    return [{
      user_id: b.user_id,
      msg_id: b.msg_id || event.msg_id,
      value: b.value,
      authorName: info.nickname || info.username || '',
    }];
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
  const FLOW_ACTS = ['publish-start', 'pick-campus', 'pick-station', 'pick-destination', 'use-saved', 'change-info', 'skip-remark', 'confirm-pay', 'upload-shot-yes', 'upload-shot-no', 'cancel-own'];
  const ORDER_ACTS = ['accept', 'deliver', 'confirm', 'mark-paid', 'delete-order'];
  for (const btn of buttons) {
    const payload = decodeBtn(btn.value);
    if (!payload) continue;
    const { act, id } = payload;
    if (!ORDER_ACTS.includes(act) && !FLOW_ACTS.includes(act)) continue;

    // 点击者身份：kookId → 平台账号（首次自动创建；Kook 用户无需先网页注册/绑定）
    let user = null;
    try {
      user = await getOrCreateKookUser(clicker, btn.authorName || '');
      if (!user) throw new Error('no user');
    } catch (e) {
      await dm(token, clicker, '账号创建失败，请稍后再试');
      continue;
    }

    // 交互下单流程（非状态迁移按钮，id 参数为站点名/目的地名/订单 id 等）
    if (FLOW_ACTS.includes(act)) {
      try {
        switch (act) {
          case 'publish-start': await startPublish(token, user); break;
          case 'pick-campus': await pickCampus(token, user, id); break;
          case 'pick-station': await sessionPickStation(token, user, id); break;
          case 'pick-destination': await sessionPickDestination(token, user, id); break;
          case 'use-saved': await useSaved(token, user); break;
          case 'change-info': await askDestination(token, user); break;
          case 'skip-remark': await kookSubmitOrder(token, user); break;
          case 'confirm-pay': await confirmPaid(token, user, id); break;
          case 'upload-shot-yes': await askImage(token, user, id); break;
          case 'upload-shot-no': await notUpload(token, user, id); break;
          case 'cancel-own': await cancelOwnOrder(token, user, id); break;
        }
      } catch (e) {
        console.warn('[kook] 流程按钮异常:', e.message);
      }
      continue;
    }
    // 核对/删除权限：admin 或 小管理员（小管理员仅 Kook 内操作，无 Web 后台）
    const isAdminOp = user.role === 'admin' || user.isSubAdmin;
    if ((act === 'mark-paid' || act === 'delete-order') && !isAdminOp) {
      await dm(token, clicker, '只有管理员可执行此操作');
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
        case 'delete-order':
          res = await orderService.deleteOrder(id);
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
    // 交互下单会话推进（绑定/帮助指令优先匹配）
    const s = getSession(author_id);
    if (s) {
      const u = s.data.user;
      if (s.state === 'inputPickupCode') { await sessionPickupCode(cfg.token, u, content); return; }
      if (s.state === 'inputDetail') { await sessionDetail(cfg.token, u, content); return; }
      if (s.state === 'inputPhone') { await sessionPhone(cfg.token, u, content); return; }
      if (s.state === 'askRemark') { await sessionRemark(cfg.token, u, content); return; }
      if (s.state === 'awaitScreenshot') {
        await dm(cfg.token, author_id, '请直接发送付款截图图片（转账成功页）；如不上传请点上方卡片按钮。');
        return;
      }
      if (['confirmInfo', 'askShot', 'awaitConfirmPay'].includes(s.state)) {
        await dm(cfg.token, author_id, '请点击上方卡片按钮继续操作');
        return;
      }
    }
    // 群聊未匹配指令静默；私聊未匹配简洁提示
    if (channel_type === 'PERSON') {
      await dm(cfg.token, author_id, '回复「绑定 123456」可绑定取个件呗账号，或回复「帮助」查看指引。');
    }
    return;
  }
  // 图片消息：交互下单等待付款截图时接收（type=2，content 为图片 URL）
  if (type === 2) {
    await saveShot(cfg.token, author_id, event.content || '');
  }
}

module.exports = { routeEvent, createBindCode, bindCodeCount, setBotId };
