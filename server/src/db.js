/**
 * 数据库初始化 —— 双模式：
 * - 生产（Docker）：USE_MYSQL=1 时连接独立 MySQL 容器
 * - 本地开发：SQLite 单文件（无需额外服务）
 */
const { Sequelize } = require('sequelize');
const path = require('path');

function createSequelize() {
  // 生产模式：MySQL（环境变量由 docker-compose 注入）
  if (process.env.USE_MYSQL === '1') {
    return new Sequelize(
      process.env.DB_NAME || 'pickup',
      process.env.DB_USER || 'pickup',
      process.env.DB_PASSWORD || '',
      {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 3306),
        dialect: 'mysql',
        logging: false,
        define: { charset: 'utf8mb4' },
      }
    );
  }
  // 本地开发：SQLite 单文件
  return new Sequelize({
    dialect: 'sqlite',
    storage: process.env.DB_PATH || path.join(__dirname, '../data/pickup.db'),
    logging: false,
  });
}

module.exports = createSequelize();
