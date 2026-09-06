/**
 * Kook 卡片消息构建器（CardMessage）
 *
 * 版式保守：1 张卡 + header/section/action-group/context，按钮 ≤2，
 * 避免触及 Kook 的模块/按钮数量上限。
 *
 * 按钮约定：value = JSON.stringify({ act, id })，click='return-val'，
 * 点击后 Kook 把 msg_id/点击者 user_id/value 回传给 bot（handler.js 处理）。
 * act 白名单：accept | deliver | confirm | mark-paid
 */
const { maskCode } = require('../utils/helpers');

/* ---------- 随机主题（用户要求卡片颜色随机） ---------- */

const THEMES = ['primary', 'success', 'danger', 'warning', 'info', 'secondary'];
const randomTheme = () => THEMES[Math.floor(Math.random() * THEMES.length)];

/* ---------- 基础结构 ---------- */

const header = (text) => ({
  type: 'header',
  text: { type: 'plain-text', content: text },
});

const section = (text) => ({
  type: 'section',
  text: { type: 'kmarkdown', content: text },
});

/** section + 右侧 accessory（图片） */
const sectionWithImage = (text, imageUrl) => ({
  type: 'section',
  mode: 'left',
  text: { type: 'kmarkdown', content: text },
  accessory: { type: 'image', src: imageUrl, size: 'lg' },
});

/** 图片组模块（1~9 张） */
const imageGroup = (urls) => ({
  type: 'image-group',
  elements: urls.map((u) => ({ type: 'image', src: u })),
});

const actionGroup = (buttons) => ({
  type: 'action-group',
  elements: buttons,
});

const button = (text, theme, act, id) => ({
  type: 'button',
  theme,
  value: JSON.stringify({ act, id }),
  click: 'return-val',
  text: { type: 'plain-text', content: text },
});

const context = (...texts) => ({
  type: 'context',
  elements: texts.map((t) => ({ type: 'plain-text', content: t })),
});

/* ---------- value 编解码 ---------- */

const encodeBtn = ({ act, id }) => JSON.stringify({ act, id });

const decodeBtn = (value) => {
  try {
    const o = JSON.parse(value);
    // id 可缺省（如 skip-remark 等无参数动作），只需 act 有效
    if (o && typeof o.act === 'string') return o;
  } catch (e) {
    /* 非法 value */
  }
  return null;
};

/* ---------- 订单卡片集合 ---------- */

/**
 * 接单大厅卡片：订单确认（已支付）后发布到接单大厅频道
 * 取件码/电话对外脱敏，点击「抢单」后跑腿员 DM 里才是明文
 * 注意：文本一律用 plain-text 段落（kmarkdown 加粗在专名/emoji 场景曾渲染乱码）
 */
const hallCard = (order, employerName) => {
  const lines = [
    `订单号：${order.orderNo}`,
    `前往地点：${order.station}`,
    `目的地：${order.deliverPlace}`,
    `取件码：${maskCode(order.pickupCode)}（抢单后可见）`,
    `联系电话：${maskCode(order.contactPhone)}`,
    `雇主：${employerName}`,
  ];
  if (order.remark) lines.push(`备注：${order.remark}`);
  return {
    type: 'card',
    theme: 'success',
    modules: [
      header(`💰 新悬赏待接单 · ¥${Number(order.reward).toFixed(2)}`),
      { type: 'section', text: { type: 'plain-text', content: lines.join('\n') } },
      actionGroup([button('⚡ 抢单', 'primary', 'accept', order.id)]),
    ],
  };
};

/** 已被接单的大厅卡片（message/update 替换旧卡用：抢单按钮随之消失） */
const hallTakenCard = (order, runnerName) => {
  const lines = [
    `订单号：${order.orderNo}`,
    `前往地点：${order.station}`,
    `目的地：${order.deliverPlace}`,
    `已由 ${runnerName} 抢单，等待送达中`,
  ];
  if (order.remark) lines.push(`备注：${order.remark}`);
  return {
    type: 'card',
    theme: 'info',
    modules: [
      header(`🛵 已被接单 · ¥${Number(order.reward).toFixed(2)}`),
      { type: 'section', text: { type: 'plain-text', content: lines.join('\n') } },
    ],
  };
};

