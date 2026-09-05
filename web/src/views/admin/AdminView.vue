<template>
  <div class="admin-page">
    <van-nav-bar title="管理控制台">
      <template #right>
        <span class="nav-logout" @click="onLogout">
          <van-icon name="cross" /> 退出登录
        </span>
      </template>
    </van-nav-bar>

    <van-tabs v-model:active="tab" sticky color="#059669">
      <van-tab title="待核对" name="check" :badge="payingList.length > 0 ? payingList.length : undefined" />
      <van-tab title="订单管理" name="orders" />
      <van-tab title="每日结算" name="settle" />
      <van-tab title="费率设置" name="settings" />
      <van-tab title="用户管理" name="users" :badge="hunterApps.length > 0 ? hunterApps.length : undefined" />
    </van-tabs>

    <!-- 待核对：PAYING 订单，查看截图 → 标记已支付 -->
    <div v-if="tab === 'check'" class="section">
      <!-- 查询：单号 / 雇主信息 -->
      <van-cell-group inset class="filter-wrap">
        <div class="search-row">
          <van-field v-model="checkSearch" placeholder="查询：单号 / 雇主姓名、ID、电话" clearable />
          <van-button size="small" round type="primary" @click="loadPaying">搜索</van-button>
          <van-button size="small" round plain @click="resetCheck">重置</van-button>
        </div>
      </van-cell-group>

      <van-empty v-if="payingList.length === 0" description="暂无待核对订单" />
      <div v-for="o in payingList" :key="o.id" class="card">
        <div class="card-top">
          <div class="reward-wrap">
            <span class="unit">￥</span>
            <b class="val">{{ o.reward.toFixed(2) }}</b>
          </div>
          <span class="station-badge">{{ o.station }}</span>
        </div>

        <div class="card-line address-line">
          <van-icon name="location-o" />
          <span>送至 {{ o.deliverPlace }}</span>
        </div>

        <div class="card-line">
          <span class="label">单号:</span>
          <span class="copyable copyable--inline" @click="copyText(o.orderNo, '订单号')">{{ o.orderNo }}</span>
          <span class="label ml-2">取件码:</span>
          <span class="code-val">{{ o.pickupCode }}</span>
        </div>

        <div class="card-line muted-box">
          <div>雇主: <strong>{{ o.publisherName }}</strong>（ID: <span class="copyable copyable--inline" @click="copyText(o.publisherUid, '用户ID')">{{ o.publisherUid }}</span>）</div>
          <div class="mt-1">电话: {{ o.publisherPhone || '未留电话' }} · 校区: {{ campusName(o.campus) }}</div>
        </div>

        <div class="card-actions">
          <van-button size="small" plain round icon="photograph" @click="viewScreenshot(o)">查看付款截图</van-button>
          <van-button size="small" type="primary" round icon="passed" @click="markPaid(o)">确认收到款项并发布</van-button>
        </div>
      </div>
    </div>

    <!-- 订单管理：全部订单 -->
    <div v-if="tab === 'orders'" class="section">
      <!-- 查询区：订单号 / 用户ID -->
      <van-cell-group inset class="filter-wrap">
        <div class="search-row">
          <van-field v-model="searchOrderNo" placeholder="按订单号精确查询" clearable />
          <van-button size="small" round type="primary" @click="loadOrders">搜索</van-button>
        </div>
        <div class="search-row">
          <van-field v-model="searchUid" placeholder="按用户ID查询其发布订单" clearable />
          <van-button size="small" round type="primary" @click="loadOrders">搜索</van-button>
        </div>
        <div class="search-reset" @click="onResetSearch">清空查询条件</div>
      </van-cell-group>

      <!-- 状态筛选：横滚标签 -->
      <div class="chip-row">
        <span
          v-for="opt in statusOptions"
          :key="opt.value"
          class="chip"
          :class="{ 'chip--active': statusFilter === opt.value }"
          @click="onFilter(opt)"
        >
          {{ opt.text }}
        </span>
      </div>

      <van-empty v-if="allOrders.length === 0" description="暂无符合条件的订单" image="search" />

      <div v-for="o in allOrders" :key="o.id" class="card">
        <div class="card-top">
          <div class="reward-wrap">
            <span class="unit">￥</span>
            <b class="val">{{ o.reward.toFixed(2) }}</b>
          </div>
          <span class="tag" :class="`tag--${o.status}`">{{ statusText(o.status) }}</span>
        </div>

        <div class="card-line">
          <span class="copyable copyable--inline" @click="copyText(o.orderNo, '订单号')">{{ o.orderNo }}</span>
          <span>· {{ o.station }} · 送至 {{ o.deliverPlace }}</span>
        </div>

        <div class="card-line muted-box mt-2">
          <div>雇主: {{ o.publisherName }} (ID: {{ o.publisherUid }})</div>
          <div>跑腿: {{ o.runnerName || '暂无' }} (ID: {{ o.runnerUid || '暂无' }})</div>
        </div>

        <div class="card-actions justify-end">
          <van-button size="small" plain round type="danger" icon="delete-o" @click="onDeleteAdminOrder(o)">删除订单</van-button>
        </div>
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
            <span class="settle-date-tag">📅 {{ settleDate }} 结算预览</span>
            <van-button size="small" round type="primary" @click="generateSettle">生成当日结算单</van-button>
          </div>
        </template>
      </van-date-picker>

      <!-- 预览结果 -->
      <div v-if="preview" class="preview-box">
        <van-empty v-if="preview.groups.length === 0" description="该日暂无待结算完成订单" image="search" />
        <div v-for="g in preview.groups" :key="g.runnerId" class="card">
          <div class="card-top">
            <b>{{ g.runnerName }}（ID {{ g.runnerUid }}）· {{ g.count }} 单</b>
            <span class="sum">实付 ￥{{ g.netPay.toFixed(2) }}</span>
          </div>
          <div class="card-line muted">跑腿费 ￥{{ g.totalReward.toFixed(2) }} - 抽成 ￥{{ g.totalFee.toFixed(2) }} · 联系: {{ g.runnerPhone || '未留电话' }}</div>
        </div>
      </div>

      <!-- 结算单列表 -->
      <van-cell-group inset title="历史结算单记录" class="mt-3">
        <van-cell
          v-for="s in settlements"
          :key="s.id"
          :title="`${s.settleDate} ${s.runnerName} (ID: ${s.runnerUid})`"
          :label="`跑腿费 ¥${s.totalReward.toFixed(2)} - 服务费 ¥${s.totalFee.toFixed(2)} = 实付 ¥${s.netPay.toFixed(2)}`"
          :value="s.status === 'pending' ? '待转账' : '已结算'"
        >
          <template #right-icon>
            <van-button
              v-if="s.status === 'pending'"
              size="small"
              round
              type="primary"
              class="ml-2"
              @click="markSettlePaid(s)"
            >
              已线下转账
            </van-button>
          </template>
        </van-cell>
      </van-cell-group>
    </div>

    <!-- 费率与配置设置 -->
    <div v-if="tab === 'settings'" class="section">
      <van-cell-group inset title="费率规则设置（按校区配置）">
        <van-tabs v-model:active="feeCampus" shrink color="#059669">
          <van-tab title="四川邮电职业技术学院" name="scyz" />
          <van-tab title="成都农业科技职业学院" name="cdny" />
        </van-tabs>

        <!-- 平台费 -->
        <van-field
          :model-value="campusForms[feeCampus].platformFee"
          type="number"
          label="平台服务费"
          placeholder="如 1.5"
          @update:model-value="(v) => (campusForms[feeCampus].platformFee = v)"
        >
          <template #extra>元/单</template>
        </van-field>
        <div class="form-note">💡 计算公式：每单最低悬赏 = 平台服务费 + 基础跑腿保底 ¥1.00</div>

        <!-- 驿站列表 -->
        <van-divider content-position="left">取件驿站列表配置</van-divider>
        <div v-for="(s, idx) in campusForms[feeCampus].stations" :key="'st' + idx" class="name-row">
          <van-field
            :model-value="s"
            placeholder="驿站名称，如 菜鸟驿站/顺丰点"
            @update:model-value="(v) => (campusForms[feeCampus].stations[idx] = v)"
          />
          <van-button plain round size="small" type="danger" @click="removeName('stations', idx)">删除</van-button>
        </div>
        <van-button size="small" plain round icon="plus" class="add-btn" @click="addName('stations')">添加新驿站</van-button>

        <!-- 目的地列表 -->
        <van-divider content-position="left">送达目的地列表配置</van-divider>
        <div v-for="(d, idx) in campusForms[feeCampus].destinations" :key="'de' + idx" class="name-row">
          <van-field
            :model-value="d"
            placeholder="如 1-5号楼 / 教师公寓"
            @update:model-value="(v) => (campusForms[feeCampus].destinations[idx] = v)"
          />
          <van-button plain round size="small" type="danger" @click="removeName('destinations', idx)">删除</van-button>
        </div>
        <van-button size="small" plain round icon="plus" class="add-btn" @click="addName('destinations')">添加新目的地</van-button>

        <van-button class="save-btn" round block type="primary" @click="saveFeeRules">保存当前校区规则</van-button>
      </van-cell-group>

      <van-cell-group inset title="管理员收款与联系方式" class="mt-3">
        <van-cell title="微信收款码">
          <template #value>
            <div class="qr-upload" @click="uploadQr('wx')">
              <van-image v-if="qrWx" :src="qrWx" width="80" height="80" fit="cover" radius="6px" />
              <span v-else class="upload-label">+ 上传图片</span>
            </div>
          </template>
        </van-cell>
        <van-cell title="支付宝收款码">
          <template #value>
            <div class="qr-upload" @click="uploadQr('alipay')">
              <van-image v-if="qrAli" :src="qrAli" width="80" height="80" fit="cover" radius="6px" />
              <span v-else class="upload-label">+ 上传图片</span>
            </div>
          </template>
        </van-cell>
        <van-field v-model="contactWechat" label="管理员微信号" placeholder="输入微信号方便雇主添加" />
        <van-button class="save-btn" round block type="primary" @click="saveContact">保存收款与联系方式</van-button>
      </van-cell-group>
    </div>

    <!-- 用户管理 -->
    <div v-if="tab === 'users'" class="section">
      <!-- 赏金猎人审批区 -->
      <div v-if="hunterApps.length" class="card hunter-card">
        <div class="card-top">
          <b class="hunter-title">🐺 赏金猎人接单申请 ({{ hunterApps.length }} 条待处理)</b>
        </div>
        <div v-for="h in hunterApps" :key="h.id" class="user-row hunter-app">
          <div class="user-main">
            <div class="user-name-row">
              <b>{{ h.username }}</b>
              <span class="muted">（ID: {{ h.uid }}）</span>
            </div>
            <div class="muted mt-1">{{ h.phone || '未留手机号' }} · {{ campusName(h.campus) }} · {{ fmtTime(h.hunterApplyAt) }} 申请</div>
          </div>
          <div class="user-actions">
            <van-button size="small" round type="primary" @click="approveHunter(h)">同意</van-button>
            <van-button size="small" round plain type="danger" @click="rejectHunter(h)">拒绝</van-button>
          </div>
        </div>
      </div>

      <van-empty v-if="users.length === 0" description="暂无用户" />
      <div v-for="u in users" :key="u.id" class="card">
        <div class="user-row">
          <div class="user-main">
            <div class="user-name-row">
              <b>{{ u.username }}</b>
              <span class="muted">ID:
                <span class="copyable copyable--inline" @click.stop="copyText(u.uid, '用户ID')">{{ u.uid || '未分配' }}</span>
              </span>
              <span v-if="u.isHunter" class="tag tag--hunter">🐺 赏金猎人</span>
              <span v-if="u.role === 'admin'" class="tag tag--admin">管理员</span>
            </div>
            <div class="muted mt-1">{{ u.phone || '未填手机号' }} · {{ campusName(u.campus) }}</div>
          </div>
          <div class="user-actions">
            <van-button size="small" plain round @click="openEditUser(u)">编辑</van-button>
            <van-button v-if="u.role !== 'admin'" size="small" plain round type="danger" @click="onDeleteUser(u)">删除</van-button>
          </div>
        </div>
      </div>

      <!-- 编辑用户弹层 -->
      <van-popup v-model:show="showEditUser" position="bottom" round class="edit-popup">
        <div class="edit-title">编辑用户信息</div>
        <van-cell-group inset>
          <van-field v-model="editForm.username" label="用户名" />
          <van-field v-model="editForm.phone" type="tel" label="手机号" maxlength="11" />
          <van-field v-model="editForm.uid" label="用户ID(10位)" maxlength="10" placeholder="10 位纯数字" />
          <van-field label="赏金猎人权限">
            <template #input>
              <div class="switch-line">
                <span>{{ editForm.isHunter ? '已授予接单资格' : '未授予' }}</span>
                <van-switch v-model="editForm.isHunter" size="20" />
              </div>
            </template>
          </van-field>
          <van-field label="所属校区">
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
          <van-button type="primary" block round size="large" @click="saveEditUser">保存修改</van-button>
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
const checkSearch = ref('');
async function loadPaying() {
  const res = await api.get('/admin/orders', {
    params: { status: 'PAYING', q: checkSearch.value || undefined },
  });
  payingList.value = res.data;
}
function resetCheck() {
  checkSearch.value = '';
  loadPaying();
}
function viewScreenshot(o) {
  if (!o.payerScreenshot) return showToast('该订单未上传截图');
  showImagePreview([o.payerScreenshot]);
}
async function markPaid(o) {
  await showConfirmDialog({ title: '确认收款', message: `核对单号 ${o.orderNo} 已到账？确认后订单自动发布到大厅。` });
  await api.post(`/admin/orders/${o.id}/mark-paid`);
  showSuccessToast('已标记支付并上线大厅');
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

/** 点击状态标签筛选 */
function onFilter(opt) {
  statusFilter.value = opt.value;
  loadOrders();
}

/** 删除订单（管理员） */
async function onDeleteAdminOrder(o) {
  await showConfirmDialog({
    title: '删除订单',
    message: `确认删除订单 ${o.orderNo}？删除后不可恢复（结算历史不受影响）。`,
  });
  await api.delete(`/admin/orders/${o.id}`);
  showSuccessToast('已删除');
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
  showSuccessToast('已标记转账完成');
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
  showSuccessToast('联系方式已保存');
}

/* ---------- 用户管理 ---------- */
const users = ref([]);
const hunterApps = ref([]);
const showEditUser = ref(false);
const editForm = reactive({ id: null, username: '', phone: '', uid: '', campus: 'scyz', isHunter: false, password: '' });

function fmtTime(t) {
  return t ? String(t).replace('T', ' ').slice(5, 16) : '';
}

/** 加载猎头申请列表 */
async function loadHunterApps() {
  const res = await api.get('/admin/hunter-applications');
  hunterApps.value = res.data;
}

/** 同意猎头申请 */
async function approveHunter(h) {
  await showConfirmDialog({ title: '同意申请', message: `授予「${h.username}」赏金猎人身份？` });
  await api.post(`/admin/hunter/${h.id}/approve`);
  showSuccessToast('已授予接单资格');
  loadHunterApps();
  loadUsers();
}

/** 拒绝猎头申请 */
async function rejectHunter(h) {
  await showConfirmDialog({ title: '拒绝申请', message: `拒绝「${h.username}」的申请？（可重新申请）` });
  await api.post(`/admin/hunter/${h.id}/reject`);
  showSuccessToast('已拒绝');
  loadHunterApps();
}

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
    isHunter: !!u.isHunter,
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
    isHunter: editForm.isHunter,
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
  loadHunterApps();
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
  if (tab.value === 'users') {
    loadUsers();
    loadHunterApps();
  }
});

