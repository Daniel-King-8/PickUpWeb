<template>
  <div class="login-page">
    <div class="brand">
      <div class="brand-logo-wrap">
        <div class="brand-logo">取</div>
        <div class="brand-badge">校园版</div>
      </div>
      <div class="brand-name">取个件呗</div>
      <div class="brand-slogan">同学互助代取 · 便捷校园生活</div>
    </div>

    <van-form class="form">
      <van-cell-group inset class="form-group">
        <van-field
          v-model="form.username"
          label="用户名"
          placeholder="请输入用户名"
          maxlength="50"
        >
          <template #left-icon>
            <van-icon name="user-o" class="field-icon" />
          </template>
        </van-field>

        <van-field
          v-model="form.password"
          type="password"
          label="密码"
          placeholder="至少 6 位密码"
          maxlength="50"
        >
          <template #left-icon>
            <van-icon name="lock" class="field-icon" />
          </template>
        </van-field>

        <van-field
          v-if="mode === 'register'"
          v-model="form.confirmPassword"
          type="password"
          label="确认密码"
          placeholder="请再次输入密码"
          maxlength="50"
        >
          <template #left-icon>
            <van-icon name="checked" class="field-icon" />
          </template>
        </van-field>

        <van-field
          v-if="mode === 'register'"
          v-model="form.phone"
          label="手机号"
          placeholder="选填，跑单联系使用"
          maxlength="11"
        >
          <template #left-icon>
            <van-icon name="phone-o" class="field-icon" />
          </template>
        </van-field>
      </van-cell-group>

      <div class="submit-area">
        <van-button
          type="primary"
          block
          round
          size="large"
          class="submit-btn"
          :loading="loading"
          :native-type="mode === 'login' ? 'submit' : 'button'"
          @click="onSubmit"
        >
          {{ mode === 'login' ? '立即登录' : '注册并登录' }}
        </van-button>
        <div class="switch">
          <template v-if="mode === 'login'">
            还没有账号？
            <span class="switch-link" @click="switchMode('register')">免费注册 →</span>
          </template>
          <template v-else>
            已有账号？
            <span class="switch-link" @click="switchMode('login')">返回登录 →</span>
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
const form = reactive({ username: '', password: '', confirmPassword: '', phone: '' });

function switchMode(m) {
  mode.value = m;
  // 切换模式时清空密码相关输入，避免残留导致误判
  form.password = '';
  form.confirmPassword = '';
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
  if (mode.value === 'register' && form.password !== form.confirmPassword) {
    showToast('两次输入的密码不一致');
    return;
  }
  loading.value = true;
  try {
    const url = mode.value === 'login' ? '/users/login' : '/users/register';
    const res = await api.post(url, form);
    // 拦截器已解包：res.data 直接为 { token, user }
    const payload = res.data;
    setAuth(payload.token, payload.user);
    showToast(mode.value === 'login' ? '登录成功' : '注册成功');
    // 管理员进后台；普通用户：已选校区进大厅，未选校区先去选校区
    if (payload.user.role === 'admin') {
      router.replace('/admin');
    } else if (payload.user.campus) {
      router.replace('/');
    } else {
      router.replace('/campus');
    }
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #ecfdf5 0%, #f8fafc 45%, #ffffff 100%);
  padding-top: 100px;
  box-sizing: border-box;
}
.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 36px;
}
.brand-logo-wrap {
  position: relative;
  margin-bottom: 16px;
}
.brand-logo {
  width: 84px;
  height: 84px;
  border-radius: 24px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  font-size: 44px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 30px rgba(5, 150, 105, 0.35);
}
.brand-badge {
  position: absolute;
  top: -6px;
  right: -10px;
  background: #f43f5e;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
  border: 2px solid #ffffff;
}
.brand-name {
  font-size: 26px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: 0.5px;
}
.brand-slogan {
  margin-top: 8px;
  font-size: 13px;
  color: #64748b;
}

.form-group {
  box-shadow: var(--shadow-card) !important;
}

.field-icon {
  color: #059669;
  font-size: 17px;
  margin-right: 6px;
}

.submit-area {
  margin-top: 32px;
  padding: 0 24px;
}
.submit-btn {
  font-size: 16px !important;
  font-weight: 600 !important;
}
.switch {
  margin-top: 18px;
  text-align: center;
  font-size: 14px;
  color: #64748b;
}
.switch-link {
  color: var(--van-primary-color);
  font-weight: 600;
  cursor: pointer;
}
</style>