/**
 * 订单待确定频道卡片：管理员核对付款截图，点「确认到账」→ 订单进大厅
 * 截图走 kook asset 上传后嵌入（失败则无图）
 */
const adminCheckCard = (order, employerName, employerUid, screenshotUrl) => {
  const lines = [
    `订单号：${order.orderNo}`,
    `雇主：${employerName}`,
    `ID：${employerUid || '—'}`,
    `金额：¥${Number(order.reward).toFixed(2)}`,
    `前往地点：${order.station}`,
    `目的地：${order.deliverPlace}`,
  ];
  if (order.remark) lines.push(`备注：${order.remark}`);
  const modules = [
    header('🧾 新悬赏待核对'),
    { type: 'section', text: { type: 'plain-text', content: lines.join('\n') } },
  ];
  if (screenshotUrl) modules.push(imageGroup([screenshotUrl]));
  modules.push(
    actionGroup([
      button('✅ 确认到账并发布', 'success', 'mark-paid', order.id),
      button('🗑 删除订单', 'danger', 'delete-order', order.id),
    ]),
    context(screenshotUrl
      ? '核对无误后可确认发布；恶意/重复下单可删除（物理删除不可恢复）'
      : '核对收款记录无误即可确认（付款截图可后补，上传后自动显示）')
  );
  return { type: 'card', theme: 'warning', modules };
};

/** 已确认的待核对卡片（message/update 更新旧卡用，替换掉按钮） */
const adminConfirmedCard = (order) => ({
  type: 'card',
  theme: 'success',
  modules: [
    header('✅ 已确认并发布'),
    {
      type: 'section',
      text: {
        type: 'plain-text',
        content: [
          `订单号：${order.orderNo}`,
          `雇主已付款，订单已发布到接单大厅。`,
        ].join('\n'),
      },
    },
  ],
});

/** 已删除的待核对卡片（删除订单后更新旧卡用） */
const adminDeletedCard = (orderNo) => ({
  type: 'card',
  theme: 'danger',
  modules: [
    header('🗑 订单已删除'),
    {
      type: 'section',
      text: {
        type: 'plain-text',
        content: [`订单号：${orderNo}`, `已由管理员删除（不记入流水）。`].join('\n'),
      },
    },
  ],
});

/** 抢单成功 → DM 跑腿员：取件码明文 + 标记送达按钮 */
const runnerAcceptedCard = (order, employerName) => ({
  type: 'card',
  theme: 'success',
  modules: [
    header('🏃 接单成功！'),
    section(`**${order.station}** → **${order.deliverPlace}**`),
    section(
      `单号：${order.orderNo}\n取件码：**${order.pickupCode}**\n雇主电话：${order.contactPhone}\n报酬：¥${Number(order.reward).toFixed(2)}`
    ),
    actionGroup([button('📦 我已送达', 'primary', 'deliver', order.id)]),
    context(`雇主：${employerName} · 送达后请通知雇主确认`),
  ],
});

/** 抢单成功 → DM 雇主：谁接了单（含猎人 ID/电话，方便联系确认） */
const employerAcceptedCard = (order, runnerUser) => {
  const name = runnerUser ? runnerUser.nickname || runnerUser.username : '未知用户';
  const uid = runnerUser && runnerUser.uid ? runnerUser.uid : (runnerUser ? String(runnerUser.id) : '—');
  const phone = runnerUser && runnerUser.phone ? runnerUser.phone : '未填';
  return {
    type: 'card',
    theme: 'info',
    modules: [
      header('🎉 你的悬赏已被接拍'),
      {
        type: 'section',
        text: {
          type: 'plain-text',
          content: [
            `赏金猎人：${name}`,
            `ID：${uid}`,
            `电话：${phone}`,
            `路线：${order.station} → ${order.deliverPlace}`,
            `单号：${order.orderNo}`,
          ].join('\n'),
        },
      },
      context('可私聊猎人确认送取事项；送达后你会收到确认提醒'),
    ],
  };
};

