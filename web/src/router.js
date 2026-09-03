/**
 * 前端路由：
 * - 雇主端：登录 / 下单 / 我的订单 / 订单详情 / 待支付
 * - 跑腿员端：接单大厅 / 我的跑单（同订单详情）
 * - 管理后台：核对 / 结算 / 设置（isAdmin 守卫）
 */
import { createRouter, createWebHistory } from 'vue-router';
import { isLoggedIn, isAdmin } from './store';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue'), meta: { auth: true } },
    { path: '/orders/mine', name: 'myOrders', component: () => import('./views/MyOrdersView.vue'), meta: { auth: true } },
    { path: '/orders/:id', name: 'orderDetail', component: () => import('./views/OrderDetailView.vue'), meta: { auth: true } },
    { path: '/pay/:id', name: 'pay', component: () => import('./views/PayView.vue'), meta: { auth: true } },
    { path: '/hall', name: 'hall', component: () => import('./views/HallView.vue'), meta: { auth: true } },
    { path: '/run/mine', name: 'runMine', component: () => import('./views/RunMineView.vue'), meta: { auth: true } },
    { path: '/admin', name: 'admin', component: () => import('./views/admin/AdminView.vue'), meta: { auth: true, admin: true } },
    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
});

// 守卫：未登录跳登录页；admin 路由拦截
router.beforeEach((to) => {
  if (to.meta && to.meta.auth && !isLoggedIn()) return { path: '/login' };
  if (to.meta && to.meta.admin && !isAdmin()) return { path: '/' };
  return true;
});

export default router;
