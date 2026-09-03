<template>
  <div class="page">
    <van-nav-bar title="我的订单" left-arrow @click-left="$router.push('/')" />
    <van-tabs v-model:active="activeTab" @change="load">
      <van-tab title="全部" name=""></van-tab>
      <van-tab title="待支付" name="PAYING"></van-tab>
      <van-tab title="待接单" name="PAID"></van-tab>
      <van-tab title="已接单" name="ACCEPTED"></van-tab>
      <van-tab title="已完成" name="CONFIRMED"></van-tab>
    </van-tabs>
    <div class="list">
      <van-empty v-if="!loading && list.length === 0" description="暂无订单" />
      <div v-for="o in list" :key="o.id" class="order-card" @click="$router.push(`/orders/${o.id}`)">
        <div class="card-top">
          <span class="status status--{{o.status}}">{{ statusText(o.status) }}</span>
          <b class="reward">￥{{ o.reward.toFixed(2) }}</b>
        </div>
        <div class="card-line">{{ o.station }} · 送至 {{ o.deliverPlace }}</div>
        <div class="card-foot">
          <span class="no">{{ o.orderNo }}</span>
          <span class="arrow">详情 →</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import api from '../api';

const activeTab = ref('');
const list = ref([]);
const loading = ref(false);

const STATUS_TEXT = {
  PAYING: '待支付',
  PAID: '待接单',
  ACCEPTED: '已接单',
  DELIVERED: '待确认',
  CONFIRMED: '已完成',
  SETTLED: '已结算',
  CANCELED: '已取消',
};
function statusText(s) {
  return STATUS_TEXT[s] || s;
}

async function load() {
  loading.value = true;
  try {
    const res = await api.get('/orders/mine');
    list.value = activeTab.value
      ? res.data.filter((o) => o.status === activeTab.value)
      : res.data;
  } finally {
    loading.value = false;
  }
}

load();
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f7f8fa;
  padding-bottom: 40px;
}
.list {
  padding: 12px;
}
.order-card {
  background: #fff;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.status {
  font-size: 13px;
  padding: 2px 12px;
  border-radius: 12px;
  background: #e6f7f0;
  color: #00a870;
}
.reward {
  color: #fa550f;
}
.card-line {
  margin-top: 8px;
  font-size: 14px;
  color: #333;
}
.card-foot {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #999;
}
.arrow {
  color: #00a870;
}
</style>
