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
      <!-- 查询区：订单号 / 用户ID -->
      <van-cell-group inset class="order-fitler-wrap">
        <div class="search-row">
          <van-field v-model="searchOrderNo" placeholder="按订单号查询（如 KD5687213621）" clearable />
          <van-button size="small" round type="primary" @click="loadOrders">搜索</van-button>
        </div>
        <div class="search-row">
          <van-field v-model="searchUid" placeholder="按用户ID查询其发布的所有订单" clearable />
          <van-button size="small" round type="primary" @click="loadOrders">搜索</van-button>
        </div>
        <div class="search-reset" @click="onResetSearch">重置搜索</div>
      </van-cell-group>

      <!-- 状态筛选（z-index 提升避免被遮挡） -->
      <div class="filter-wrap">
        <van-dropdown-menu>
          <van-dropdown-item v-model="statusFilter" :options="statusOptions" @change="loadOrders" />
        </van-dropdown-menu>
      </div>

      <div v-for="o in allOrders" :key="o.id" class="card">
        <div class="card-top">
          <b>￥{{ o.reward.toFixed(2) }}</b>
          <span class="tag" :class="`tag--${o.status}`">{{ statusText(o.status) }}</span>
        </div>
        <div class="card-line">
          <span class="copyable copyable--inline" @click="copyText(o.orderNo, '订单号')">{{ o.orderNo }}</span>
          · {{ o.station }} · {{ o.deliverPlace }}
        </div>
        <div class="card-line muted">雇主 {{ o.publisherName }}（ID {{ o.publisherUid }}） · 跑腿 {{ o.runnerName || '-' }}（ID {{ o.runnerUid || '-' }}）</div>
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
            <b>{{ g.runnerName }}（ID {{ g.runnerUid }}）· {{ g.count }} 单</b>
            <span class="sum">实付 ￥{{ g.netPay.toFixed(2) }}</span>
          </div>
          <div class="card-line muted">跑腿费 ￥{{ g.totalReward.toFixed(2) }} - 抽成 ￥{{ g.totalFee.toFixed(2) }} · 联系 {{ g.runnerPhone || '未留电话' }}</div>
        </div>
      </div>

      <!-- 结算单列表 -->
      <van-cell-group inset title="历史结算单">
        <van-cell
          v-for="s in settlements"
          :key="s.id"
          :title="`${s.settleDate} ${s.runnerName}（ID ${s.runnerUid}）`"
          :label="`跑腿费 ${s.totalReward.toFixed(2)} - 抽成 ${s.totalFee.toFixed(2)} = 实付 ${s.netPay.toFixed(2)} · ${s.runnerPhone || '未留电话'}`"
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
      <van-cell-group inset title="费率设置（按校区独立）">
        <van-tabs v-model:active="feeCampus" shrink>
          <van-tab title="四川邮电" name="scyz" />
          <van-tab title="成都农业" name="cdny" />
        </van-tabs>

        <!-- 平台费 -->
        <van-field
          :model-value="campusForms[feeCampus].platformFee"
          type="number"
          label="平台费(元/单)"
          placeholder="如 1.5"
          @update:model-value="(v) => (campusForms[feeCampus].platformFee = v)"
        />
        <div class="form-note">每单总价 = 平台费 + 基础 ¥1（固定给跑腿员）</div>

        <!-- 驿站列表 -->
        <van-divider>驿站列表（仅作下单选项，不计价格）</van-divider>
        <div v-for="(s, idx) in campusForms[feeCampus].stations" :key="'st' + idx" class="name-row">
          <van-field
            :model-value="s"
            placeholder="驿站名称，如 菜鸟驿站"
            @update:model-value="(v) => (campusForms[feeCampus].stations[idx] = v)"
          />
          <van-button icon="delete-o" plain round size="small" @click="removeName('stations', idx)" />
        </div>
        <van-button size="small" plain round icon="plus" class="add-btn" @click="addName('stations')">添加驿站</van-button>

        <!-- 目的地列表 -->
        <van-divider>目的地列表（送达地点选项）</van-divider>
        <div v-for="(d, idx) in campusForms[feeCampus].destinations" :key="'de' + idx" class="name-row">
          <van-field
            :model-value="d"
            placeholder="如 1-5号楼 / 西一区"
            @update:model-value="(v) => (campusForms[feeCampus].destinations[idx] = v)"
          />
          <van-button icon="delete-o" plain round size="small" @click="removeName('destinations', idx)" />
        </div>
        <van-button size="small" plain round icon="plus" class="add-btn" @click="addName('destinations')">添加目的地</van-button>

        <van-button class="save-btn" round block type="primary" @click="saveFeeRules">保存费率（当前校区）</van-button>
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
      <van-empty v-if="users.length === 0" description="暂无用户" />
      <div v-for="u in users" :key="u.id" class="card">
        <div class="user-row">
          <div class="user-main">
            <div class="user-name-row">
              <b>{{ u.username }}</b>
              <span class="muted">ID:
                <span class="copyable copyable--inline" @click.stop="copyText(u.uid, '用户ID')">{{ u.uid || '未分配' }}</span>
              </span>
              <span v-if="u.role === 'admin'" class="tag">管理员</span>
            </div>
            <div class="muted">{{ u.phone || '未填手机号' }} · {{ campusName(u.campus) }}</div>
          </div>
          <div v-if="u.role !== 'admin'" class="user-actions">
            <van-button size="mini" plain round @click="openEditUser(u)">编辑</van-button>
            <van-button size="mini" plain round type="danger" @click="onDeleteUser(u)">删除</van-button>
          </div>
        </div>
      </div>

      <!-- 编辑用户弹层（含重置密码，留空不改） -->
      <van-popup v-model:show="showEditUser" position="bottom" round>
        <div class="edit-title">编辑用户</div>
        <van-cell-group inset>
          <van-field v-model="editForm.username" label="用户名" />
          <van-field v-model="editForm.phone" type="tel" label="手机号" maxlength="11" />
          <van-field v-model="editForm.uid" label="用户ID(10位)" maxlength="10" placeholder="10 位纯数字" />
          <van-field label="校区">
            <template #input>
              <van-radio-group v-model="editForm.campus" direction="horizontal">
                <van-radio name="scyz">四川邮电</van-radio>
                <van-radio name="cdny">成都农业</van-radio>
              </van-radio-group>
            </template>
          </van-field>
          <van-field v-model="editForm.password" type="password" label="重置密码" placeholder="留空则不修改（至少 6 位）" />
        </van-cell-group>
        <div class="edit-actions">
          <van-button type="primary" block round @click="saveEditUser">保存</van-button>
        </div>
      </van-popup>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { showToast, showConfirmDialog, showImagePreview, showSuccessToast } from 'vant';