/** 送达 → DM 雇主：确认收货按钮（有照片则带图） */
const employerDeliveredCard = (order, photoUrl) => {
  const modules = [
    header('📦 快递已送达！'),
    section(`**${order.deliverPlace}**\n单号：${order.orderNo}`),
  ];
  if (photoUrl) modules.push(imageGroup([photoUrl]));
  modules.push(
    actionGroup([button('✅ 确认已收到', 'success', 'confirm', order.id)]),
    context('确认后本单完成，跑腿员赏金即刻结算')
  );
  return { type: 'card', theme: 'warning', modules };
};

/** 雇主确认后的「已送达」卡片更新为已完成（原卡按钮消失） */
const employerConfirmedCard = (order) => ({
  type: 'card',
  theme: 'success',
  modules: [
    header('✅ 订单已完成'),
    {
      type: 'section',
      text: {
        type: 'plain-text',
        content: [
          `单号：${order.orderNo}`,
          `悬赏已确认到账，跑腿员收益进入当日结算。`,
        ].join('\n'),
      },
    },
  ],
});

/** 确认收货 → DM 跑腿员：跑单完成 */
const runnerConfirmedCard = (order) => ({
  type: 'card',
  theme: 'success',
  modules: [
    header('💰 悬赏已确认！'),
    section(
      `雇主已确认收到快递\n\n本单佣金：¥${Number(order.reward).toFixed(2)}\n平台服务费：¥${Number(order.fee).toFixed(2)}\n你的实得：**¥${(order.reward - order.fee).toFixed(2)}**`
    ),
    context(`单号：${order.orderNo} · 每日结算后统一转账`),
  ],
});

/** 取消 → DM 雇主/跑腿员 */
const cancelCard = (order, reason) => ({
  type: 'card',
  theme: 'danger',
  modules: [
    header('❌ 订单已取消'),
    section(`单号：${order.orderNo}\n${reason || ''}`),
    context('如有疑问请联系管理员'),
  ],
});

/* ================= 交互式下单（Kook 私信） ================= */

/** 下单频道入口卡（固定发布，带【🎯 下单】按钮） */
const orderEntryCard = () => ({
  type: 'card',
  theme: 'primary',
  modules: [
    header('📦 发布悬赏'),
    { type: 'section', text: { type: 'plain-text', content: '点击下方按钮开始下单，机器人会在私信里逐步引导你完成。' } },
    actionGroup([button('🎯 下单', 'primary', 'publish-start', 0)]),
  ],
});

/** 选项卡（站点/目的地等按钮列表）：每页最多 4 个按钮（Kook 限制），超出自动分页 */
const pickCard = (title, items, act, page = 0, pageSize = 4) => {
  const slice = (items || []).slice(page * pageSize, (page + 1) * pageSize);
  const els = slice.map((n) => button(n, 'primary', act, n));
  if ((items || []).length > (page + 1) * pageSize) {
    els.push(button(`➡ 更多（共 ${items.length} 个）`, 'secondary', `${act}-more`, page + 1));
  }
  if (page > 0) els.push(button('🔄 上一页', 'secondary', `${act}-more`, page - 1));
  return {
    type: 'card',
    theme: randomTheme(),
    modules: [header(title), actionGroup(els)],
  };
};

