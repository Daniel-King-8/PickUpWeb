/**
 * 数据库初始化 —— Sequelize + SQLite
 * 数据文件放 /data 目录（Docker 卷挂载，容器重建不丢数据）
 */
const { Sequelize } = require('sequelize');
const path = require('path');

const db = new Sequelize({
  dialect: 'sqlite',
  storage: process.env.DB_PATH || path.join(__dirname, '../data/pickup.db'),
  logging: false,
});

module.exports = db;
