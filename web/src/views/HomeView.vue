<template>
  <div class="home-page">
    <van-nav-bar title="发布取件需求" />

    <!-- 顶部说明卡片 -->
    <div class="tips-card">
      <div class="tips-icon">📦</div>
      <div class="tips-text">
        <div class="tips-title">发布校园代取需求</div>
        <div class="tips-desc">填写快递信息，系统自动核算跑腿费。提交后扫码或加微信付款，管理员确认后即刻发布接单大厅。</div>
      </div>
    </div>

    <!-- 付款提示：付款前先加管理员 -->
    <div class="pay-warn" v-if="contactWechat">
      <div class="warn-icon">💡</div>
      <div class="warn-content">
        <b>温馨提示：</b>提交订单后请添加管理员微信（<span class="copyable copyable--inline" @click="copyContact">{{ contactWechat }}</span>）进行付款与核对
      </div>
    </div>

    <van-form class="form">
      <van-cell-group inset title="取件与送达信息">
        <van-field
          v-model="form.station"
          is-link
          readonly
          label="取件驿站"
          placeholder="点击选择驿站"
          @click="showStation = true"
        >
          <template #left-icon>
            <van-icon name="location-o" class="field-icon" />
          </template>
        </van-field>

        <van-field
          v-model="form.pickupCode"
          label="取件码"
          placeholder="如：5-2-3021 / 短信取件码"
          maxlength="50"
        >
          <template #left-icon>
            <van-icon name="qr" class="field-icon" />
          </template>
        </van-field>

        <!-- 费用明细展示卡 -->
        <div class="fee-box" v-if="feeDetail">
          <div class="fee-header">
            <span class="fee-title">最低悬赏金额</span>
            <div class="fee-badge">最低 ￥{{ minReward.toFixed(2) }}</div>
          </div>
          <div class="fee-detail">
            <span>{{ feeDetail.detail }}</span>
            <span class="fee-tip">· 雇主可自行上调金额以加速接单</span>
          </div>
        </div>

        <van-field
          v-model="form.reward"
          type="digits"
          label="悬赏金额(元)"
          :placeholder="`最低 ${minReward.toFixed(2)} 元`"
          maxlength="6"
          :error-message="rewardError"
        >
          <template #left-icon>
            <van-icon name="gold-coin-o" class="field-icon" />
          </template>
        </van-field>
        <div class="reward-tip">💡 悬赏金额越高，接单越快</div>

        <van-field
          v-model="form.destination"
          label="目的地"
          placeholder="点击选择宿舍楼/片区"
          is-link
          readonly
          @click="showTower = true"
        >
          <template #left-icon>
            <van-icon name="hotel-o" class="field-icon" />
          </template>
        </van-field>

        <van-field
          v-model="form.roomNo"
          label="房间号"
          placeholder="如 302 / A栋（选填）"
          maxlength="10"
        >
          <template #left-icon>
            <van-icon name="wap-home-o" class="field-icon" />
          </template>
        </van-field>

        <van-field
          v-model="form.contactPhone"
          type="tel"
          label="联系电话"
          placeholder="跑腿员接单后联系使用"
          maxlength="11"
        >
          <template #left-icon>
            <van-icon name="phone-o" class="field-icon" />
          </template>
        </van-field>

        <van-field
          v-model="form.remark"
          label="备注信息"
          placeholder="选填：大件/重件/需轻放等"
          maxlength="100"
        >
          <template #left-icon>
            <van-icon name="notes-o" class="field-icon" />
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
          :loading="submitting"
          :disabled="!!rewardError"
          @click="onSubmit"
        >
          立即提交订单 · ￥{{ submitAmount }}
        </van-button>
        <div class="my-orders-link" @click="$router.push('/orders/mine')">
          <span>查看我发布的历史订单</span>
          <van-icon name="arrow" />
        </div>
      </div>
    </van-form>

    <!-- 驿站选择：点击式列表 -->
    <van-action-sheet
      v-model:show="showStation"
      :actions="stationActions"
      title="选择取件驿站"
      cancel-text="取消"
      close-on-click-action
      round
      @select="onPickStation"
    />

    <!-- 目的地选择：点击列表 -->
    <van-action-sheet
      v-model:show="showTower"
      :actions="destinationActions"
      title="选择送达目的地"
      cancel-text="取消"
      close-on-click-action
      round
      @select="onPickDestination"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import api from '../api';
import { getUser } from '../store';
import { copyText } from '../utils/copy';

const router = useRouter();
const rules = ref(null); // 费率规则
const submitting = ref(false);
const showStation = ref(false);
const showTower = ref(false);

const form = reactive({
  station: '',
  pickupCode: '',
  destination: '', // 目的地（下拉选择）
  roomNo: '', // 房间号（补充填写）
  reward: '', // 悬赏金额（可自定义，最低 1+平台费）
  contactPhone: '',
  remark: '',
});
const contactWechat = ref(''); // 管理员联系方式（付款提示）

/** 驿站点击列表（名称数组） */
const stationActions = computed(() => {
  if (!rules.value) return [];
  return (rules.value.stations || []).map((s) => ({ name: s, value: s }));
});

/** 目的地点击列表（名称数组） */
const destinationActions = computed(() => {
  if (!rules.value) return [];
  return (rules.value.destinations || []).map((d) => ({ name: d, value: d }));
});

