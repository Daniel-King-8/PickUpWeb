<template>
  <div class="page">
    <van-nav-bar title="接单大厅">
      <template #right>
        <span class="nav-link" @click="onRefresh">刷新</span>
      </template>
    </van-nav-bar>

    <van-empty v-if="!loading && list.length === 0" description="暂无待接订单，稍后再来看看" />

    <div class="list">
      <div v-for="o in list" :key="o.id" class="card" @click="$router.push(`/orders/${o.id}`)">
        <div class="card-top">
          <span class="tag">待接单</span>
          <b class="reward">￥{{ o.reward.toFixed(2) }}</b>
        </div>
        <div class="line">📍 {{ o.station }}</div>
        <div class="line">🏠 送至 {{ o.deliverPlace }}</div>
        <div v-if="o.remark" class="line line-remark">{{ o.remark }}</div>
        <div class="card-foot">
          <span>{{ o.orderNo }}</span>
          <span class="accept-hint">
            {{ o.canAccept ? '去抢单 →' : '你的单子 · 等待接单' }}
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
  background: #f7f8fa;
  padding-bottom: 40px;
}
.nav-link {
  color: #00a870;
  font-size: 14px;
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
  margin-bottom: 8px;
}
.tag {
  font-size: 13px;
  padding: 2px 12px;
  border-radius: 12px;
  background: #e6f7f0;
  color: #00a870;
}
.reward {
  color: #fa550f;
  font-size: 18px;
}
.line {
  margin-top: 4px;
  font-size: 14px;
  color: #333;
}
.line-remark {
  color: #999;
}
.card-foot {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #999;
}
.accept-hint {
  color: #00a870;
  font-weight: 500;
}
</style>
