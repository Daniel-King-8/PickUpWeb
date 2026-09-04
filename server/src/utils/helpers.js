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
 * 根据费率规则计算跑腿费
 * @param {object} rules 费率规则对象
 * @param {object} r  { stations: {名称: 基础价}, towerRules: [{from,to,extra}], commission: {type,value} }
 * @param {string} station 驿站名
 * @param {string} deliverPlace 送达地址
 * @returns {{reward: number, fee: number, detail: string}}
 */
function calcFee(rules, station, deliverPlace) {
  const base = (rules.stations && rules.stations[station]) || rules.stations['其他'] || 2;
  const towerNo = parseTowerNo(deliverPlace);
  let extra = 0;
  for (const rule of rules.towerRules || []) {
    if (towerNo !== null && towerNo >= rule.from && towerNo <= rule.to) {
      extra = rule.extra;
      break;
    }
  }
  const reward = Number((base + extra).toFixed(2));

  // 抽成：type=fixed 固定金额 / type=percent 按比例
  let fee = 0;
  if (rules.commission && rules.commission.type === 'percent') {
    fee = Number((reward * rules.commission.value).toFixed(2));
  } else {
    fee = Number((rules.commission && rules.commission.value) || 0);
  }

  return { reward, fee, detail: `基础 ${base} + 楼栋附加 ${extra}` };
}

module.exports = { maskCode, generateOrderNo, generateUid, cnToday, parseTowerNo, calcFee };
