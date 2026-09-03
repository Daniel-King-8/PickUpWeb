<template>
  <div class="login-page">
    <div class="brand">
      <div class="brand-logo">取</div>
      <div class="brand-name">取个件呗</div>
      <div class="brand-slogan">校园快递代取 · 双方都是同学</div>
    </div>

    <van-form class="form">
      <van-cell-group inset>
        <van-field
          v-model="form.username"
          label="用户名"
          placeholder="请输入用户名"
          maxlength="50"
        />
        <van-field
          v-model="form.password"
          type="password"
          label="密码"
          placeholder="至少 6 位"
          maxlength="50"
        />
        <van-field
          v-if="mode === 'register'"
          v-model="form.phone"
          label="手机号"
          placeholder="选填，用于联系"
          maxlength="11"
        />
      </van-cell-group>
      <div class="submit-area">
        <van-button
          type="primary"
          block
          round
          :loading="loading"
          :native-type="mode === 'login' ? 'submit' : 'button'"
          @click="onSubmit"
        >
          {{ mode === 'login' ? '登录' : '注册并登录' }}
        </van-button>
        <div class="switch">
          <template v-if="mode === 'login'">
            没有账号？
            <span class="switch-link" @click="switchMode('register')">去注册</span>
          </template>
          <template v-else>
            已有账号？
            <span class="switch-link" @click="switchMode('login')">去登录</span>
          </template>
        </div>
      </div>
    </van-form>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import api from '../api';
import { setAuth } from '../store';

const router = useRouter();
const mode = ref('login');
const loading = ref(false);
const form = reactive({ username: '', password: '', phone: '' });

function switchMode(m) {
  mode.value = m;
}

async function onSubmit() {
  if (!form.username || !form.password) {
    showToast('请输入用户名和密码');
    return;
  }
  if (mode.value === 'register' && form.password.length < 6) {
    showToast('密码至少 6 位');
    return;
  }
  loading.value = true;
  try {
    const url = mode.value === 'login' ? '/users/login' : '/users/register';
    const res = await api.post(url, form);
    // 响应结构：{ code, data: { token, user } }，需取 res.data.data
    const payload = res.data.data;
    setAuth(payload.token, payload.user);
    showToast(mode.value === 'login' ? '登录成功' : '注册成功');
    // 管理员进入后台，普通用户进入下单首页（从 payload 取用户信息）
    router.replace(payload.user.role === 'admin' ? '/admin' : '/');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #e8f7f0 0%, #ffffff 60%);
  padding-top: 140px;
  box-sizing: border-box;
}
.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 48px;
}
.brand-logo {
  width: 80px;
  height: 80px;
  border-radius: 22px;
  background: #00a870;
  color: #fff;
  font-size: 40px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  box-shadow: 0 12px 30px rgba(0, 168, 112, 0.3);
}
.brand-name {
  font-size: 24px;
  font-weight: 600;
  color: #1a1a1a;
}
.brand-slogan {
  margin-top: 8px;
  font-size: 13px;
  color: #8a8a8a;
}
.submit-area {
  margin-top: 40px;
  padding: 0 32px;
}
.switch {
  margin-top: 16px;
  text-align: center;
  font-size: 14px;
  color: #8a8a8a;
}
.switch-link {
  color: #00a870;
  font-weight: 500;
}
</style>
