<template>
  <div class="home-page">
    <van-nav-bar title="发布取件需求" />
    <div class="tips">
      填写快递信息，系统自动计算跑腿费。提交后扫码或加微信付款，管理员确认后即刻发布。
    </div>

    <!-- 红色提示：付款前先加管理员 -->
    <div class="pay-warn" v-if="contactWechat">
      ⚠️ 提交订单后请添加管理员({{ contactWechat }})进行付款
    </div>

    <van-form class="form">
      <van-cell-group inset title="取件信息">
        <van-field
          v-model="form.station"
          is-link
          readonly
          label="取件驿站"
          placeholder="请选择驿站"
          @click="showStation = true"
        />
        <van-field
          v-model="form.pickupCode"
          label="取件码"
          placeholder="快递短信中的取件码"
          maxlength="50"
        />
        <div class="fee-box" v-if="feeDetail">
          <div class="fee-main">
            <span>最低悬赏</span>
            <b class="fee-num">最低 ￥{{ minReward.toFixed(2) }}</b>
          </div>
          <div class="fee-detail">
            {{ feeDetail.detail }} · 雇主可自行提高悬赏金额
          </div>
        </div>
        <van-field
          v-model="form.reward"
          type="digits"
          label="悬赏金额(元)"
          :placeholder="`最低 ${minReward.toFixed(2)} 元`"
          maxlength="6"
          :error-message="rewardError"
        />

        <van-field
          v-model="form.destination"
          label="目的地"
          placeholder="请选择目的地"
          is-link
          readonly
          @click="showTower = true"
        />
        <van-field
          v-model="form.roomNo"
          label="房间号"
          placeholder="如 302（选填）"
          maxlength="10"
        />
        <van-field
          v-model="form.contactPhone"
          type="tel"
          label="联系电话"
          placeholder="跑腿员联系你用，接单时可拨"
          maxlength="11"
        />
        <van-field
          v-model="form.remark"
          label="备注"
          placeholder="选填：包裹大小、件数等"
          maxlength="100"
        />
      </van-cell-group>

      <div class="submit-area">
        <van-button
          type="primary"
          block
          round
          :loading="submitting"
          :disabled="!!rewardError"
          @click="onSubmit"
        >
          提交订单（￥{{ submitAmount }}）
        </van-button>
        <div class="my-orders-link" @click="$router.push('/orders/mine')">我的订单 →</div>
      </div>
    </van-form>

    <!-- 驿站选择：点击式列表（适配桌面鼠标，手机同样好用） -->
    <van-action-sheet
      v-model:show="showStation"
      :actions="stationActions"
      title="选择取件驿站"
      cancel-text="取消"
      close-on-click-action
      @select="onPickStation"
    />

    <!-- 目的地选择：点击列表（可滚轮滚动） -->
    <van-action-sheet
      v-model:show="showTower"
      :actions="destinationActions"
      title="选择目的地"
      cancel-text="取消"
      close-on-click-action
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

onMounted(async () => {
  // 普通用户看到首页即下单页；管理员进后台
  if (user && user.role === 'admin') {
    router.replace('/admin');
    return;
  }
  // 按当前用户校区拉费率规则（各校独立配置）
  const res = await api.get('/public/fee-rules', { params: { campus: CAMPUS } });
  rules.value = res.data;
  // 悬赏金额默认填最低值（1+平台费），雇主可自行上调
  if (!form.reward) {
    form.reward = Number((minReward.value).toFixed(2));
  }
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
  background: #f7f8fa;
  padding-bottom: 92px; /* 底部 tabbar 高度，防遮挡 */
}
.tips {
  margin: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  background: #f0faf5;
  color: #00885c;
  font-size: 13px;
}
.pay-warn {
  margin: 0 16px 12px;
  padding: 12px 16px;
  border-radius: 8px;
  background: #fff2f0;
  color: #fa3534;
  font-size: 13px;
  font-weight: 500;
}
.pay-warn:empty {
  display: none;
}
.form {
  margin-top: 8px;
}
.fee-box {
  margin: 8px 14px 16px;
  padding: 12px 16px;
  border-radius: 8px;
  background: #fff8f0;
  border: 1px solid #ffe6cc;
}
.fee-main {
  display: flex;
  justify-content: space-between;
  font-size: 15px;
  color: #333;
}
.fee-num {
  color: #fa550f;
  font-size: 18px;
}
.fee-detail {
  margin-top: 4px;
  font-size: 12px;
  color: #8a8a8a;
}
.submit-area {
  margin: 32px;
}
.my-orders-link {
  margin-top: 16px;
  text-align: center;
  font-size: 14px;
  color: #00a870;
}
</style>
