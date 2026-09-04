<template>
  <div class="page" v-if="order">
    <van-nav-bar title="付款" left-arrow @click-left="$router.push(`/orders/${order.id}`)" />

    <div class="pay-amount">
      <div class="label">应付金额</div>
      <div class="amount">￥{{ order.reward.toFixed(2) }}</div>
      <div class="no">单号：{{ order.orderNo }}</div>
    </div>

    <van-cell-group inset title="支付方式（任选其一）">
      <!-- 微信扫码 -->
      <van-cell title="微信扫一扫转账" label="扫码后转账跑腿费，备注单号或姓名">
        <template #value>
          <div class="qr-item" v-if="payInfo.payQrWx" @click="previewQr(payInfo.payQrWx)">
            <van-image :src="payInfo.payQrWx" width="120" height="120" fit="cover" />
            <small>点击看大图</small>
          </div>
          <div v-else class="qr-missing">管理员未上传收款码</div>
        </template>
      </van-cell>
      <!-- 支付宝 -->
      <van-cell title="支付宝扫一扫转账" label="支付宝扫码转账，备注单号">
        <template #value>
          <div class="qr-item" v-if="payInfo.payQrAlipay" @click="previewQr(payInfo.payQrAlipay)">
            <van-image :src="payInfo.payQrAlipay" width="120" height="120" fit="cover" />
            <small>点击看大图</small>
          </div>
          <div v-else class="qr-missing">管理员未上传收款码</div>
        </template>
      </van-cell>
      <!-- 加微信 -->
      <van-cell title="加微信好友付款" :label="`${payInfo.contactWechat}`">
        <template #value>
          <van-button size="small" plain type="primary" round @click="copyWechat">复制说明</van-button>
        </template>
      </van-cell>
    </van-cell-group>

    <van-cell-group inset title="上传付款截图">
      <div class="upload-row">
        <div class="upload-preview" @click="uploadScreenshot">
          <van-image
            v-if="order.payerScreenshot"
            :src="order.payerScreenshot"
            width="100"
            height="100"
            fit="cover"
          />
          <div v-else class="upload-placeholder">
            <span>＋</span>
            <small>上传截图</small>
          </div>
        </div>
        <div class="upload-tip">
          <b>付款后截图上传</b>，管理员核对收款记录后订单立即发布到接单大厅。
          <div v-if="order.payerScreenshot" class="checked">✅ 截图已上传，等待管理员确认…</div>
        </div>
      </div>
    </van-cell-group>

    <div class="actions">
      <van-button type="success" block round :loading="submitting" @click="onDone">
        ✅ 我已付款，完成
      </van-button>
      <van-button class="second-btn" block round plain @click="$router.push('/orders/mine')">
        查看我的订单
      </van-button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast, showImagePreview, showConfirmDialog } from 'vant';
import api from '../api';

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
  navigator.clipboard.writeText(payInfo.value.contactWechat);
  showToast('说明已复制');
}

/** 按下"我已付款，完成"：完成即回接单大厅 */
async function onDone() {
  if (submitting.value) return;
  if (!order.value) return;

  if (!order.value.payerScreenshot) {
    // 未传截图：明确提示，确认后仍可回大厅（截图可在订单详情补传）
    try {
      await showConfirmDialog({
        title: '付款已完成？',
        message: '还没有上传付款截图，建议先上传方便管理员核对（后续可在订单处补传）。确定现在返回接单大厅？',
        confirmText: '返回大厅',
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
  background: #f7f8fa;
  padding-bottom: 40px;
}
.pay-amount {
  margin: 12px;
  padding: 24px 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #00a870, #00c48c);
  color: #fff;
  text-align: center;
}
.label {
  font-size: 13px;
  opacity: 0.9;
}
.amount {
  font-size: 40px;
  font-weight: 700;
  margin: 6px 0;
}
.no {
  font-size: 12px;
  opacity: 0.8;
}
.qr-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.qr-item small {
  margin-top: 4px;
  font-size: 11px;
  color: #999;
}
.qr-missing {
  color: #999;
  font-size: 12px;
}
.upload-row {
  display: flex;
  align-items: flex-start;
  padding: 16px;
}
.upload-preview {
  width: 100px;
  height: 100px;
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
  font-size: 13px;
  color: #666;
  line-height: 1.6;
}
.checked {
  margin-top: 8px;
  color: #00a870;
  font-weight: 500;
}
.actions {
  margin: 32px 24px 0;
}
.second-btn {
  margin-top: 12px;
}
</style>
