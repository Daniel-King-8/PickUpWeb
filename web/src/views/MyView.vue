<template>
  <div class="page">
    <van-nav-bar title="我的" />

    <!-- 个人中心顶部卡片 -->
    <div class="user-card">
      <div class="user-main">
        <div class="avatar-wrap">
          <div class="avatar">{{ (user.username || '同')[0] }}</div>
          <div v-if="user.isHunter" class="hunter-badge" title="赏金猎人">🐺</div>
        </div>
        <div class="user-info">
          <div class="name-row">
            <span class="name">{{ user.username || '同学' }}</span>
            <span class="edit-name" title="修改名称" @click="openRename">✏️</span>
            <span v-if="user.role === 'admin'" class="role-tag">管理员</span>
          </div>
          <div class="uid">
            用户ID：<span class="copyable copyable--light" @click="copyText(user.uid, '用户ID')">{{ user.uid || '--' }}</span>
          </div>
          <div class="campus">
            <van-icon name="location-o" />
            <span>{{ campusName(user.campus) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 数据统计看板 -->
    <div class="stats-card">
      <div class="stat-item" @click="$router.push('/run')">
        <div class="stat-num">{{ stats.runCompleted ?? 0 }}</div>
        <div class="stat-label">累计跑单</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item" @click="$router.push('/orders/mine')">
        <div class="stat-num">{{ stats.publishTotal ?? 0 }}</div>
        <div class="stat-label">累计发布</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item" @click="$router.push('/run')">
        <div class="stat-num stat-highlight">{{ stats.runOngoing ?? 0 }}</div>
        <div class="stat-label">进行中</div>
      </div>
    </div>

    <!-- 接单资格：赏金猎人 -->
    <van-cell-group inset title="接单权限">
      <van-cell
        v-if="hunterStatus === 'approved'"
        title="赏金猎人资格"
        value="已开通 (可在接单大厅抢单)"
        value-class="hunter-status-approved"
      >
        <template #icon><span class="cell-emoji">🐺</span></template>
      </van-cell>
      <van-cell
        v-else-if="hunterStatus === 'pending'"
        title="赏金猎人资格"
        value="审核中 (等待管理员确认)"
        value-class="hunter-status-pending"
      >
        <template #icon><span class="cell-emoji">⏳</span></template>
      </van-cell>
      <van-cell
        v-else
        title="申请成为赏金猎人"
        value="点击申请接单"
        is-link
        value-class="hunter-status-none"
        @click="onApplyHunter"
      >
        <template #icon><span class="cell-emoji">✨</span></template>
      </van-cell>
    </van-cell-group>

    <!-- 功能入口 -->
    <van-cell-group inset title="常用功能">
      <van-cell title="我发布的订单" is-link @click="$router.push('/orders/mine')">
        <template #icon><van-icon name="orders-o" class="cell-icon" /></template>
      </van-cell>
      <van-cell title="我接取的跑单" is-link @click="$router.push('/run')">
        <template #icon><van-icon name="logistics" class="cell-icon" /></template>
      </van-cell>
      <van-cell title="绑定校区" :value="campusName(user.campus)">
        <template #icon><van-icon name="hotel-o" class="cell-icon" /></template>
      </van-cell>
      <van-cell :title="kook.bound ? 'Kook 绑定' : '绑定 Kook 机器人'" :value="kook.bound ? kook.kookId : '未绑定'" is-link @click="openKook">
        <template #icon><van-icon name="chat-o" class="cell-icon" /></template>
      </van-cell>
      <van-cell title="关于取个件呗" is-link value="博客介绍" @click="onAbout">
        <template #icon><van-icon name="info-o" class="cell-icon" /></template>
      </van-cell>
      <van-cell title="联系作者" is-link value="QQ: 1007887927" @click="onContact">
        <template #icon><van-icon name="chat-o" class="cell-icon" /></template>
      </van-cell>
    </van-cell-group>

    <div class="logout">
      <van-button block round plain type="danger" @click="onLogout">退出登录</van-button>
    </div>

    <!-- 修改名称弹出层（名称 = 登录账号） -->
    <van-popup v-model:show="showRename" position="bottom" round>
      <div class="edit-title">修改名称</div>
      <van-cell-group inset>
        <van-field v-model="newName" label="名称(登录账号)" placeholder="请输入名称" maxlength="50" clearable />
      </van-cell-group>
      <div class="rename-tip">⚠️ 名称即登录账号：张三 → 李四后，登录时须使用"李四"</div>
      <div class="edit-actions">
        <van-button type="primary" block round @click="saveRename">保存</van-button>
      </div>
    </van-popup>

    <!-- Kook 绑定弹出层 -->
    <van-popup v-model:show="showKook" position="bottom" round>
      <div class="edit-title">Kook 机器人绑定</div>
      <div class="kook-wrap">
        <!-- 已绑定 -->
        <template v-if="kook.bound">
          <div class="kook-bound">✅ 已绑定 Kook：{{ kook.kookId }}</div>
          <div class="kook-tip">Kook 里收到的订单通知与按钮操作都将以你的账号执行</div>
          <van-button block round plain type="danger" class="kook-btn" @click="unbindKook">解除绑定</van-button>
        </template>
        <!-- 生成码待绑定 -->
        <template v-else-if="kook.code">
          <div class="kook-code">{{ kook.code }}</div>
          <div class="kook-tip">打开 Kook，向机器人私聊或任意频道发送：</div>
          <div class="kook-command">绑定 {{ kook.code }}</div>
          <div class="kook-tip">绑定码 10 分钟内有效，重新生成后旧码作废</div>
          <van-button block round plain size="small" class="kook-btn" @click="genCode">重新生成</van-button>
        </template>
        <!-- 未绑定未生成 -->
        <template v-else>
          <div class="kook-tip">绑定后可在 Kook 里实时接收订单通知，并通过机器人卡片接单/标记送达/确认收货</div>
          <van-button type="primary" block round class="kook-btn" @click="genCode">生成绑定码</van-button>
        </template>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast, showConfirmDialog } from 'vant';
import api from '../api';
import { getUser, clearAuth, setAuth } from '../store';
import { copyText } from '../utils/copy';

const router = useRouter();
const user = ref(getUser() || {});
const stats = reactive({ runCompleted: null, publishTotal: null, runOngoing: null });

const CAMPUS = {
  scyz: '四川邮电职业技术学院',
  cdny: '成都农业科技职业学院',
};
function campusName(id) {
  return CAMPUS[id] || (id ? id : '未选择校区');
}

onMounted(async () => {
  try {
    const res = await api.get('/users/stats');
    stats.runCompleted = res.data.runCompleted;
    stats.publishTotal = res.data.publishTotal;
    stats.runOngoing = res.data.runOngoing;
    user.value = res.data;
  } catch (e) {
    /* 401 拦截器已处理跳转 */
  }
});

/** 猎头状态：approved / pending / none */
const hunterStatus = computed(() => {
  if (user.value.isHunter) return 'approved';
  if (user.value.hunterApplyAt) return 'pending';
  return 'none';
});

/** 申请成为赏金猎人 */
async function onApplyHunter() {
  if (hunterStatus.value === 'pending') return showToast('已申请，请等待管理员审核');
  if (hunterStatus.value === 'approved') return;
  // 确认弹窗：是否成为赏金猎人
  try {
    await showConfirmDialog({
      title: '成为赏金猎人？',
      message: '申请后经管理员同意，即可在接单大厅抢单。',
      confirmText: '确认',
    });
  } catch (e) {
    return; // 取消
  }
  try {
    const res = await api.post('/users/hunter-apply');
    // 刷新本地登录态与页面状态
    const me = await api.get('/users/me');
    setAuth(localStorage.getItem('token'), me.data);
    user.value = me.data;
    stats.runCompleted = user.value.runCompleted ?? stats.runCompleted;
    showToast('申请成功，请等待管理员审核');
  } catch (e) {
    /* 拦截器已提示 */
  }
}

/* ---------- Kook 绑定 ---------- */
const showKook = ref(false);
const kook = reactive({ bound: false, kookId: '', code: '', expireAt: 0 });

async function loadKook() {
  const res = await api.get('/kook/status');
  kook.bound = res.data.bound;
  kook.kookId = res.data.kookId;
  if (kook.bound) kook.code = '';
}

function openKook() {
  showKook.value = true;
  loadKook();
}

async function genCode() {
  const res = await api.post('/kook/bind-code');
  kook.code = res.data.code;
  kook.expireAt = res.data.expireAt;
  showToast('绑定码已生成，请在 Kook 发送「绑定 ' + kook.code + '」');
}

async function unbindKook() {
  try {
    await showConfirmDialog({ title: '解除绑定', message: '确认解除当前 Kook 绑定？', confirmText: '解绑' });
  } catch (e) {
    return;
  }
  await api.post('/kook/unbind');
  showToast('已解绑');
  loadKook();
}

/* ---------- 修改名称（即登录账号） ---------- */
const showRename = ref(false);
const newName = ref('');

function openRename() {
  newName.value = user.value.username || '';
  showRename.value = true;
}

async function saveRename() {
  const name = newName.value.trim();
  if (!name) return showToast('名称不能为空');
  if (name.length > 50) return showToast('名称最长 50 字符');
  try {
    const res = await api.put('/users/profile', { name });
    // 更新本地登录态与页面
    setAuth(localStorage.getItem('token'), res.data);
    user.value = res.data;
    showRename.value = false;
    showToast('名称已修改，下次登录请使用新名称');
  } catch (e) {
    /* 拦截器已提示 */
  }
}

/** 关于：直接跳转博客（新标签页） */
function onAbout() {
  window.open('https://blog.king818.xyz/archives/qujian', '_blank');
}

/** 联系作者：复制 QQ */
function onContact() {
  navigator.clipboard.writeText('1007887927');
  showToast('QQ号已复制，加好友请备注来意');
}

function onLogout() {
  clearAuth();
  router.replace('/login');
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--bg-page);
  padding-bottom: 96px;
}