import api from '../../api';
import { clearAuth } from '../../store';
import { copyText } from '../../utils/copy';

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
const searchOrderNo = ref('');
const searchUid = ref('');
const statusOptions = [
  { text: '全部', value: '' },
  { text: '发布中·待支付', value: 'PAYING' },
  { text: '发布中·待接单', value: 'PAID' },
  { text: '进行中·已接单', value: 'ACCEPTED' },
  { text: '进行中·待确认', value: 'DELIVERED' },
  { text: '已完成', value: 'CONFIRMED' },
  { text: '已完成·已结算', value: 'SETTLED' },
  { text: '已取消', value: 'CANCELED' },
];
const STATUS_TEXT = {
  PAYING: '发布中·待支付',
  PAID: '发布中·待接单',
  ACCEPTED: '进行中·已接单',
  DELIVERED: '进行中·待确认',
  CONFIRMED: '已完成',
  SETTLED: '已完成·已结算',
  CANCELED: '已取消',
};
const statusText = (s) => STATUS_TEXT[s] || s;

async function loadOrders() {
  const res = await api.get('/admin/orders', {
    params: {
      status: statusFilter.value || undefined,
      orderNo: searchOrderNo.value || undefined,
      uid: searchUid.value || undefined,
    },
  });
  allOrders.value = res.data;
}

function onResetSearch() {
  searchOrderNo.value = '';
  searchUid.value = '';
  statusFilter.value = '';
  loadOrders();
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
  await showConfirmDialog({ title: '标记已转账', message: `已线下转账 ￥${s.netPay.toFixed(2)} 给 ${s.runnerName}（${s.runnerPhone || '未留电话'}）？` });
  await api.post(`/admin/settlements/${s.id}/mark-paid`);
  showSuccessToast('已标记');
  loadSettlements();
}

/* ---------- 设置（按校区） ---------- */
const feeCampus = ref('scyz');
// 每个校区独立一组表单值：平台费 + 驿站名称列表 + 目的地名称列表
const campusForms = reactive({
  scyz: { platformFee: '', stations: [], destinations: [] },
  cdny: { platformFee: '', stations: [], destinations: [] },
});
const qrWx = ref('');
const qrAli = ref('');
const contactWechat = ref('');

/** 旧结构兼容：towerRules → 目的地名称 */
function destFromTower(towerRules) {
  return (towerRules || []).map((t) =>
    t.from === t.to ? `${t.from}号楼` : `${t.from}-${t.to}号楼`
  );
}

/** 把单个校区规则写入对应表单 */
function fillCampusForm(key, rules) {
  campusForms[key] = {
    platformFee: String(rules.platformFee != null ? rules.platformFee : 1.5),
    stations: Array.isArray(rules.stations)
      ? [...rules.stations]
      : rules.stations
        ? Object.keys(rules.stations)
        : [],
    destinations: Array.isArray(rules.destinations)
      ? [...rules.destinations]
      : destFromTower(rules.towerRules),
  };
}

