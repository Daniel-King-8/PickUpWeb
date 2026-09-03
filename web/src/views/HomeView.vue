<template>
  <div class="home-page">
    <van-nav-bar title="发布取件需求" />
    <div class="tips">
      填写快递信息，系统自动计算跑腿费。提交后扫码或加微信付款，管理员确认后即刻发布。
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
            <span>跑腿费</span>
            <b class="fee-num">￥{{ feeDetail.reward.toFixed(2) }}</b>
          </div>
          <div class="fee-detail">
            {{ feeDetail.detail }} · 到店付款时平台收服务费 ￥{{ feeDetail.fee.toFixed(2) }}
          </div>
        </div>

        <van-field
          v-model="form.deliverPlace"
          label="送达地址"
          placeholder="如：3号楼 302（带楼号）"
          maxlength="100"
          is-link
          readonly
          @click="showTower = true"
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
        <van-button type="primary" block round :loading="submitting" @click="onSubmit">
          提交订单（￥{{ feeDetail ? feeDetail.reward.toFixed(2) : '--' }}）
        </van-button>
        <div class="my-orders-link" @click="$router.push('/orders/mine')">我的订单 →</div>
      </div>
    </van-form>

    <!-- 驿站选择 -->
    <van-popup v-model:show="showStation" position="bottom" round>
      <van-picker
        :columns="stationColumns"
        @confirm="onPickStation"
        @cancel="showStation = false"
        title="选择取件驿站"
      />
    </van-popup>

    <!-- 送达地址选择（楼栋快捷输入） -->
    <van-popup v-model:show="showTower" position="bottom" round>
      <van-picker
        :columns="towerColumns"
        @confirm="onPickTower"
        @cancel="showTower = false"
        title="选择送达楼栋（房间号可稍后修改）"
      />
    </van-popup>
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
const feeDetail = ref(null); // 实时算费结果
const submitting = ref(false);
const showStation = ref(false);
const showTower = ref(false);

const form = reactive({
  station: '',
  pickupCode: '',
  deliverPlace: '',
  contactPhone: '',
  remark: '',
});

/** 驿站下拉列 */
const stationColumns = computed(() => {
  if (!rules.value) return [];
  return Object.keys(rules.value.stations).map((s) => ({ text: s, value: s }));
});

/** 楼栋快捷列（1-30 楼） */
const towerColumns = computed(() => {
  const max = rules.value ? Math.max(...rules.value.towerRules.map((t) => t.to)) : 30;
  const list = [];
  for (let i = 1; i <= max; i += 1) {
    list.push({ text: `${i}号楼`, value: i });
  }
  return list;
});

onMounted(async () => {
  const user = getUser();
  // 普通用户看到首页即下单页；管理员进后台
  if (user && user.role === 'admin') {
    router.replace('/admin');
    return;
  }
  const res = await api.get('/public/fee-rules');
  rules.value = res.data;
  if (localStorage.getItem('lastDeliverPlace')) {
    form.deliverPlace = localStorage.getItem('lastDeliverPlace');
  }
  if (localStorage.getItem('lastPhone')) {
    form.contactPhone = localStorage.getItem('lastPhone');
  }
});

/** 实时算费（驿站 + 送达地都填了才请求） */
async function refreshFee() {
  if (!form.station || !form.deliverPlace) {
    feeDetail.value = null;
    return;
  }
  const res = await api.get('/public/fee', {
    params: { station: form.station, deliverPlace: form.deliverPlace },
  });
  feeDetail.value = res.data;
}

function onPickStation({ selectedValues }) {
  form.station = selectedValues[0];
  showStation.value = false;
  refreshFee();
}

function onPickTower({ selectedValues }) {
  const no = selectedValues[0];
  // 保留用户已填的房间号：'3号楼' + 已有房间号
  const match = form.deliverPlace.match(/\d+号楼\s*(\d+)?/);
  const room = match && match[1] ? match[1] : '';
  form.deliverPlace = room ? `${no}号楼 ${room}` : `${no}号楼`;
  showTower.value = false;
  refreshFee();
}

async function onSubmit() {
  if (!form.station || !form.pickupCode || !form.deliverPlace || !form.contactPhone) {
    showToast('请填写完整取件信息');
    return;
  }
  submitting.value = true;
  try {
    const res = await api.post('/orders', form);
    // 记住常用信息，下次自动填入
    localStorage.setItem('lastDeliverPlace', form.deliverPlace);
    localStorage.setItem('lastPhone', form.contactPhone);
    showToast('下单成功，请付款');
    router.replace(`/pay/${res.data.orderId}`);
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background: #f7f8fa;
  padding-bottom: 40px;
}
.tips {
  margin: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  background: #f0faf5;
  color: #00885c;
  font-size: 13px;
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
