<template>
  <router-view />
  <!-- 底部导航仅在四个主 tab 页显示 -->
  <AppTabbar v-if="showTabbar" />
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppTabbar from './components/AppTabbar.vue';
import './style.css';

const route = useRoute();
const TAB_PAGES = ['/', '/publish', '/run', '/orders/mine', '/me'];
const showTabbar = computed(() => TAB_PAGES.includes(route.path));
</script>