async function loadSettings() {
  const res = await api.get('/admin/settings');
  const map = {};
  res.data.forEach((s) => {
    map[s.key] = s.value;
  });
  try {
    const raw = JSON.parse(map.feeRules || '{}');
    if (raw && raw.campuses) {
      fillCampusForm('scyz', raw.campuses.scyz || {});
      fillCampusForm('cdny', raw.campuses.cdny || {});
    } else {
      fillCampusForm('scyz', raw || {});
      fillCampusForm('cdny', raw || {});
    }
  } catch (e) {
    /* 忽略不合法 JSON */
  }
  qrWx.value = map.payQrWx || '';
  qrAli.value = map.payQrAlipay || '';
  contactWechat.value = map.contactWechat || '';
}

/** 列表增删（stations / destinations 通用） */
function addName(type) {
  campusForms[feeCampus.value][type].push('');
}
function removeName(type, idx) {
  campusForms[feeCampus.value][type].splice(idx, 1);
}

async function saveFeeRules() {
  const key = feeCampus.value;
  const pf = Number(campusForms[key].platformFee);
  if (Number.isNaN(pf) || pf < 0 || pf > 99) {
    return showToast('平台费需为 0-99 之间的数字');
  }
  // 过滤空行并去重
  const clean = (arr) => [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))];
  const rules = {
    platformFee: Number(pf.toFixed(2)),
    stations: clean(campusForms[key].stations),
    destinations: clean(campusForms[key].destinations),
  };
  if (rules.stations.length === 0) return showToast('至少保留一个驿站');
  if (rules.destinations.length === 0) return showToast('至少保留一个目的地');

  const res = await api.get('/admin/settings');
  const cur = (res.data.find((s) => s.key === 'feeRules') || {}).value;
  let campuses = {};
  try {
    const raw = JSON.parse(cur || '{}');
    campuses = raw && raw.campuses ? raw.campuses : {};
  } catch (e) {
    campuses = {};
  }
  campuses[key] = rules;
  await api.put('/admin/settings', { key: 'feeRules', value: { campuses } });
  showSuccessToast(`「${key === 'scyz' ? '四川邮电' : '成都农业'}」费率已保存`);
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

/* ---------- 用户管理 ---------- */
const users = ref([]);
const showEditUser = ref(false);
const editForm = reactive({ id: null, username: '', phone: '', uid: '', campus: 'scyz', password: '' });

function campusName(c) {
  return c === 'scyz' ? '四川邮电' : c === 'cdny' ? '成都农业' : '未选校区';
}

async function loadUsers() {
  const res = await api.get('/admin/users');
  users.value = res.data;
}

/** 打开编辑弹层 */
function openEditUser(u) {
  Object.assign(editForm, {
    id: u.id,
    username: u.username,
    phone: u.phone || '',
    uid: u.uid || '',
    campus: u.campus || 'scyz',
    password: '',
  });
  showEditUser.value = true;
}

/** 保存编辑（密码留空则不修改） */
async function saveEditUser() {
  await api.put(`/admin/users/${editForm.id}`, {
    username: editForm.username,
    phone: editForm.phone,
    uid: editForm.uid,
    campus: editForm.campus,
  });
  if (editForm.password) {
    if (editForm.password.length < 6) return showToast('新密码至少 6 位');
    await api.put(`/admin/users/${editForm.id}/password`, { password: editForm.password });
  }
  showSuccessToast('已保存');
  showEditUser.value = false;
  loadUsers();
}

/** 删除用户 */
async function onDeleteUser(u) {
  await showConfirmDialog({
    title: '删除用户',
    message: `确认删除「${u.username}」？其历史订单仍保留。`,
  });
  await api.delete(`/admin/users/${u.id}`);
  showSuccessToast('已删除');
  loadUsers();
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
/* 订单管理查询区 */
.order-fitler-wrap {
  margin-bottom: 12px;
}
.search-row {
  display: flex;
  align-items: center;
  padding: 6px 12px 6px 0;
}
.search-row .van-field {
  flex: 1;
}
.search-row .van-button {
  margin-left: 8px;
}
.search-reset {
  padding: 8px 16px 10px;
  font-size: 13px;
  color: #00a870;
  text-align: right;
}
/* 状态筛选容器 z-index 提升，避免下拉被其它元素遮挡 */
.filter-wrap {
  position: relative;
  z-index: 3000;
}
.tag--PAYING,
.tag--PAID {
  background: #fff2f0;
  color: #fa550f;
}
.tag--ACCEPTED,
.tag--DELIVERED {
  background: #f0f6ff;
  color: #3d7eff;
}
.tag--CONFIRMED,
.tag--SETTLED {
  background: #e6f7f0;
  color: #00a870;
}
.tag--CANCELED {
  background: #f2f3f5;
  color: #9aa0a6;
}
/* 名称列表行（驿站/目的地） */
.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 14px;
}
.name-row .van-field {
  flex: 1;
}
.add-btn {
  margin: 10px 16px;
}
.form-note {
  margin: 0 16px 10px;
  font-size: 12px;
  color: #999;
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
