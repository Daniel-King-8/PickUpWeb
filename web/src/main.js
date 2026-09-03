/**
 * 前端入口：Vue3 + vue-router + Vant（按需自动引入）
 */
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

createApp(App).use(router).mount('#app');
