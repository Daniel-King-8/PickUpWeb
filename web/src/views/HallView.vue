<template>
  <div class="page">
    <van-nav-bar title="接单大厅">
      <template #right>
        <span class="nav-link" @click="onRefresh">
          <van-icon name="replay" class="refresh-icon" /> 刷新
        </span>
      </template>
    </van-nav-bar>

    <!-- 顶部动态提示横幅 -->
    <div class="banner">
      <div class="banner-content">
        <div class="banner-title">⚡ 同学互助 · 顺路取件</div>
        <div class="banner-sub">接单赚零花，取件码接单后即刻解锁</div>
      </div>
    </div>

    <van-empty v-if="!loading && list.length === 0" description="暂无待接订单，稍后再来看看" image="search" />

    <div class="list">
      <div v-for="o in list" :key="o.id" class="card" @click="$router.push(`/orders/${o.id}`)">
        <div class="card-top">
          <span class="tag">待接单</span>
          <div class="reward-wrap">
            <span class="reward-unit">￥</span>
            <b class="reward-val">{{ o.reward.toFixed(2) }}</b>
          </div>
        </div>

        <div class="card-body">
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
          <div v-if="o.remark" class="remark-box">
            <van-icon name="comment-o" class="remark-icon" />
            <span class="remark-text">{{ o.remark }}</span>
          </div>
        </div>

        <div class="card-foot">
          <span class="orderno">{{ o.orderNo }}</span>
          <span class="accept-btn" :class="{ 'is-own': !o.canAccept }">
            {{ o.canAccept ? '抢单赚赏金 →' : '我的悬赏 · 等待中' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api';

const router = useRouter();
const list = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const res = await api.get('/orders/hall');
    list.value = res.data;
  } finally {
    loading.value = false;
  }
}

function onRefresh() {
  load();
  router.go(0); // 简单方式：刷新整个页面重新拉数据
}

load();
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--bg-page);
  padding-bottom: 96px; /* 底部 tabbar 高度，防遮挡 */
}
.nav-link {
  color: var(--van-primary-color);
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
}
.refresh-icon {
  font-size: 15px;
}

/* 顶部活力横幅 */
.banner {
  margin: 12px 14px 4px;
  padding: 16px 18px;
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  border-radius: 14px;
  color: #fff;
  box-shadow: 0 6px 18px rgba(5, 150, 105, 0.22);
}
.banner-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.banner-sub {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.9;
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
  border: 1px solid rgba(226, 232, 240, 0.8);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}
.card:active {
  transform: translateY(1px) scale(0.99);
  box-shadow: var(--shadow-sm);
}
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.tag {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
  background: #ecfdf5;
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.2);
}
.reward-wrap {
  display: flex;
  align-items: baseline;
  color: #ea580c;
}
.reward-unit {
  font-size: 14px;
  font-weight: 600;
}
.reward-val {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.card-body {
  margin: 6px 0 12px;
}
.route-box {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.route-line {
  position: absolute;
  left: 5px;
  top: 14px;
  bottom: 14px;
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

.remark-box {
  margin-top: 10px;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #64748b;
  border: 1px dashed #e2e8f0;
}
.remark-icon {
  font-size: 14px;
  color: #94a3b8;
}

.card-foot {
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
.accept-btn {
  color: #059669;
  font-weight: 600;
  font-size: 13px;
  background: #ecfdf5;
  padding: 4px 12px;
  border-radius: 20px;
  transition: all 0.15s ease;
}
.accept-btn.is-own {
  color: #94a3b8;
  background: #f1f5f9;
}
</style>