onMounted(() => {
  loadAll();
});
</script>

<style scoped>
.admin-page {
  min-height: 100vh;
  background: var(--bg-page);
  padding-bottom: 60px;
}
.nav-logout {
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 2px;
}
.section {
  padding: 12px 14px;
}
.card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-light);
}
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.reward-wrap {
  color: #ea580c;
  display: flex;
  align-items: baseline;
}
.reward-wrap .unit {
  font-size: 13px;
  font-weight: 600;
}
.reward-wrap .val {
  font-size: 20px;
  font-weight: 700;
}
.station-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
  background: #f1f5f9;
  color: #475569;
}
.card-line {
  font-size: 13px;
  color: #334155;
  margin-top: 4px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.address-line {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  gap: 4px;
}
.code-val {
  font-weight: 700;
  color: #059669;
  margin-left: 4px;
}
.muted-box {
  background: #f8fafc;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: #64748b;
  border: 1px dashed #e2e8f0;
  display: block;
  margin-top: 8px;
}
.card-actions {
  margin-top: 12px;
  display: flex;
  gap: 10px;
}
.justify-end {
  justify-content: flex-end;
}
.muted {
  color: #64748b;
  font-size: 12px;
}
.ml-2 {
  margin-left: 8px;
}
.mt-1 {
  margin-top: 4px;
}
.mt-2 {
  margin-top: 8px;
}
.mt-3 {
  margin-top: 12px;
}

.tag {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
}
.tag--hunter {
  background: #ecfdf5;
  color: #059669;
  margin-left: 6px;
}
.tag--admin {
  background: #eff6ff;
  color: #2563eb;
  margin-left: 6px;
}
.tag--PAYING,
.tag--PAID {
  background: #fff7ed;
  color: #ea580c;
  border: 1px solid rgba(234, 88, 12, 0.2);
}
.tag--ACCEPTED,
.tag--DELIVERED {
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid rgba(37, 99, 235, 0.2);
}
.tag--CONFIRMED,
.tag--SETTLED {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.2);
}
.tag--CANCELED {
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.sum {
  color: #ea580c;
  font-weight: 700;
  font-size: 16px;
}

/* 过滤区 */
.filter-wrap {
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
  padding: 6px 16px 10px;
  font-size: 13px;
  color: var(--van-primary-color);
  text-align: right;
  cursor: pointer;
  font-weight: 500;
}

/* 状态筛选标签栏 */
.chip-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 2px 12px;
  white-space: nowrap;
  -webkit-overflow-scrolling: touch;
}
.chip {
  flex: 0 0 auto;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 13px;
  color: #64748b;
  background: #fff;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: all 0.15s ease;
}
.chip--active {
  color: #059669;
  border-color: #059669;
  background: #ecfdf5;
  font-weight: 600;
}

