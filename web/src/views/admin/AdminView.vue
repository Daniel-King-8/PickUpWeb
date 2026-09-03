<template>
  <div class="admin-page">
    <van-nav-bar title="管理后台">
      <template #right>
        <span class="nav-link" @click="onLogout">退出</span>
      </template>
    </van-nav-bar>

    <van-tabs v-model:active="tab" sticky>
      <van-tab title="待核对" name="check" />
      <van-tab title="订单管理" name="orders" />
      <van-tab title="每日结算" name="settle" />
      <van-tab title="设置" name="settings" />
      <van-tab title="用户" name="users" />
    </van-tabs>

    <!-- 待核对：PAYING 订单，查看截图 → 标记已支付 -->
    <div v-if="tab === 'check'" class="section">
      <van-empty v-if="payingList.length === 0" description="没有待核对订单" />
      <div v-for="o in payingList" :key="o.id" class="card">
        <div class="card-top">
          <b>￥{{ o.reward.toFixed(2) }}</b>
          <span class="muted">{{ o.station }} · {{ o.deliverPlace }}</span>
        </div>
        <div class="card-line">单号 {{ o.orderNo }} · 取件码 {{ o.pickupCode }}</div>
        <div class="card-actions">
          <van-button size="small" plain round @click="viewScreenshot(o)">看付款截图</van-button>
          <van-button size="small" plain round @click="markPaid(o)">标记已支付</van-button>
        </div>
      </div>
    </div>

    <!-- 订单管理：全部订单 -->
    <div v-if="tab === 'orders'" class="section">
      <van-dropdown-menu>
        <van-dropdown-item v-model="statusFilter" :options="statusOptions" @change="loadOrders" />
      </van-dropdown-menu>
      <div v-for="o in allOrders" :key="o.id" class="card">
        <div class="card-top">
          <b>￥{{ o.reward.toFixed(2) }}</b>
          <span class="tag">{{ o.status }}</span>
        </div>
        <div class="card-line">{{ o.orderNo }} · {{ o.station }} · {{ o.deliverPlace }}</div>
        <div class="card-line muted">雇主 #{{ o.publisherId }} · 跑腿 #{{ o.runnerId || '-' }}</div>
      </div>
    </div>

    <!-- 每日结算 -->
    <div v-if="tab === 'settle'" class="section">
      <van-date-picker
        v-model="pickerValue"
        :min-date="minDate"
        :max-date="maxDate"
        :columns-type="['year', 'month', 'day']"
        @confirm="onPickDate"
      >
        <template #default>
          <div class="settle-tools">
            <span class="muted">{{ settleDate }} 结算预览</span>
            <van-button size="small" round type="primary" @click="generateSettle">生成结算单</van-button>
          </div>
        </template>
      </van-date-picker>

      <!-- 预览结果 -->
      <div v-if="preview" class="preview-box">
        <van-empty v-if="preview.groups.length === 0" description="该日暂无已完成订单" />
        <div v-for="g in preview.groups" :key="g.runnerId" class="card">
          <div class="card-top">
            <b>跑腿员 #{{ g.runnerId }}（{{ g.count }} 单）</b>
            <span class="sum">实付 ￥{{ g.netPay.toFixed(2) }}</span>
          </div>
          <div class="card-line muted">跑腿费合计 ￥{{ g.totalReward.toFixed(2) }} - 抽成 ￥{{ g.totalFee.toFixed(2) }}</div>
        </div>
      </div>

      <!-- 结算单列表 -->
      <van-cell-group inset title="历史结算单">
        <van-cell
          v-for="s in settlements"
          :key="s.id"
          :title="`${s.settleDate} 跑腿员#${s.runnerId}`"
          :label="`${s.totalReward.toFixed(2)} - ${s.totalFee.toFixed(2)} = 实付 ${s.netPay.toFixed(2)}`"
          :value="s.status === 'pending' ? '待转账' : '已付'"
        >
          <template #right-icon>
            <van-button
              v-if="s.status === 'pending'"
              size="mini"
              plain
              round
              type="primary"
              @click="markSettlePaid(s)"
            >
              已转账
            </van-button>
          </template>
        </van-cell>
      </van-cell-group>
    </div>

    <!-- 设置 -->
    <div v-if="tab === 'settings'" class="section">
      <van-cell-group inset title="费率与抽成">
        <van-field
          v-model="settingsForm.stationJson"
          label="驿站基础价"
          type="textarea"
          autosize
          rows="4"
          placeholder='JSON：{"菜鸟驿站":2,"顺丰驿站":2.5}'
        />
        <van-field
          v-model="settingsForm.towerJson"
          label="楼栋附加"
          type="textarea"
          autosize
          rows="4"
          placeholder='JSON：[{"from":6,"to":11,"extra":0.5}]'
        />
        <van-field
          v-model="settingsForm.commissionJson"
          label="抽成规则"
          placeholder='{"type":"fixed","value":0.5}'
        />
        <van-button class="save-btn" round block type="primary" @click="saveFeeRules">保存费率</van-button>
      </van-cell-group>

      <van-cell-group inset title="收款码">
        <van-cell title="微信收款码">
          <template #value>
            <div class="qr-upload" @click="uploadQr('wx')">
              <van-image v-if="qrWx" :src="qrWx" width="80" height="80" fit="cover" />
              <span v-else class="upload-label">上传</span>
            </div>
          </template>
        </van-cell>
        <van-cell title="支付宝收款码">
          <template #value>
            <div class="qr-upload" @click="uploadQr('alipay')">
              <van-image v-if="qrAli" :src="qrAli" width="80" height="80" fit="cover" />
              <span v-else class="upload-label">上传</span>
            </div>
          </template>
        </van-cell>
        <van-field v-model="contactWechat" label="加微信引导文案" placeholder="如：请微信转账后上传截图" />
        <van-button class="save-btn" round block type="primary" @click="saveContact">保存联系方式</van-button>
      </van-cell-group>
    </div>

    <!-- 用户 -->
    <div v-if="tab === 'users'" class="section">
      <van-cell-group inset>
        <van-cell
          v-for="u in users"
          :key="u.id"
          :title="u.username"
          :label="u.phone || '未填手机号'"
          :value="u.role === 'admin' ? '管理员' : '用户'"
        />
      </van-cell-group>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { showToast, showConfirmDialog, showImagePreview, showSuccessToast } from 'vant';
