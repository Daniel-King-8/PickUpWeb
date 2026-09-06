/**
 * Kook HTTP API 客户端（原生 fetch，Node 22 内置）
 *
 * 所有调用失败返回 null 不抛出，由调用方决定降级（日志/跳过）。
 * 统一鉴权头：Authorization: Bot <token>
 */
const fs = require('fs');
const BASE = 'https://www.kookapp.cn/api/v3';

/**
 * 发送请求（带鉴权 + JSON 解析）
 * @returns {Promise<object|null>} { code, data, message } 或 null（网络/HTTP/解析失败）
 */
async function request(token, path, options = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bot ${token}`,
        // Kook 对 node 默认 UA 的风控敏感，统一带自定义 UA
        'User-Agent': 'pickup-web-kook-bot/1.0',
        ...(options.headers || {}),
      },
    });
    const body = await res.json();
    if (body && body.code === 0) return body;
    console.warn('[kook] API 失败:', path, body && (body.message || body.code));
    return null;
  } catch (e) {
    console.warn('[kook] API 请求异常:', path, e.message);
    return null;
  }
}

/** 获取 WebSocket 网关地址（compress=0 关闭压缩，省 zlib 解压；resume 参数由调用方拼在 ws 地址上） */
async function getGateway(token) {
  const res = await request(token, '/gateway/index?compress=0');
  return res && res.data ? res.data.url : null;
}

/**
 * 发送消息
 * @param {string} token Bot token
 * @param {string} targetId 频道 id（GROUP）或用户 id（PERSON）
 * @param {number} type 消息类型：1=文本 10=卡片
 * @param {string} content 文本内容 / 卡片 JSON 字符串
 * @returns {Promise<string|null>} msg_id
 */
async function sendMessage(token, targetId, type, content) {
  const res = await request(token, '/message/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_id: targetId, type, content }),
  });
  return res && res.data ? res.data.msg_id : null;
}

/**
 * 发送私信（direct-message 专用接口；message/create 只支持频道消息）
 * @param {string} token Bot token
 * @param {string} userId 用户 id
 * @param {number} type 消息类型：1=文本 10=卡片
 * @param {string} content 文本内容 / 卡片 JSON 字符串
 * @returns {Promise<string|null>} msg_id
 */
async function sendDirectMessage(token, userId, type, content) {
  const res = await request(token, '/direct-message/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_id: userId, type, content }),
  });
  return res && res.data ? res.data.msg_id : null;
}

/**
 * 上传图片/文件，换取 Kook 可用链接（卡片内媒体必须先走 asset）
 * @param {string} filePath 服务器本地文件路径
 * @returns {Promise<string|null>} 可嵌入卡片的 URL
 */
async function uploadAsset(token, filePath) {
  try {
    const fs = require('fs');
    const buf = fs.readFileSync(filePath);
    const blob = new Blob([buf]);
    const fd = new FormData();
    fd.append('file', blob, 'upload.png');
    const res = await request(token, '/asset/create', {
      method: 'POST',
      body: fd,
    });
    return res && res.data ? res.data.url : null;
  } catch (e) {
    console.warn('[kook] 上传素材失败:', e.message);
    return null;
  }
}

/**
 * 更新频道消息（仅 type 9/10 支持；按钮点击后把"待核对"卡片替换为"已确认"）
 * @returns {Promise<boolean>}
 */
async function updateMessage(token, msgId, content) {
  const res = await request(token, '/message/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg_id: msgId, content }),
  });
  return !!res;
}

/** 获取当前 Bot 自身信息（用于过滤自己发的事件，避免自回复） */
async function getMe(token) {
  const res = await request(token, '/user/me');
  return res && res.data ? res.data : null;
}

/**
 * 把本地 UPLOAD_DIR 下的 /uploads/xxx 文件上传为 Kook 素材（收款码/付款截图等）
 * @returns {Promise<string|null>} Kook 可用 URL 或 null
 */
async function uploadLocalAsset(token, url) {
  if (!url) return null;
  try {
    const path = require('path');
    const dir = process.env.UPLOAD_DIR || path.join(__dirname, '../data/uploads');
    const filePath = path.join(dir, path.basename(url));
    if (!fs.existsSync(filePath)) return null;
    return uploadAsset(token, filePath);
  } catch (e) {
    return null;
  }
}

module.exports = { getGateway, sendMessage, sendDirectMessage, updateMessage, uploadAsset, uploadLocalAsset, getMe };
