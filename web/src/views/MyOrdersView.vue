<template>
  <div class="page">
    <van-nav-bar title="我发布的订单" left-arrow @click-left="$router.push('/')" />
    <van-tabs v-model:active="activeTab" sticky @change="load">
      <van-tab title="全部" name=""></van-tab>
      <van-tab title="待支付" name="PAYING"></van-tab>
      <van-tab title="待接单" name="PAID"></van-tab>
      <van-tab title="已接单" name="ACCEPTED"></van-tab>
      <van-tab title="已完成" name="CONFIRMED"></van-tab>
    </van-tabs>

    <div class="list">
      <van-empty v-if="!loading && list.length === 0" description="暂无相关订单" image="orders-o" />
      <div
        v-for="o in list"
        :key="o.id"
        class="order-card"
        @click="$router.push(`/orders/${o.id}`)"
      >
        <div class="card-top">
          <span class="status" :class="`status--${o.status}`">{{ statusText(o.status) }}</span>
          <div class="reward-wrap">
            <span class="reward-unit">￥</span>
            <b class="reward-val">{{ o.reward.toFixed(2) }}</b>
          </div>
        </div>

        <div class="route-box">
          <div class="route-item">
            <span class="dot dot-from"></span>
            <span class="route-text"><strong>{{ o.station }}</strong></span>
          </div>
          <div class="route-line"></div>
          <div class="route-item">
            <span class="dot dot-to"></span>
            <span class="route-text">送至 <strong>{{ o.deliverPlace }}</strong></span>
          </div>
        </div>

        <div class="peer-row" v-if="o.runnerName">
          <van-icon name="user-o" />
          <span>跑腿员：{{ o.runnerName }}</span>
          <span class="muted">（ID: <span class="copyable copyable--inline" @click.stop="copyText(o.runnerUid, '跑腿员用户ID')">{{ o.runnerUid }}</span>）</span>
        </div>

        <div class="card-foot">
          <span class="no copyable copyable--inline" @click.stop="copyText(o.orderNo, '订单号')">{{ o.orderNo }}</span>
          <span class="arrow">订单详情 →</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import api from '../api';
import { copyText } from '../utils/copy';

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
  background: var(--bg-page);
  padding-bottom: 48px;
}
.list {
  padding: 12px 14px;
}
.order-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-light);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}
.order-card:active {
  transform: scale(0.99);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.status {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
}
.status--PAYING {
  background: #fff7ed;
  color: #ea580c;
  border: 1px solid rgba(234, 88, 12, 0.2);
}
.status--PAID {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.2);
}
.status--ACCEPTED {
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid rgba(37, 99, 235, 0.2);
}
.status--DELIVERED {
  background: #fffbeb;
  color: #d97706;
  border: 1px solid rgba(217, 119, 6, 0.2);
}
.status--CONFIRMED,
.status--SETTLED {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.2);
}
.status--CANCELED {
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.reward-wrap {
  display: flex;
  align-items: baseline;
  color: #ea580c;
}
.reward-unit {
  font-size: 13px;
  font-weight: 600;
}
.reward-val {
  font-size: 20px;
  font-weight: 700;
}

.route-box {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}
.route-line {
  position: absolute;
  left: 5px;
  top: 12px;
  bottom: 12px;
  width: 2px;
  background: #e2e8f0;
}
.route-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #1e293b;
}
.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  z-index: 1;
}
.dot-from {
  background: #10b981;
  border: 2px solid #ecfdf5;
}
.dot-to {
  background: #f59e0b;
  border: 2px solid #fffbeb;
}
.route-text {
  line-height: 1.4;
  word-break: break-all;
}

.peer-row {
  margin-top: 8px;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 8px;
  font-size: 12px;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 4px;
}
.peer-row .muted {
  color: #94a3b8;
}

.card-foot {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}
.no {
  font-family: monospace;
}
.arrow {
  color: var(--van-primary-color);
  font-weight: 600;
}
</style>