import api from '../../api';
import { clearAuth } from '../../store';

const router = useRouter();
const tab = ref('check');

/* ---------- 待核对 ---------- */
const payingList = ref([]);
async function loadPaying() {
  const res = await api.get('/admin/orders', { params: { status: 'PAYING' } });
  payingList.value = res.data;
}
function viewScreenshot(o) {
  if (!o.payerScreenshot) return showToast('该订单未上传截图');
  showImagePreview([o.payerScreenshot]);
}
async function markPaid(o) {
  await showConfirmDialog({ title: '确认收款', message: `核对单号 ${o.orderNo} 已到账？确认后订单自动发布到大厅。` });
  await api.post(`/admin/orders/${o.id}/mark-paid`);
  showSuccessToast('已标记支付');
  loadPaying();
}

/* ---------- 订单管理 ---------- */
const statusFilter = ref('');
const allOrders = ref([]);
const statusOptions = [
  { text: '全部', value: '' },
  { text: '待支付', value: 'PAYING' },
  { text: '待接单', value: 'PAID' },
  { text: '已接单', value: 'ACCEPTED' },
  { text: '已完成', value: 'CONFIRMED' },
  { text: '已取消', value: 'CANCELED' },
];
async function loadOrders() {
  const res = await api.get('/admin/orders', { params: { status: statusFilter.value } });
  allOrders.value = res.data;
}