/* 用户主卡片 */
.user-card {
  margin: 12px 14px;
  padding: 24px 20px;
  border-radius: 18px;
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  color: #fff;
  box-shadow: 0 10px 25px -4px rgba(5, 150, 105, 0.35);
}
.user-main {
  display: flex;
  align-items: center;
}
.avatar-wrap {
  position: relative;
}
.avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  border: 2px solid rgba(255, 255, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.hunter-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 22px;
  height: 22px;
  background: #ffffff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}
.user-info {
  margin-left: 16px;
  flex: 1;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.name {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.3px;
}
.role-tag {
  font-size: 11px;
  background: rgba(255, 255, 255, 0.25);
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
}
.uid {
  margin-top: 5px;
  font-size: 12px;
  opacity: 0.9;
}
.campus {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.9;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 统计卡片 */
.stats-card {
  display: flex;
  align-items: center;
  margin: 12px 14px 16px;
  padding: 16px 0;
  background: #fff;
  border-radius: 14px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-light);
}
.stat-item {
  flex: 1;
  text-align: center;
  cursor: pointer;
  transition: transform 0.15s ease;
}
.stat-item:active {
  transform: scale(0.96);
}
.stat-num {
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
}
.stat-highlight {
  color: var(--van-primary-color);
}
.stat-label {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}
.stat-divider {
  width: 1px;
  height: 28px;
  background: #e2e8f0;
}

.cell-icon {
  font-size: 18px;
  color: var(--van-primary-color);
  margin-right: 8px;
}
.cell-emoji {
  font-size: 16px;
  margin-right: 8px;
}

:deep(.hunter-status-approved) {
  color: #059669 !important;
  font-weight: 600;
}
:deep(.hunter-status-pending) {
  color: #d97706 !important;
  font-weight: 600;
}
:deep(.hunter-status-none) {
  color: var(--van-primary-color) !important;
  font-weight: 600;
}

.logout {
  margin: 28px 16px;
}
/* 姓名旁编辑图标 */
.edit-name {
  margin-left: 6px;
  font-size: 14px;
  cursor: pointer;
  opacity: 0.85;
}
.edit-name:hover {
  opacity: 1;
}
.edit-title {
  padding: 20px 0 12px;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main, #0f172a);
}
.rename-tip {
  margin: 10px 16px 4px;
  font-size: 12px;
  color: var(--text-secondary, #64748b);
}
.edit-actions {
  padding: 16px;
}

/* Kook 绑定弹层 */
.kook-wrap {
  padding: 8px 24px 28px;
  text-align: center;
}
.kook-bound {
  font-size: 15px;
  font-weight: 600;
  color: #059669;
  margin-bottom: 8px;
}
.kook-code {
  font-size: 42px;
  font-weight: 800;
  letter-spacing: 10px;
  color: #0f172a;
  margin: 8px 0 6px;
  background: #ecfdf5;
  border-radius: 12px;
  padding: 10px 0;
  border: 1px dashed #6ee7b7;
}
.kook-command {
  font-size: 16px;
  font-weight: 700;
  color: #059669;
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px 16px;
  margin: 6px 0;
  font-family: monospace;
}
.kook-tip {
  font-size: 12px;
  color: #64748b;
  margin: 6px 0;
  line-height: 1.5;
}
.kook-btn {
  margin-top: 14px;
}
</style>
