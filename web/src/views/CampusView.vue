<template>
  <div class="campus-page">
    <div class="header">
      <div class="logo">取</div>
      <div class="title">选择你所在的校区</div>
      <div class="subtitle">你只能看到和接取本校区发布的悬赏</div>
    </div>

    <div class="card" :class="{ active: selected === c.id }" v-for="c in campusList" :key="c.id" @click="selected = c.id">
      <div class="card-name">{{ c.name }}</div>
      <div class="card-desc">本校区的悬赏仅本校区同学可见可接</div>
      <div class="check" v-if="selected === c.id">✓</div>
    </div>

    <van-button type="primary" block round class="submit" :loading="loading" @click="onSubmit">
      进入接单大厅
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
  background: linear-gradient(180deg, #e8f7f0 0%, #fff 55%);
  padding: 90px 24px 40px;
  box-sizing: border-box;
}
.header {
  text-align: center;
  margin-bottom: 44px;
}
.logo {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: #00a870;
  color: #fff;
  font-size: 30px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 14px;
  box-shadow: 0 10px 26px rgba(0, 168, 112, 0.3);
}
.title {
  font-size: 22px;
  font-weight: 600;
  color: #1a1a1a;
}
.subtitle {
  margin-top: 8px;
  font-size: 13px;
  color: #8a8a8a;
}
.card {
  position: relative;
  padding: 22px 20px;
  margin-bottom: 16px;
  border-radius: 10px;
  border: 1px solid #eee;
  background: #fff;
  transition: all 0.2s;
}
.card.active {
  border-color: #00a870;
  background: #f0faf5;
  box-shadow: 0 6px 18px rgba(0, 168, 112, 0.12);
}
.card-name {
  font-size: 17px;
  font-weight: 600;
  color: #1a1a1a;
}
.card-desc {
  margin-top: 6px;
  font-size: 12px;
  color: #8a8a8a;
}
.check {
  position: absolute;
  top: 50%;
  right: 18px;
  transform: translateY(-50%);
  color: #00a870;
  font-size: 20px;
  font-weight: 700;
}
.submit {
  margin-top: 32px;
}
</style>
