<template>
  <div class="page" v-if="order">
    <van-nav-bar title="订单支付" left-arrow @click-left="$router.push(`/orders/${order.id}`)" />

    <!-- 顶部金额卡片 -->
    <div class="pay-amount-card">
      <div class="pay-label">待支付跑腿悬赏费</div>
      <div class="pay-amount">
        <span class="unit">￥</span>
        <span class="val">{{ order.reward.toFixed(2) }}</span>
      </div>
      <div class="pay-no">
        <span>订单号：</span>
        <span class="copyable copyable--light" @click="copyText(order.orderNo, '订单号')">{{ order.orderNo }}</span>
      </div>
    </div>

    <!-- 支付方式选项 -->
    <van-cell-group inset title="支付方式（请扫码转账并在转账时备注单号）">
      <!-- 微信扫码 -->
      <van-cell title="微信转账" label="保存收款码或长按/扫一扫转账">
        <template #icon><van-icon name="wechat-pay" class="pay-type-icon pay-wx" /></template>
        <template #value>
          <div class="qr-item" v-if="payInfo.payQrWx" @click="previewQr(payInfo.payQrWx)">
            <van-image :src="payInfo.payQrWx" width="100" height="100" fit="cover" radius="8px" />
            <span class="qr-hint">点击查看大图</span>
          </div>
          <div v-else class="qr-missing">管理员未配置微信收款码</div>
        </template>
      </van-cell>

      <!-- 支付宝 -->
      <van-cell title="支付宝转账" label="支付宝扫码转账，务必备注单号">
        <template #icon><van-icon name="alipay" class="pay-type-icon pay-ali" /></template>
        <template #value>
          <div class="qr-item" v-if="payInfo.payQrAlipay" @click="previewQr(payInfo.payQrAlipay)">
            <van-image :src="payInfo.payQrAlipay" width="100" height="100" fit="cover" radius="8px" />
            <span class="qr-hint">点击查看大图</span>
          </div>
          <div v-else class="qr-missing">管理员未配置支付宝收款码</div>
        </template>
      </van-cell>

      <!-- 加微信 -->
      <van-cell title="加管理员微信转账" :label="payInfo.contactWechat || '请联系管理员'">
        <template #icon><van-icon name="chat-o" class="pay-type-icon pay-chat" /></template>
        <template #value>
          <van-button size="small" plain type="primary" round @click="copyWechat">复制微信号</van-button>
        </template>
      </van-cell>
    </van-cell-group>

    <!-- 上传凭证区 -->
    <van-cell-group inset title="核验凭证（必填/重要）">
      <div class="upload-row">
        <div class="upload-preview" @click="uploadScreenshot">
          <van-image
            v-if="order.payerScreenshot"
            :src="order.payerScreenshot"
            width="96"
            height="96"
            fit="cover"
            radius="10px"
          />
          <div v-else class="upload-placeholder">
            <van-icon name="photograph" />
            <small>上传付款截图</small>
          </div>
        </div>
        <div class="upload-tip">
          <div class="tip-title">转账后请截图并点击上传</div>
          <div class="tip-desc">管理员核对后台收款到账后，订单将第一时间自动上线接单大厅。</div>
          <div v-if="order.payerScreenshot" class="checked">
            <van-icon name="checked" /> 截图已上传成功
          </div>
        </div>
      </div>
    </van-cell-group>

    <div class="actions">
      <van-button type="primary" block round size="large" class="main-btn" :loading="submitting" @click="onDone">
        我已完成付款 · 提交核验
      </van-button>
      <van-button class="second-btn" block round plain @click="$router.push('/orders/mine')">
        返回我的订单列表
      </van-button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast, showImagePreview, showConfirmDialog } from 'vant';
import api from '../api';
import { copyText } from '../utils/copy';

const route = useRoute();
const router = useRouter();
const submitting = ref(false);
const order = ref(null);
const payInfo = ref({ payQrWx: '', payQrAlipay: '', contactWechat: '' });

