<template>
  <div class="campus-page">
    <div class="header">
      <div class="logo">校</div>
      <div class="title">选择你所在的校区</div>
      <div class="subtitle">仅展示与匹配本校区的悬赏与代取任务</div>
    </div>

    <div
      class="card"
      :class="{ active: selected === c.id }"
      v-for="c in campusList"
      :key="c.id"
      @click="selected = c.id"
    >
      <div class="card-left">
        <div class="campus-icon">🏫</div>
        <div class="campus-info">
          <div class="card-name">{{ c.name }}</div>
          <div class="card-desc">本校区同学专属接发单通道</div>
        </div>
      </div>
      <div class="check-box" :class="{ 'check-box--checked': selected === c.id }">
        <van-icon v-if="selected === c.id" name="success" />
      </div>
    </div>

    <van-button
      type="primary"
      block
      round
      size="large"
      class="submit"
      :loading="loading"
      @click="onSubmit"
    >
      确认并进入接单大厅
    </van-button>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import api from '../api';
import { getUser, setAuth } from '../store';

const router = useRouter();
const campusList = [
  { id: 'scyz', name: '四川邮电职业技术学院' },
  { id: 'cdny', name: '成都农业科技职业学院' },
];
const selected = ref('');
const loading = ref(false);

async function onSubmit() {
  if (!selected.value) return showToast('请选择校区');
  loading.value = true;
  try {
    const res = await api.post('/users/campus', { campus: selected.value });
    // 更新本地登录态（校区已绑定）
    const user = getUser();
    if (user) {
      setAuth(localStorage.getItem('token'), { ...user, campus: res.data.campus });
    }
    showToast('校区已绑定');
    router.replace('/');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.campus-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #ecfdf5 0%, #f8fafc 45%, #ffffff 100%);
  padding: 70px 20px 40px;
  box-sizing: border-box;
}
.header {
  text-align: center;
  margin-bottom: 36px;
}
.logo {
  width: 68px;
  height: 68px;
  border-radius: 20px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  font-size: 32px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  box-shadow: 0 10px 25px rgba(5, 150, 105, 0.3);
}
.title {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
}
.subtitle {
  margin-top: 8px;
  font-size: 13px;
  color: #64748b;
}

.card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  margin-bottom: 16px;
  border-radius: 16px;
  border: 2px solid #e2e8f0;
  background: #fff;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}
.card:active {
  transform: scale(0.98);
}
.card.active {
  border-color: #059669;
  background: #f0fdf4;
  box-shadow: 0 8px 24px rgba(5, 150, 105, 0.15);
}
.card-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.campus-icon {
  font-size: 26px;
}
.card-name {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}
.card-desc {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

.check-box {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  transition: all 0.2s ease;
}
.check-box--checked {
  background: #059669;
  border-color: #059669;
}

.submit {
  margin-top: 36px;
  font-weight: 600 !important;
}
</style>
