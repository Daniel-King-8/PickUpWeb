<template>
  <!-- 底部固定导航（route 模式：自动点亮当前页面） -->
  <van-tabbar route fixed placeholder>
    <van-tabbar-item replace to="/" icon="wap-home-o">接单大厅</van-tabbar-item>
    <van-tabbar-item replace to="/publish" icon="add-o">发布悬赏</van-tabbar-item>
    <van-tabbar-item replace to="/run" icon="orders-o">已接悬赏</van-tabbar-item>
    <van-tabbar-item replace to="/orders/mine" icon="notes-o">已发悬赏</van-tabbar-item>
    <van-tabbar-item replace to="/me" icon="user-o">我的</van-tabbar-item>
  </van-tabbar>
</template>

<script setup>
// 底部导航：仅底部四页显示（App.vue 控制显示条件）
</script>