/** 付款卡：收款码 + 管理员微信 + 金额 + 【我已确认付款】（按钮置于图片前：私信卡片的按钮在图片之后不渲染） */
const payCard = (order, payInfo) => {
  const lines = [
    `订单号：${order.orderNo}`,
    `取件驿站：${order.station}`,
    `送达地址：${order.deliverPlace}`,
    `悬赏金额：**¥${Number(order.reward).toFixed(2)}**`,
  ];
  if (payInfo.contactWechat) lines.push(`管理员微信：${payInfo.contactWechat}`);
  const modules = [
    { type: 'header', text: { type: 'plain-text', content: `💳 请支付 ¥${Number(order.reward).toFixed(2)}` } },
    { type: 'section', text: { type: 'kmarkdown', content: lines.join('\n') } },
    actionGroup([button('✅ 我已确认付款', 'success', 'confirm-pay', order.id)]),
    {
      type: 'context',
      elements: [{ type: 'plain-text', content: payInfo.contactWechat ? '扫码或添加管理员微信转账，转账备注订单号' : '请扫码转账，备注订单号' }],
    },
  ];
  const qr = payInfo.payQrWx || payInfo.payQrAlipay;
  if (qr) modules.push({ type: 'image-group', elements: [{ type: 'image', src: qr }] });
  return { type: 'card', theme: 'warning', modules };
};

/** 是否上传付款截图 */
const screenshotAskCard = (orderId) => ({
  type: 'card',
  theme: 'info',
  modules: [
    header('📸 是否愿意上传付款截图？'),
    { type: 'section', text: { type: 'plain-text', content: '上传截图可加速管理员核对；不上传则管理员核对收款记录后同样会确认。' } },
    actionGroup([
      button('✔ 愿意，上传截图', 'primary', 'upload-shot-yes', orderId),
      button('✖ 不愿意', 'secondary', 'upload-shot-no', orderId),
    ]),
  ],
});

/** 下单完成（等待管理员审核） */
const publishDoneCard = (order) => ({
  type: 'card',
  theme: 'success',
  modules: [
    header('✅ 下单成功，等待管理员审核'),
    {
      type: 'section',
      text: {
        type: 'plain-text',
        content: [
          `订单号：${order.orderNo}`,
          `金额：¥${Number(order.reward).toFixed(2)}`,
          `审核通过后订单将发布到接单大厅，会私信通知你。`,
        ].join('\n'),
      },
    },
    context('订单详情可随时咨询管理员'),
  ],
});

/** 审核完成 → 雇主（发布大厅前可取消；已接单后取消需退款） */
const publisherPaidCard = (order) => ({
  type: 'card',
  theme: 'success',
  modules: [
    header('✅ 审核完成，订单已上架'),
    {
      type: 'section',
      text: {
        type: 'plain-text',
        content: [
          `订单号：${order.orderNo}`,
          `你的悬赏已发布到接单大厅，赏金猎人即将接单。`,
        ].join('\n'),
      },
    },
    actionGroup([button('🛑 取消订单', 'danger', 'cancel-own', order.id)]),
  ],
});

/** 取消后退款提示（发送管理员微信号） */
const cancelRefundCard = (contactWechat) => ({
  type: 'card',
  theme: 'danger',
  modules: [
    header('🧾 订单已取消'),
    {
      type: 'section',
      text: {
        type: 'plain-text',
        content: contactWechat
          ? `请在付款后 24 小时内联系管理员退款：${contactWechat}`
          : '请及时联系管理员处理退款事宜',
      },
    },
  ],
});

module.exports = {
  header,
  randomTheme,
  encodeBtn,
  decodeBtn,
  hallCard,
  hallTakenCard,
  adminCheckCard,
  adminConfirmedCard,
  adminDeletedCard,
  runnerAcceptedCard,
  employerAcceptedCard,
  employerDeliveredCard,
  employerConfirmedCard,
  runnerConfirmedCard,
  cancelCard,
  orderEntryCard,
  pickCard,
  payCard,
  screenshotAskCard,
  publishDoneCard,
  publisherPaidCard,
  cancelRefundCard,
};
