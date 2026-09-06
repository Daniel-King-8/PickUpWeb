/**
 * 公共工具函数
 */

/** 取件码脱敏：全部打码，未抢单用户看不到任何线索 */
function maskCode(code) {
  return '******';
}

/** 生成业务单号：KD + 时间戳后6位 + 随机4位 */
function generateOrderNo() {
  const ts = String(Date.now()).slice(-6);
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `KD${ts}${rand}`;
}

/** 生成 10 位纯数字用户ID（1000000000 ~ 9999999999） */
function generateUid() {
  return String(1000000000 + Math.floor(Math.random() * 9000000000));
}

/**
 * 按中国时区（UTC+8）计算当天日期 YYYY-MM-DD
 * 服务器容器默认 UTC 时区，需手动 +8 以保证"每日结算"按北京时间切天
 */
function cnToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 从送达地址解析楼栋编号（取第一个数字）
 * 例：'西一 201' → 201；'3号楼 302' → 3；'无数字' → null
 */
function parseTowerNo(place) {
  const m = String(place).match(/\d+/);
  return m ? Number(m[0]) : null;
}

/**
 * 计算跑腿费（简化模型）
 * 每单总价 = 基础 ¥1（跑腿员保底） + 平台费（平台收入，后台可调）
 * @param {object} rules 费率规则 { platformFee, stations[], destinations[] }
 * @returns {{reward: number, fee: number, detail: string}}
 */
function calcFee(rules) {
  const fee = Number((rules && rules.platformFee) || 0);
  const base = 1; // 基础价固定 ¥1，给跑腿员
  const reward = Number((base + fee).toFixed(2)); // 雇主付总额
  return { reward, fee, detail: `基础 ¥1 + 平台费 ¥${fee.toFixed(2)}(平台收取)` };
}

/**
 * 费率规则标准化（旧结构 → 新结构，按校区兼容）：
 * 旧：{ stations: {驿站名:true}, towerRules: [{from,to,extra}], commission: {value} }
 * 新：{ platformFee, stations: [名称], destinations: [名称] }
 * 新建库即新结构；旧库升级后由本函数在读取时统一转换，无需数据迁移。
 */
function normalizeFeeRules(data, campus) {
  if (!data) return null;
  let rules = data.campuses ? data.campuses[campus] || data.campuses.scyz || null : data;
  if (!rules) return null;
  const r = { ...rules };
  if (r.platformFee == null) {
    r.platformFee = r.commission && r.commission.value != null ? r.commission.value : 1.5;
  }
  if (!Array.isArray(r.stations)) {
    r.stations = r.stations ? Object.keys(r.stations) : [];
  }
  if (!Array.isArray(r.destinations)) {
    r.destinations = (r.towerRules || []).map((t) =>
      t.from === t.to ? `${t.from}号楼` : `${t.from}-${t.to}号楼`
    );
  }
  return r;
}

module.exports = { maskCode, generateOrderNo, generateUid, cnToday, parseTowerNo, calcFee, normalizeFeeRules };
