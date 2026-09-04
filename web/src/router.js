/**
 * 前端路由：
 * - 底部导航四页：/ 接单大厅、/publish 发布悬赏、/run 已接悬赏、/me 我的
 * - 辅助页：/campus 首次选择校区、/orders/mine 我发布的订单、/orders/:id 详情、/pay/:id 待支付
 * - 管理后台：/admin
 */
import { createRouter, createWebHistory } from 'vue-router';
import { isLoggedIn, getUser } from './store';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    { path: '/campus', name: 'campus', component: () => import('./views/CampusView.vue'), meta: { auth: true } },
    { path: '/', name: 'hall', component: () => import('./views/HallView.vue'), meta: { auth: true } },
    { path: '/publish', name: 'publish', component: () => import('./views/HomeView.vue'), meta: { auth: true } },
    { path: '/run', name: 'run', component: () => import('./views/RunMineView.vue'), meta: { auth: true } },
    { path: '/me', name: 'me', component: () => import('./views/MyView.vue'), meta: { auth: true } },
    { path: '/orders/mine', name: 'myOrders', component: () => import('./views/MyOrdersView.vue'), meta: { auth: true } },
    { path: '/orders/:id', name: 'orderDetail', component: () => import('./views/OrderDetailView.vue'), meta: { auth: true } },
    { path: '/pay/:id', name: 'pay', component: () => import('./views/PayView.vue'), meta: { auth: true } },
    { path: '/admin', name: 'admin', component: () => import('./views/admin/AdminView.vue'), meta: { auth: true, admin: true } },
    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
});

// 守卫1：未登录 → 登录页
// 守卫2：已登录但未选校区（除 admin）→ 校区选择页
router.beforeEach((to) => {
  if (to.meta && to.meta.auth && !isLoggedIn()) return { path: '/login' };
  if (to.meta && to.meta.admin && getUser() && getUser().role !== 'admin') return { path: '/' };
  const user = getUser();
  if (
    to.meta && to.meta.auth && user &&
    user.role !== 'admin' && !user.campus && to.path !== '/campus'
  ) {
    return { path: '/campus' };
  }
  return true;
});

export default router;
