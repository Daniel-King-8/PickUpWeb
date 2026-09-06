/**
 * Kook WebSocket 客户端（官方信令实现）
 *
 * 信令约定：
 *   s=1 HELLO（连接成功，返回 session_id） → s=0 EVENT（事件，带 sn 需保序）
 *   s=2 PING（客户端心跳，每 30±5 秒，携带 sn） → s=3 PONG
 *   s=5 RECONNECT（服务端要求重连，须清空 sn/session_id 全量重来）
 *   断线 resume：gateway ws 地址后拼 resume=1&sn=&session_id=（前 3 次重连尝试，服务器补发离线消息）
 *
 * 对外接口：
 *   start()            启动（幂等，无 token 时静默返回）
 *   onEvent(fn)        设置事件处理器（按 sn 顺序串行调用）
 *   status()           当前状态（后台状态卡展示）
 */
const WebSocket = require('ws');
const { getGateway } = require('./api');
const { getKookConfig } = require('./config');

const state = {
  ws: null,
  status: 'IDLE', // IDLE/GETTING_GATEWAY/CONNECTING/READY/RECONNECTING
  sessionId: '',
  lastSn: 0,
  lastPingAt: null,
  lastError: '',
  reconnectAttempt: 0,
  resumeTried: 0,
};

let eventHandler = null; // (event) => void，顺序串行调用
let queueChain = Promise.resolve(); // 事件按 sn 串行消费，避免并发乱序
let pingTimer = null;
let waitPongTimer = null;
let retryTimer = null;

/** 设置事件处理器（handler.js 注入） */
function onEvent(fn) {
  eventHandler = fn;
}

/** 状态快照，供后台状态卡（enabled 由 facade 依据配置注入） */
function status() {
  return {
    wsState: state.status,
    sessionId: state.sessionId,
    lastSn: state.lastSn,
    lastPingAt: state.lastPingAt,
    lastError: state.lastError,
    reconnectAttempt: state.reconnectAttempt,
  };
}

/** 日志助手 */
function log(msg) {
  console.log('[kook-ws]', msg);
}

/**
 * 心动脉冲：立即发一次 ping，此后每 30(+0~5 随机) 秒发 ping(sn)。
 * 【关键】Kook 网关在 HELLO 后须收到首个 ping 才会开始推送事件，
 * 实测若等 30 秒才发首个 ping，事件将一直不推送。
 * 6 秒内无 pong 判定死连 → 触发重连
 */
function sendPing() {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  try {
    state.ws.send(JSON.stringify({ s: 2, sn: state.lastSn }));
  } catch (e) {
    /* 发送失败由 close/error 兜底 */
  }
  state.lastPingAt = Date.now();
  clearTimeout(waitPongTimer);
  waitPongTimer = setTimeout(() => {
    log('心跳超时（6 秒未收 PONG），判定连接失效');
    state.ws && state.ws.close(); // 触发重连
  }, 6000);
}

function scheduleHeartbeat() {
  clearTimeout(pingTimer);
  pingTimer = setTimeout(sendPing, 30000 + Math.floor(Math.random() * 5000));
}

/**
 * 拼接 ws 地址：基础网关 URL + compress 已带；resume 尝试时追加 resume/sn/session_id
 */
function buildWsUrl(gatewayUrl) {
  // gateway/index?compress=0 返回的 url 通常已含 compress 参数
  let url;
  try {
    url = new URL(gatewayUrl);
  } catch (e) {
    return gatewayUrl;
  }
  const doResume = state.resumeTried < 3 && state.sessionId;
  if (doResume) {
    state.resumeTried++;
    url.searchParams.set('resume', '1');
    url.searchParams.set('sn', String(state.lastSn));
    url.searchParams.set('session_id', state.sessionId);
  }
  return url.toString();
}

/** 重连调度（指数退避：1s 起，最大 60s，±30% 随机抖动） */
function scheduleReconnect() {
  clearTimeout(retryTimer);
  state.status = 'RECONNECTING';
  state.reconnectAttempt++;
  const backoff = Math.min(1000 * 2 ** Math.min(state.reconnectAttempt, 6), 60000);
  const jitter = backoff * (0.7 + Math.random() * 0.6); // ±30%
  log(`连接断开，${Math.round(jitter / 1000)}s 后重连（尝试 #${state.reconnectAttempt}，resume=${state.resumeTried < 3 && state.sessionId ? '是' : '否'}）`);
  retryTimer = setTimeout(() => connect().catch(() => scheduleReconnect()), jitter);
}