/* ---------- 每日结算 ---------- */
const now = new Date();
const settleDate = ref(now.toISOString().slice(0, 10));
// Vant 日期选择器 v-model 为数组
const pickerValue = ref([String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')]);
const minDate = new Date('2024-01-01');
const maxDate = now;
const preview = ref(null);
const settlements = ref([]);
function onPickDate({ selectedValues }) {
  settleDate.value = selectedValues.join('-');
  loadPreview();
}
async function loadPreview() {
  const res = await api.get('/admin/settlements/preview', { params: { date: settleDate.value } });
  preview.value = res.data;
}
async function generateSettle() {
  await showConfirmDialog({ title: '生成结算单', message: `按 ${settleDate.value} 已完成订单生成？生成后订单标记已结算。` });
  const res = await api.post('/admin/settlements/generate', { date: settleDate.value });
  showSuccessToast(`已生成 ${res.data.count} 张结算单`);
  loadPreview();
  loadSettlements();
}
async function loadSettlements() {
  const res = await api.get('/admin/settlements');
  settlements.value = res.data;
}
async function markSettlePaid(s) {
  await showConfirmDialog({ title: '标记已转账', message: `已线下转账 ￥${s.netPay.toFixed(2)} 给跑腿员#${s.runnerId}？` });
  await api.post(`/admin/settlements/${s.id}/mark-paid`);
  showSuccessToast('已标记');
  loadSettlements();
}

/* ---------- 设置 ---------- */
const settingsForm = ref({ stationJson: '', towerJson: '', commissionJson: '' });
const qrWx = ref('');
const qrAli = ref('');
const contactWechat = ref('');
async function loadSettings() {
  const res = await api.get('/admin/settings');
  const map = {};
  res.data.forEach((s) => {
    map[s.key] = s.value;
  });
  try {
    const rules = JSON.parse(map.feeRules || '{}');
    settingsForm.value = {
      stationJson: JSON.stringify(rules.stations, null, 2),
      towerJson: JSON.stringify(rules.towerRules, null, 2),
      commissionJson: JSON.stringify(rules.commission),
    };
  } catch (e) {
    /* 忽略不合法 JSON */
  }
  qrWx.value = map.payQrWx || '';
  qrAli.value = map.payQrAlipay || '';
  contactWechat.value = map.contactWechat || '';
}
async function saveFeeRules() {
  let data;
  try {
    data = {
      stations: JSON.parse(settingsForm.value.stationJson),
      towerRules: JSON.parse(settingsForm.value.towerJson),
      commission: JSON.parse(settingsForm.value.commissionJson),
    };
  } catch (e) {
    return showToast('JSON 格式有误，请检查');
  }
  await api.put('/admin/settings', { key: 'feeRules', value: data });
  showSuccessToast('费率已保存');
}
function uploadQr(type) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', type);
    const res = await api.post('/admin/upload-qr', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    if (type === 'wx') qrWx.value = res.data.url;
    else qrAli.value = res.data.url;
    showSuccessToast('收款码已更新');
  };
  input.click();
}
async function saveContact() {
  await api.put('/admin/settings', { key: 'contactWechat', value: contactWechat.value });
  showSuccessToast('已保存');
}

/* ---------- 用户 ---------- */
const users = ref([]);
async function loadUsers() {
  const res = await api.get('/admin/users');
  users.value = res.data;
}

function onLogout() {
  clearAuth();
  router.replace('/login');
}

function loadAll() {
  loadPaying();
  loadOrders();
  loadPreview();
  loadSettlements();
  loadSettings();
  loadUsers();
}

watch(tab, () => {
  // 进入各 tab 时刷新数据
  if (tab.value === 'check') loadPaying();
  if (tab.value === 'orders') loadOrders();
  if (tab.value === 'settle') {
    loadPreview();
    loadSettlements();
  }
  if (tab.value === 'settings') loadSettings();
  if (tab.value === 'users') loadUsers();
});

onMounted(() => {
  loadAll();
});
</script>

<style scoped>
.admin-page {
  min-height: 100vh;
  background: #f7f8fa;
  padding-bottom: 60px;
}
.nav-link {
  color: #999;
  font-size: 14px;
}
.section {
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
  margin-bottom: 6px;
}
.card-line {
  font-size: 13px;
  color: #333;
}
.card-actions {
  margin-top: 10px;
  display: flex;
  gap: 10px;
}
.muted {
  color: #999;
  font-size: 12px;
}
.tag {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 10px;
  background: #f0faf5;
  color: #00a870;
}
.sum {
  color: #fa550f;
  font-weight: 600;
}
.settle-tools {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 10px 0;
}
.preview-box {
  margin: 8px 4px;
}
.save-btn {
  margin: 16px;
  width: calc(100% - 32px);
}
.qr-upload {
  display: flex;
  align-items: center;
}
.upload-label {
  padding: 8px 16px;
  border: 1px dashed #ccc;
  border-radius: 6px;
  color: #999;
  font-size: 12px;
}
</style>
