/**
 * API 请求封装：axios + token（localStorage）
 *
 * 后端统一响应格式 { code, data, message }，code=0 表示成功。
 * 本拦截器在成功时自动解包：所有页面拿到的 res.data 直接就是业务数据（数组/对象），
 * 无需再关心 code 层级；code != 0 时抛出带 message 的错误并提示。
 */
import axios from 'axios';
import { showToast } from 'vant';

const api = axios.create({ baseURL: '/api', timeout: 15000 });

// 自动附带登录 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 统一解包业务响应
api.interceptors.response.use(
  (res) => {
    const body = res.data;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code !== 0) {
        const msg = body.message || '操作失败';
        showToast(msg);
        const err = new Error(msg);
        err.code = body.code;
        return Promise.reject(err);
      }
      // 解包：res.data 变为业务数据层（数组或对象）
      res.data = body.data;
    }
    return res;
  },
  (err) => {
    const status = err.response && err.response.status;
    const message =
      (err.response && err.response.data && err.response.data.message) ||
      err.message ||
      '请求失败';
    if (status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // history 路由模式下判断 pathname，避免在登录页 401 触发刷新死循环
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    showToast(message);
    return Promise.reject(err);
  }
);

export default api;