onMounted(async () => {
  const [o, p] = await Promise.all([
    api.get(`/orders/${route.params.id}`),
    api.get('/public/pay-info'),
  ]);
  order.value = o.data;
  payInfo.value = p.data;
});

function previewQr(url) {
  showImagePreview([url]);
}

function copyWechat() {
  if (!payInfo.value.contactWechat) return showToast('未配置联系方式');
  copyText(payInfo.value.contactWechat, '管理员微信号');
}

/** 按下"我已付款，完成"：完成即回接单大厅 */
async function onDone() {
  if (submitting.value) return;
  if (!order.value) return;

  if (!order.value.payerScreenshot) {
    // 未传截图：明确提示，确认后仍可回大厅（截图可在订单详情补传）
    try {
      await showConfirmDialog({
        title: '尚未上传付款截图',
        message: '还没有上传付款截图，建议先上传方便管理员快速核对。确定现在返回接单大厅？',
        confirmText: '返回大厅',
        cancelText: '留在本页上传',
      });
    } catch (e) {
      return; // 取消则留在当前页
    }
    router.replace('/');
    return;
  }

  submitting.value = true;
  try {
    showToast('已提交，管理员确认后订单发布到大厅');
    setTimeout(() => router.replace('/'), 600);
  } finally {
    submitting.value = false;
  }
}

async function uploadScreenshot() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    await api.post(`/orders/${order.value.id}/pay-upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    showToast('截图已上传');
    order.value.payerScreenshot = `/uploads/${file.name}`;
    // 重新拉取订单拿真实截图地址
    const res = await api.get(`/orders/${route.params.id}`);
    order.value = res.data;
  };
  input.click();
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--bg-page);
  padding-bottom: 56px;
}

/* 顶部付款金额卡片 */
.pay-amount-card {
  margin: 12px 14px 16px;
  padding: 24px 20px;
  border-radius: 18px;
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  color: #fff;
  text-align: center;
  box-shadow: 0 10px 25px -4px rgba(5, 150, 105, 0.35);
}
.pay-label {
  font-size: 13px;
  opacity: 0.9;
}
.pay-amount {
  display: flex;
  align-items: baseline;
  justify-content: center;
  margin: 8px 0;
}
.pay-amount .unit {
  font-size: 20px;
  font-weight: 700;
}
.pay-amount .val {
  font-size: 38px;
  font-weight: 800;
  letter-spacing: -1px;
}
.pay-no {
  font-size: 12px;
  opacity: 0.9;
}

.pay-type-icon {
  font-size: 22px;
  margin-right: 8px;
}
.pay-wx {
  color: #07c160;
}
.pay-ali {
  color: #1677ff;
}
.pay-chat {
  color: #059669;
}

.qr-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.qr-hint {
  font-size: 11px;
  color: #64748b;
}
.qr-missing {
  color: #94a3b8;
  font-size: 12px;
}

.upload-row {
  display: flex;
  align-items: center;
  padding: 16px;
  gap: 16px;
}
.upload-preview {
  width: 96px;
  height: 96px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  cursor: pointer;
}
.upload-placeholder {
  width: 100%;
  height: 100%;
  border: 2px dashed #cbd5e1;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 22px;
  background: #f8fafc;
  transition: all 0.2s;
}
.upload-placeholder:active {
  background: #f1f5f9;
}
.upload-placeholder small {
  margin-top: 4px;
  font-size: 11px;
}
.upload-tip {
  flex: 1;
  font-size: 12px;
}
.tip-title {
  font-weight: 700;
  color: #0f172a;
  font-size: 13px;
}
.tip-desc {
  margin-top: 4px;
  color: #64748b;
  line-height: 1.5;
}
.checked {
  margin-top: 8px;
  color: #059669;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}

.actions {
  margin: 28px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.main-btn {
  font-size: 16px !important;
  font-weight: 600 !important;
}
.second-btn {
  border-color: #cbd5e1 !important;
  color: #475569 !important;
}
</style>