/** 费用展示：基础 ¥1 + 平台费（常量，无需远端算费） */
const feeDetail = computed(() => {
  if (!rules.value) return null;
  const fee = Number(rules.value.platformFee) || 0;
  return {
    reward: 1 + fee,
    fee,
    detail: `最低 ×1（跑腿员）+ 平台费 ¥${fee.toFixed(2)}`,
  };
});

/** 最低悬赏金额 */
const minReward = computed(() => (feeDetail.value ? feeDetail.value.reward : 1));

/** 金额即时校验：低于最低值时提示错误 */
const rewardError = computed(() => {
  if (!form.reward) return '';
  const n = Number(form.reward);
  if (Number.isNaN(n)) return '请输入数字';
  if (n < minReward.value) return `不能低于 ¥${minReward.value.toFixed(2)}（基础¥1+平台费）`;
  return '';
});

/** 提交按钮显示金额：有合法输入显示输入值，否则最低价 */
const submitAmount = computed(() => {
  const n = Number(form.reward);
  if (!form.reward || Number.isNaN(n) || n < minReward.value) {
    return minReward.value.toFixed(2);
  }
  return n.toFixed(2);
});

const user = getUser();
const CAMPUS = user && user.campus;

function copyContact() {
  if (contactWechat.value) {
    copyText(contactWechat.value, '管理员微信');
  }
}

onMounted(async () => {
  // 普通用户看到首页即下单页；管理员进后台
  if (user && user.role === 'admin') {
    router.replace('/admin');
    return;
  }
  // 按当前用户校区拉费率规则（各校独立配置）
  const res = await api.get('/public/fee-rules', { params: { campus: CAMPUS } });
  rules.value = res.data;
  // 悬赏金额留空，由雇主自己填写（最低值见输入提示/费用框）
  // 上次填写的信息自动填入（目的地/房间号分开存）
  form.destination = localStorage.getItem('lastDestination') || '';
  form.roomNo = localStorage.getItem('lastRoomNo') || '';
  if (localStorage.getItem('lastPhone')) {
    form.contactPhone = localStorage.getItem('lastPhone');
  }
  // 管理员联系方式（红色付款提示）
  try {
    const pi = await api.get('/public/pay-info');
    contactWechat.value = pi.data.contactWechat || '';
  } catch (e) {
    /* 忽略 */
  }
});

/** 选择驿站（ActionSheet 点击项） */
function onPickStation(action) {
  form.station = action.name;
  showStation.value = false;
}

/** 选择目的地 */
function onPickDestination(action) {
  form.destination = action.name;
  showTower.value = false;
}

async function onSubmit() {
  // 防重复提交：请求进行中直接忽略（双击/连点只发一单）
  if (submitting.value) return;
  if (!form.station || !form.pickupCode || !form.destination || !form.contactPhone) {
    showToast('请填写完整取件信息');
    return;
  }
  const rewardNum = Number(form.reward);
  if (!form.reward || Number.isNaN(rewardNum) || rewardNum < minReward.value) {
    showToast(`悬赏金额不能低于 ¥${minReward.value.toFixed(2)}`);
    return;
  }
  submitting.value = true;
  try {
    const res = await api.post('/orders', {
      ...form,
      reward: rewardNum,
      deliverPlace: `${form.destination}${form.roomNo ? ` ${form.roomNo}` : ''}`,
    });
    // 记住常用信息，下次自动填入
    localStorage.setItem('lastDestination', form.destination);
    localStorage.setItem('lastRoomNo', form.roomNo || '');
    localStorage.setItem('lastPhone', form.contactPhone);
    showToast('下单成功，请付款');
    router.replace(`/pay/${res.data.orderId}`);
    // 成功后保持 submitting=true（跳转后页面已离开），避免跳转前空窗期二次提交
  } catch (err) {
    // 失败才恢复按钮，允许重试
    submitting.value = false;
  }
}
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background: var(--bg-page);
  padding-bottom: 96px; /* 底部 tabbar 高度，防遮挡 */
}

/* 顶部引导小贴士 */
.tips-card {
  margin: 12px 14px;
  padding: 14px 16px;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-light);
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.tips-icon {
  font-size: 24px;
  flex-shrink: 0;
  padding-top: 2px;
}
.tips-title {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}
.tips-desc {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

/* 付款警告条 */
.pay-warn {
  margin: 0 14px 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #c2410c;
  font-size: 13px;
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.warn-icon {
  font-size: 16px;
  flex-shrink: 0;
}
.warn-content {
  flex: 1;
}
.pay-warn:empty {
  display: none;
}

.field-icon {
  color: #059669;
  font-size: 17px;
  margin-right: 6px;
}

.form {
  margin-top: 4px;
}

/* 悬赏费说明卡 */
.reward-tip {
  margin: 0 16px 10px;
  font-size: 12px;
  color: var(--text-secondary, #64748b);
}
.fee-box {
  margin: 10px 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  border: 1px solid #bbf7d0;
}
.fee-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.fee-title {
  font-size: 13px;
  font-weight: 600;
  color: #166534;
}
.fee-badge {
  font-size: 15px;
  font-weight: 700;
  color: #059669;
}
.fee-detail {
  margin-top: 4px;
  font-size: 12px;
  color: #15803d;
  display: flex;
  flex-wrap: wrap;
}
.fee-tip {
  color: #166534;
  opacity: 0.85;
}

.submit-area {
  margin: 28px 16px;
}
.submit-btn {
  font-size: 16px !important;
  font-weight: 600 !important;
  letter-spacing: 0.5px;
}
.my-orders-link {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--van-primary-color);
  cursor: pointer;
  padding: 8px;
}
</style>
