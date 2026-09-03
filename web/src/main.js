/**
 * 前端入口：Vue3 + vue-router + Vant（按需自动引入）
 */
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
// 全量引入 Vant 样式：保证 showToast/showDialog/upload 等函数式组件的反馈可正常显示
import 'vant/lib/index.css';

createApp(App).use(router).mount('#app');
