/**
 * 公开接口（无需登录）：
 * - 费率规则（前端下拉/实时算费展示用）
 * - 收款信息（支付页展示收款码与联系文案）
 */
const express = require('express');
const { Setting } = require('../models');
const { calcFee } = require('../utils/helpers');

module.exports = () => {
  const router = express.Router();

  /** 读取 key 对应设置值并解析 JSON */
  async function getSettingJson(key) {
    const s = await Setting.findOne({ where: { key } });
    return s ? JSON.parse(s.value) : null;
  }

  /** 按校区取费率规则（含平台费/驿站/目的地名称列表），旧结构自动迁移 */
  async function getRulesByCampus(campus) {
    const s = await Setting.findOne({ where: { key: 'feeRules' } });
    if (!s) return null;
    let data;
    try {
      data = JSON.parse(s.value);
    } catch (e) {
      return null;
    }
    const rules = data && data.campuses ? (data.campuses[campus] || data.campuses.scyz) : data;
    if (!rules) return null;
    // 兼容旧结构：stations 对象 → 名称数组；towerRules → 目的地名称；commission → platformFee
    if (!rules.platformFee) {
      rules.platformFee = rules.commission && rules.commission.value != null ? rules.commission.value : 1.5;
    }
    if (!Array.isArray(rules.stations)) {
      rules.stations = rules.stations ? Object.keys(rules.stations) : [];
    }
    if (!Array.isArray(rules.destinations)) {
      rules.destinations = (rules.towerRules || []).map((t) =>
        t.from === t.to ? `${t.from}号楼` : `${t.from}-${t.to}号楼`
      );
    }
    return rules;
  }

  /** 费率与算费规则（?campus=scyz|cdny） */
  router.get('/fee-rules', async (req, res) => {
    const campus = req.query.campus || 'scyz';
    const rules = await getRulesByCampus(campus);
    if (!rules) return res.status(500).json({ code: 500, message: '费率未配置' });
    return res.json({ code: 0, data: rules });
  });

  /** 实时算费：station + deliverPlace + campus → { reward, fee, detail } */
  router.get('/fee', async (req, res) => {
    const { station, deliverPlace, campus = 'scyz' } = req.query;
    const rules = await getRulesByCampus(campus);
    if (!rules) return res.status(500).json({ code: 500, message: '费率未配置' });
    const result = calcFee(rules, station, deliverPlace);
    return res.json({ code: 0, data: result });
  });

  /** 支付页收款信息：微信/支付宝收款码图片 + 加微信引导文案 */
  router.get('/pay-info', async (req, res) => {
    const wx = await Setting.findOne({ where: { key: 'payQrWx' } });
    const ali = await Setting.findOne({ where: { key: 'payQrAlipay' } });
    const contact = await Setting.findOne({ where: { key: 'contactWechat' } });
    return res.json({
      code: 0,
      data: {
        payQrWx: wx ? wx.value : '',
        payQrAlipay: ali ? ali.value : '',
        contactWechat: contact ? contact.value : '',
      },
    });
  });

  return router;
};
