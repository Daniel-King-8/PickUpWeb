<template>
  <div class="page" v-if="order">
    <van-nav-bar :title="'订单详情'" left-arrow @click-left="goBack" />

    <div class="status-banner" :class="`status-banner--${order.status}`">
      <div class="status-text">{{ statusText(order.status) }}</div>
      <div class="status-reward">￥{{ order.reward.toFixed(2) }}</div>
    </div>

    <van-cell-group inset title="取件信息">
      <van-cell title="取件驿站" :value="order.station" />
      <van-cell title="取件码" :value="order.pickupCode" @click="order.pickupCode !== '******' && copyCode()">
        <template v-if="order.pickupCode === '******'" #label>接单后才可查看</template>
      </van-cell>
      <van-cell title="送达地址" :value="order.deliverPlace" />
      <van-cell v-if="order.contactPhone" title="联系电话" :value="order.contactPhone" />
      <van-cell v-if="order.remark" title="备注" :value="order.remark" />
    </van-cell-group>

    <!-- 付款截图（待支付时上传） -->
    <van-cell-group v-if="order.status === 'PAYING'" inset title="付款凭证">
      <div class="upload-row">
        <div class="upload-preview" @click="uploadPay('pay')">
          <van-image
            v-if="order.payerScreenshot"
            :src="order.payerScreenshot"
            width="96"
            height="96"
            fit="cover"
          />
          <div v-else class="upload-placeholder">
            <span>＋</span>
            <small>上传付款截图</small>
          </div>
        </div>
        <div class="upload-tip">扫码或加微信付款后上传截图，管理员核对后会收到通知</div>
      </div>
    </van-cell-group>

    <van-cell-group v-else-if="order.status === 'ACCEPTED' && isRunner" inset title="送达凭证">
      <div class="upload-row">
        <div class="upload-preview" @click="uploadPay('deliver')">
          <van-image
            v-if="order.deliveryPhoto"
            :src="order.deliveryPhoto"
            width="96"
            height="96"
            fit="cover"
          />
          <div v-else class="upload-placeholder">
            <span>＋</span>
            <small>上传送达照片</small>
          </div>
        </div>
        <div class="upload-tip">送达后拍照上传，雇主确认后完成本单</div>
      </div>
    </van-cell-group>

    <van-cell-group inset title="订单信息">
      <van-cell title="订单号" :value="order.orderNo" />
      <van-cell title="跑腿费" :value="`￥${order.reward.toFixed(2)}`" />
      <van-cell title="平台服务费" :value="`￥${order.fee.toFixed(2)}`" />
      <van-cell v-if="order.acceptedAt" title="接单时间" :value="fmt(order.acceptedAt)" />
      <van-cell v-if="order.deliveredAt" title="送达时间" :value="fmt(order.deliveredAt)" />
      <van-cell v-if="order.confirmedAt" title="确认时间" :value="fmt(order.confirmedAt)" />
    </van-cell-group>

    <div class="actions">
      <!-- 雇主：待支付 → 去付款 -->
      <van-button
        v-if="isPublisher && order.status === 'PAYING'"
        type="primary"
        block
        round
        @click="$router.push(`/pay/${order.id}`)"
      >
        去付款
      </van-button>
      <!-- 雇主：待接单/待确认 可取消 -->
      <van-button
        v-if="isPublisher && ['PAYING', 'PAID'].includes(order.status)"
        type="default"
        block
        round
        @click="onCancel"
      >
        取消订单
      </van-button>
      <!-- 雇主：确认收货 -->
      <van-button
        v-if="isPublisher && order.status === 'DELIVERED'"
        type="primary"
        block
        round
        @click="onConfirm"
      >
        确认收货
      </van-button>
      <!-- 跑腿员：送达按钮 -->
      <van-button
        v-if="isRunner && order.status === 'ACCEPTED'"
        type="primary"
        block
        round
        @click="uploadPay('deliver')"
      >
        我已送达（上传照片）
      </van-button>
      <!-- 大厅可见 → 抢单 -->
      <van-button
        v-if="order.status === 'PAID' && !isPublisher && !isRunner"
        type="danger"
        block
        round
        @click="onAccept"
      >
        抢单（赚 ￥{{ order.reward.toFixed(2) }}）
      </van-button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast, showConfirmDialog, showImagePreview } from 'vant';
import api from '../api';
import { getUser } from '../store';

const route = useRoute();
const router = useRouter();
const order = ref(null);
const user = getUser();
const isPublisher = computed(() => order.value && order.value.publisherId === user.id);
const isRunner = computed(() => order.value && order.value.runnerId === user.id);

const STATUS_TEXT = {
  PAYING: '待支付',
  PAID: '待接单',
  ACCEPTED: '已接单',
  DELIVERED: '待确认',
  CONFIRMED: '已完成',
  SETTLED: '已结算',
  CANCELED: '已取消',
};
const statusText = (s) => STATUS_TEXT[s] || s;

function fmt(t) {
  return t ? t.replace('T', ' ').slice(0, 16) : '';
}

async function load() {
  const res = await api.get(`/orders/${route.params.id}`);
  order.value = res.data;
}

function goBack() {
  // 浏览器后退：从大厅/已接悬赏/我的订单进入都能正确返回
  router.back();
}

async function copyCode() {
  await navigator.clipboard.writeText(order.value.pickupCode);
  showToast('取件码已复制');
}

/** 上传（付款截图 / 送达照片 共用） */
async function uploadPay(kind) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const url = kind === 'pay' ? `/orders/${order.value.id}/pay-upload` : `/orders/${order.value.id}/deliver`;
    const res = await api.post(url, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    order.value = { ...order.value, ...(kind === 'pay' ? { payerScreenshot: res.data.screenshot } : {}) };
    showToast('上传成功');
    load();
  };
  input.click();
}

async function onConfirm() {
  await showConfirmDialog({ title: '确认收货', message: '确认已收到快递？确认后本单完成。' });
  await api.post(`/orders/${order.value.id}/confirm`);
  showToast('已确认收货');
  load();
}

async function onCancel() {
  await showConfirmDialog({ title: '取消订单', message: '确认取消？若已接单需联系管理员处理。' });
  await api.post(`/orders/${order.value.id}/cancel`);
  showToast('订单已取消');
  load();
}

async function onAccept() {
  await showConfirmDialog({
    title: '确认抢单',
    message: '抢单后请尽快取件送达，取件码将对你可见。',
  });
  await api.post(`/orders/${order.value.id}/accept`);
  showToast('抢单成功，请尽快去取件！');
  load();
}

load();
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f7f8fa;
  padding-bottom: 48px;
}
.status-banner {
  margin: 12px;
  padding: 28px 0;
  border-radius: 12px;
  background: #00c48c;
  color: #fff;
  text-align: center;
}
.status-banner--CONFIRMED,
.status-banner--SETTLED,
.status-banner--CANCELED {
  background: #9aa0a6;
}
.status-text {
  font-size: 16px;
  font-weight: 600;
}
.status-reward {
  font-size: 34px;
  font-weight: 700;
  margin-top: 6px;
}
.upload-row {
  display: flex;
  align-items: center;
  padding: 16px;
}
.upload-preview {
  width: 96px;
  height: 96px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}
.upload-placeholder {
  width: 100%;
  height: 100%;
  border: 1px dashed #ccc;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 24px;
}
.upload-placeholder small {
  font-size: 11px;
}
.upload-tip {
  margin-left: 16px;
  font-size: 12px;
  color: #999;
}
.actions {
  margin: 32px 24px 0;
}
.actions .van-button + .van-button {
  margin-top: 12px;
}
</style>
