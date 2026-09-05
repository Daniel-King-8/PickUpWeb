<template>
  <div class="page">
    <van-nav-bar title="我的跑单" left-arrow @click-left="$router.push('/')" />

    <!-- 顶部状态汇总提示 -->
    <div class="header-banner">
      <div class="header-title">🏃‍♂️ 赏金跑单任务</div>
      <div class="header-sub">接单后请尽快前往驿站取件，送达后及时标记</div>
    </div>

    <van-empty v-if="!loading && list.length === 0" description="还没有接单记录，去大厅抢一单吧" />

    <div class="list">
      <div
        v-for="o in list"
        :key="o.id"
        class="card"
        :class="{ 'card--done': isDone(o.status) }"
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

        <div class="peer-row">
          <van-icon name="user-o" />
          <span>雇主：{{ o.publisherName }}</span>
          <span class="muted">（ID: <span class="copyable copyable--inline" @click.stop="copyText(o.publisherUid, '雇主用户ID')">{{ o.publisherUid }}</span>）</span>
        </div>

        <div class="card-foot">
          <span class="orderno">{{ o.orderNo }}</span>
          <span class="hint">查看详情 →</span>
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
  ACCEPTED: '进行中·已接单',
  DELIVERED: '待雇主确认',
  CONFIRMED: '已完成',
  SETTLED: '已结算',
  CANCELED: '已取消',
};
const statusText = (s) => STATUS_TEXT[s] || s;

/** 已完成/已结算 */
function isDone(s) {
  return s === 'CONFIRMED' || s === 'SETTLED' || s === 'CANCELED';
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
  background: var(--bg-page);
  padding-bottom: 96px;
}

.header-banner {
  margin: 12px 14px 4px;
  padding: 14px 16px;
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
  border-radius: 14px;
  color: #fff;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.15);
}
.header-title {
  font-size: 15px;
  font-weight: 700;
}
.header-sub {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.85;
}

.list {
  padding: 12px 14px;
}
.card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-light);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}
.card:active {
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
.status--ACCEPTED {
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid rgba(37, 99, 235, 0.2);
}
.status--DELIVERED {
  background: #fff7ed;
  color: #ea580c;
  border: 1px solid rgba(234, 88, 12, 0.2);
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

.card--done {
  opacity: 0.78;
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
.orderno {
  color: #94a3b8;
  font-family: monospace;
}
.hint {
  color: var(--van-primary-color);
  font-weight: 600;
}
</style>
