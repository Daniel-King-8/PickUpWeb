/**
 * API 请求封装：axios + token（localStorage）
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

// 统一错误提示；401 清 token 跳登录
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response && err.response.status;
    const message =
      (err.response && err.response.data && err.response.data.message) ||
      err.message ||
      '请求失败';
    if (status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!location.hash.includes('/login')) {
        location.href = '/login';
      }
    }
    showToast(message);
    return Promise.reject(err);
  }
);

export default api;
