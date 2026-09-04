<template>
  <div class="page">
    <van-nav-bar title="我的跑单" left-arrow @click-left="$router.push('/hall')" />

    <van-empty v-if="!loading && list.length === 0" description="还没有接单记录" />

    <div class="list">
      <div v-for="o in list" :key="o.id" class="card" :class="isDone(o.status) ? 'card--done' : ''" @click="$router.push(`/orders/${o.id}`)">
        <div class="card-top">
          <span class="status" :class="isDone(o.status) ? 'status--done' : ''">{{ statusText(o.status) }}</span>
          <b class="reward">￥{{ o.reward.toFixed(2) }}</b>
        </div>
        <div class="line">{{ o.station }} · 送至 {{ o.deliverPlace }}</div>
        <div class="line line-peer">
          雇主：{{ o.publisherName }}（ID
          <span class="copyable copyable--inline" @click.stop="copyText(o.publisherUid, '雇主用户ID')">{{ o.publisherUid }}</span>）
        </div>
        <div class="card-foot">
          <span>{{ o.orderNo }}</span>
          <span class="hint">详情 →</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import api from '../api';
import { copyText } from '../utils/copy';

const list = ref([]);
const loading = ref(false);

const STATUS_TEXT = {
  ACCEPTED: '已接单',
  DELIVERED: '待雇主确认',
  CONFIRMED: '已完成',
  SETTLED: '已结算',
  CANCELED: '已取消',
};
const statusText = (s) => STATUS_TEXT[s] || s;

/** 已完成/已结算（显示灰色） */
function isDone(s) {
  return s === 'CONFIRMED' || s === 'SETTLED';
}

async function load() {
  loading.value = true;
  try {
    const res = await api.get('/orders/run-mine');
    list.value = res.data;
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
}
.list {
  padding: 12px;
}
.card {
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
  background: #fff3e6;
  color: #fa550f;
}
/* 已完成/已结算：整卡变灰 */
.status--done {
  background: #eee;
  color: #9aa0a6;
}
.card--done {
  opacity: 0.72;
}
.reward {
  color: #fa550f;
}
.line {
  margin-top: 8px;
  font-size: 14px;
  color: #333;
}
.line-peer {
  color: #8a8a8a;
  font-size: 12px;
}
.card-foot {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #999;
}
.hint {
  color: #00a870;
}
</style>