/* 结算行 */
.settle-tools {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 4px 14px;
}
.settle-date-tag {
  font-weight: 600;
  color: #0f172a;
}
.preview-box {
  margin-top: 8px;
}

/* 表单设置行 */
.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 14px 6px;
}
.name-row .van-field {
  flex: 1;
}
.add-btn {
  margin: 8px 16px 12px;
}
.form-note {
  margin: 0 16px 12px;
  font-size: 12px;
  color: #64748b;
}
.save-btn {
  margin: 16px;
  width: calc(100% - 32px);
}

.qr-upload {
  display: flex;
  align-items: center;
  cursor: pointer;
}
.upload-label {
  padding: 8px 16px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  color: #64748b;
  font-size: 12px;
  background: #f8fafc;
}

/* 用户与猎人列表 */
.hunter-card {
  border-left: 4px solid #059669;
}
.hunter-title {
  color: #059669;
}
.user-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.user-main {
  flex: 1;
}
.user-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.user-actions {
  display: flex;
  gap: 6px;
}
.hunter-app {
  padding: 12px 0;
  border-top: 1px solid #f1f5f9;
}
.switch-line {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #0f172a;
  font-size: 14px;
}
.edit-popup {
  padding: 20px 0;
}
.edit-title {
  font-size: 17px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 16px;
  color: #0f172a;
}
.edit-actions {
  padding: 20px 16px 8px;
}
</style>
