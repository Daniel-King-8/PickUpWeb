/**
 * 数据模型定义
 *
 * 订单状态机：
 * PAYING(待支付) → PAID(已支付/待接单) → ACCEPTED(已接单) → DELIVERED(已送达/待确认)
 *   → CONFIRMED(已完成) → 结算后 SETTLED(已结算)
 * 任意待支付后不可接单阶段可 CANCELED
 */
const { DataTypes } = require('sequelize');
const db = require('../db');

/** 用户表：普通用户与管理员同一张表（role 区分） */
const User = db.define(
  'users',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // 10 位纯数字用户ID（注册生成，管理员可改；唯一性由代码层校验保障，
    // 不加 unique 约束：SQLite 对已有表 ADD COLUMN 带唯一约束会失败）
    uid: { type: DataTypes.STRING(10), defaultValue: null },
    username: { type: DataTypes.STRING(50), unique: true, allowNull: false },
    nickname: { type: DataTypes.STRING(50), defaultValue: '' }, // 昵称（用户可改，不影响登录账号）
    password: { type: DataTypes.STRING(255), allowNull: false }, // bcrypt 哈希
    phone: { type: DataTypes.STRING(20), defaultValue: '' },
    role: { type: DataTypes.ENUM('user', 'admin'), defaultValue: 'user' },
    campus: { type: DataTypes.STRING(20), defaultValue: '' }, // 校区 id（scyz/cdny），首次登录选择
    isHunter: { type: DataTypes.BOOLEAN, defaultValue: false }, // 赏金猎人身份（接单资格），管理员授予
    hunterApplyAt: { type: DataTypes.DATE, defaultValue: null }, // 申请成为赏金猎人的时间（待审核标记）
    // Kook 机器人绑定：Kook 用户 id（纯数字串）。唯一性由代码层校验保障
    // （不加 unique 约束：与 uid 同因，SQLite 对已有表 ADD COLUMN 带唯一约束会失败）
    kookId: { type: DataTypes.STRING(32), defaultValue: null },
  },
  { tableName: 'users' }
);

/** 订单表 */
const Order = db.define(
  'orders',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderNo: { type: DataTypes.STRING(32), unique: true, allowNull: false },
    campus: { type: DataTypes.STRING(20), defaultValue: '' }, // 订单所属校区（服务端从用户档案继承）
    station: { type: DataTypes.STRING(50), allowNull: false }, // 取件驿站
    pickupCode: { type: DataTypes.STRING(50), allowNull: false }, // 取件码
    deliverPlace: { type: DataTypes.STRING(100), allowNull: false }, // 送达地址
    contactPhone: { type: DataTypes.STRING(20), allowNull: false }, // 联系电话
    remark: { type: DataTypes.STRING(255), defaultValue: '' },
    reward: { type: DataTypes.FLOAT, allowNull: false }, // 跑腿费
    fee: { type: DataTypes.FLOAT, allowNull: false }, // 平台抽成
    status: {
      type: DataTypes.ENUM(
        'PAYING',
        'PAID',
        'ACCEPTED',
        'DELIVERED',
        'CONFIRMED',
        'SETTLED',
        'CANCELED'
      ),
      defaultValue: 'PAYING',
    },
    payerScreenshot: { type: DataTypes.STRING(255), defaultValue: '' }, // 付款截图
    publisherId: { type: DataTypes.INTEGER, allowNull: true }, // 雇主
    runnerId: { type: DataTypes.INTEGER, allowNull: true }, // 跑腿员
    deliveryPhoto: { type: DataTypes.STRING(255), defaultValue: '' }, // 送达照片
    paidAt: { type: DataTypes.DATE, allowNull: true },
    acceptedAt: { type: DataTypes.DATE, allowNull: true },
    deliveredAt: { type: DataTypes.DATE, allowNull: true },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
    settledAt: { type: DataTypes.DATE, allowNull: true },
    settledInId: { type: DataTypes.INTEGER, allowNull: true }, // 所属结算单
  },
  { tableName: 'orders' }
);

/** 每日结算单（管理员按天给跑腿员转账，一张结算单=一个跑腿员一天） */
const Settlement = db.define(
  'settlements',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    settleDate: { type: DataTypes.STRING(10), allowNull: false }, // YYYY-MM-DD
    runnerId: { type: DataTypes.INTEGER, allowNull: false },
    totalReward: { type: DataTypes.FLOAT, allowNull: false }, // 跑腿费合计
    totalFee: { type: DataTypes.FLOAT, allowNull: false }, // 抽成合计
    netPay: { type: DataTypes.FLOAT, allowNull: false }, // 实付跑腿员 = reward - fee
    orderIdsJson: { type: DataTypes.TEXT, allowNull: false }, // 关联订单 ID 快照
    status: { type: DataTypes.ENUM('pending', 'paid'), defaultValue: 'pending' },
    paidAt: { type: DataTypes.DATE, allowNull: true },
    remark: { type: DataTypes.STRING(100), defaultValue: '' },
  },
  { tableName: 'settlements' }
);

/** 系统设置（费率规则、抽成比例等，key-value） */
const Setting = db.define(
  'settings',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    key: { type: DataTypes.STRING(50), unique: true, allowNull: false },
    value: { type: DataTypes.TEXT, allowNull: false },
  },
  { tableName: 'settings' }
);

module.exports = { User, Order, Settlement, Setting };
