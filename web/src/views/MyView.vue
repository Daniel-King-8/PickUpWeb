<template>
  <div class="page">
    <van-nav-bar title="我的" />

    <!-- 用户信息卡 -->
    <div class="user-card">
      <div class="avatar">取</div>
      <div class="user-info">
        <div class="name">{{ user.username || '同学' }}</div>
        <div class="uid">
          用户ID：<span class="copyable copyable--light" @click="copyText(user.uid, '用户ID')">{{ user.uid || '--' }}</span>
        </div>
        <div class="campus">{{ campusName(user.campus) }}</div>
      </div>
    </div>

    <!-- 数据统计：累计完成 / 累计发布 / 进行中 -->
    <div class="stats">
      <div class="stat">
        <div class="num">{{ stats.runCompleted ?? '--' }}</div>
        <div class="label">累计完成</div>
      </div>
      <div class="stat">
        <div class="num">{{ stats.publishTotal ?? '--' }}</div>
        <div class="label">累计发布</div>
      </div>
      <div class="stat">
        <div class="num">{{ stats.runOngoing ?? '--' }}</div>
        <div class="label">进行中</div>
      </div>
    </div>

    <!-- 接单资格：赏金猎人 -->
    <van-cell-group inset title="接单资格">
      <van-cell v-if="hunterStatus === 'approved'" title="赏金猎人" value="✅ 已获得接单资格" />
      <van-cell v-else-if="hunterStatus === 'pending'" title="赏金猎人" value="⏳ 已申请，等待管理员审核" />
      <van-cell v-else title="赏金猎人" value="尚未申请 · 点击申请" is-link @click="onApplyHunter" />
    </van-cell-group>

    <!-- 功能入口 -->
    <van-cell-group inset title="功能">
      <van-cell title="我发布的订单" is-link @click="$router.push('/orders/mine')">
        <template #icon><div class="cell-icon">📋</div></template>
      </van-cell>
      <van-cell title="所在校区" :value="campusName(user.campus)" />
      <van-cell title="关于取个件呗" is-link value="博客介绍" @click="onAbout">
        <template #icon><div class="cell-icon">ℹ️</div></template>
      </van-cell>
      <van-cell title="联系作者" is-link value="QQ：1007887927" @click="onContact">
        <template #icon><div class="cell-icon">💬</div></template>
      </van-cell>
    </van-cell-group>

    <div class="logout">
      <van-button block round plain type="danger" @click="onLogout">退出登录</van-button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast, showConfirmDialog } from 'vant';
import api from '../api';
import { getUser, clearAuth } from '../store';
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

/** 关于：复制博客链接 */
function onAbout() {
  const url = 'https://blog.king818.xyz/archives/qujian';
  navigator.clipboard.writeText(url);
  showToast('链接已复制，请在浏览器打开');
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
  background: #f7f8fa;
  padding-bottom: 80px;
}
.user-card {
  margin: 12px;
  padding: 22px;
  border-radius: 12px;
  background: linear-gradient(135deg, #00a870, #00c48c);
  display: flex;
  align-items: center;
  color: #fff;
}
.avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
}
.user-info {
  margin-left: 16px;
}
.name {
  font-size: 18px;
  font-weight: 600;
}
.uid {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.85;
}
.campus {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.9;
}
.stats {
  display: flex;
  margin: 12px;
  padding: 18px 0;
  background: #fff;
  border-radius: 12px;
}
.stat {
  flex: 1;
  text-align: center;
}
.num {
  font-size: 22px;
  font-weight: 700;
  color: #00a870;
}
.label {
  margin-top: 6px;
  font-size: 12px;
  color: #8a8a8a;
}
.cell-icon {
  font-size: 18px;
  margin-right: 8px;
}
.logout {
  margin: 24px 16px;
}
</style>
