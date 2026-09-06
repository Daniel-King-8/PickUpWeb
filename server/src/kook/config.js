/**
 * Kook 机器人配置读取
 *
 * 配置存 Setting 表（key-value，后台可改，重启即生效），
 * token 亦可用环境变量 KOOK_BOT_TOKEN 兜底（docker-compose 偏好环境变量）。
 * token 为空 → 整个模块禁用（enabled()=false），不影响平台原有功能。
 *
 * 频道结构（与用户 Kook 服务器「取个件呗」对应）：
 *   - kookAdminChannelId   # 订单待确定：待核对告警卡片（含确认按钮）
 *   - kookHallChannelId    # 接单大厅：确认后的订单卡片（含抢单按钮），单频道，卡片标注校区
 */
const { Setting } = require('../models');

const KEYS = {
  token: 'kookBotToken',
  guild: 'kookGuildId',
  hall: 'kookHallChannelId',
  admin: 'kookAdminChannelId',
  order: 'kookOrderChannelId',
};

/**
 * 读取全部 Kook 配置（每次实时读库；数据库配置优先，环境变量兜底）
 * 环境变量（docker-compose 推荐，服务器上写 .env）：
 *   KOOK_BOT_TOKEN / KOOK_GUILD_ID / KOOK_HALL_CHANNEL_ID / KOOK_ADMIN_CHANNEL_ID
 * 数据库（后台「Kook 对接」页保存）与 env 等价，取非空者。
 */
async function getKookConfig() {
  const list = await Setting.findAll({ where: { key: Object.values(KEYS) } });
  const map = {};
  list.forEach((s) => (map[s.key] = s.value));
  return {
    token: map[KEYS.token] || process.env.KOOK_BOT_TOKEN || '',
    guildId: map[KEYS.guild] || process.env.KOOK_GUILD_ID || '',
    hallChannelId: map[KEYS.hall] || process.env.KOOK_HALL_CHANNEL_ID || '',
    adminChannelId: map[KEYS.admin] || process.env.KOOK_ADMIN_CHANNEL_ID || '',
    orderChannelId: map[KEYS.order] || process.env.KOOK_ORDER_CHANNEL_ID || '',
  };
}

/** 是否启用：token 非空即可 */
async function enabled() {
  const cfg = await getKookConfig();
  return !!cfg.token;
}

module.exports = { getKookConfig, enabled, KEYS };