/**
 * 建立连接：拿 gateway → 建 ws → 处理信令
 * 成功（HELLO）后自行进入心跳循环；失败/断开由 scheduleReconnect 兜底
 */
async function connect() {
  state.status = 'GETTING_GATEWAY';
  const cfg = await getKookConfig(); // token 优先 Setting 表（后台配置），环境变量兜底
  if (!cfg.token) {
    state.lastError = 'Kook token 未配置';
    throw new Error(state.lastError);
  }
  const gatewayUrl = await getGateway(cfg.token);
  if (!gatewayUrl) {
    state.lastError = '获取网关失败';
    throw new Error(state.lastError);
  }
  state.status = 'CONNECTING';
  const ws = new WebSocket(buildWsUrl(gatewayUrl));
  state.ws = ws;

  let helloOk = false; // 本次连接是否已 HELLO（用于 resume 失败判定）

  ws.on('message', (buf) => {
    let packet;
    try {
      packet = JSON.parse(buf.toString());
    } catch (e) {
      return; // 非 JSON 帧忽略
    }
    const { s, d } = packet;
    switch (s) {
      case 1: {
        // HELLO：连接成功。code=0 才有 session_id（40101/40102/40103 为 token 类错误）
        if (!d || d.code !== 0 || !d.session_id) {
          state.lastError = `HELLO 失败 code=${d && d.code}`;
          log(`HELLO 失败: ${JSON.stringify(d)}`);
          ws.close();
          return;
        }
        // resume 尝试时 session_id 与旧值不同 → 会话已失效，按新会话处理（sn 归零）
        if (state.resumeTried > 0 && state.sessionId !== '' && state.sessionId !== d.session_id) {
          log('resume 失败（session_id 已变更），按新会话全量重来');
          state.lastSn = 0;
        }
        state.sessionId = d.session_id;
        state.reconnectAttempt = 0;
        state.status = 'READY';
        helloOk = true;
        log(`已连接 Kook（session_id=${d.session_id}，上次 sn=${state.lastSn}）`);
        sendPing(); // 立即首个 ping：网关自此才开始推送事件
        scheduleHeartbeat();
        break;
      }
      case 0: {
        // 事件：sn 序号在信令顶层 packet.sn（不在 d 内），去重 + 顺序消费
        const sn = packet.sn;
        if (typeof sn !== 'number' || sn <= state.lastSn) return;
        state.lastSn = sn;
        queueChain = queueChain
          .then(() => eventHandler && eventHandler(d))
          .catch((e) => console.warn('[kook-ws] 事件处理异常:', e.message));
        break;
      }
      case 3:
        // PONG：心跳正常
        clearTimeout(waitPongTimer);
        break;
      case 5:
        // RECONNECT：会话失效，清空后全量重连（不 resume）
        log('收到 RECONNECT，清空会话重新连接');
        state.sessionId = '';
        state.lastSn = 0;
        state.resumeTried = 0;
        ws.close();
        break;
      default:
        break;
    }
  });

  ws.on('error', (err) => {
    state.lastError = err.message;
    console.warn('[kook-ws] 连接错误:', err.message);
    // error 后通常跟 close，不重复调度；若未触发 close 则主动关闭
    try {
      ws.close();
    } catch (e) {
      /* 忽略 */
    }
  });

  ws.on('close', () => {
    // 优雅关闭（应用停止时）不进入重连
    if (stopping) return;
    clearTimeout(pingTimer);
    clearTimeout(waitPongTimer);
    if (helloOk) state.resumeTried = 0; // 会话存活期间失败 → 重新允许 3 次 resume
    scheduleReconnect();
  });
}

let stopping = false;

/** 启动（幂等；由 facade 在已确认 enabled 后调用） */
async function start() {
  if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
    log('已在运行，跳过启动');
    return;
  }
  stopping = false;
  try {
    await connect();
  } catch (e) {
    scheduleReconnect();
  }
}

/** 优雅停止（进程退出时可选调用） */
function stop() {
  stopping = true;
  clearTimeout(pingTimer);
  clearTimeout(waitPongTimer);
  clearTimeout(retryTimer);
  if (state.ws) {
    try {
      state.ws.close();
    } catch (e) {
      /* 忽略 */
    }
  }
  state.status = 'IDLE';
}

module.exports = { start, stop, onEvent, status };
