/**
 * API 路由聚合
 * 各功能模块在 routes/ 下按文件挂载
 */
const express = require('express');

module.exports = function mountRoutes(ctx) {
  const router = express.Router();

  router.use('/users', require('./users')(ctx));
  router.use('/orders', require('./orders')(ctx));
  router.use('/admin', require('./admin')(ctx));
  router.use('/public', require('./public')(ctx));
  router.use('/kook', require('./kook')(ctx));

  return router;
};
