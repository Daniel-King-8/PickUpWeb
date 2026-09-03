#!/usr/bin/env bash
# ============================================
# 取个件呗 Web 版 —— 全链路冒烟测试
# 用法：bash scripts/smoke-test.sh [BASE_URL]（默认 http://localhost:3000）
# ============================================
BASE="${1:-http://localhost:3000}"
PASS=0; FAIL=0

step() { echo; echo "=== $1 ==="; }
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

json() { python -c "import sys,json;print(json.load(sys.stdin)$1)" 2>/dev/null; }

step "1. 注册雇主 u1"
R=$(curl -s -X POST $BASE/api/users/register -H 'Content-Type: application/json' -d '{"username":"u1test","password":"test123456","phone":"13800000001"}')
T1=$(echo "$R" | json "['data']['token']")
[ -n "$T1" ] && ok "雇主 token 获取" || bad "注册失败: $R"

step "2. 注册跑腿员 u2"
R=$(curl -s -X POST $BASE/api/users/register -H 'Content-Type: application/json' -d '{"username":"u2test","password":"test123456","phone":"13800000002"}')
T2=$(echo "$R" | json "['data']['token']")
[ -n "$T2" ] && ok "跑腿员 token 获取" || bad "注册失败: $R"

step "3. u1 下单（菜鸟驿站 + 8号楼）"
R=$(curl -s -X POST $BASE/api/orders -H "Authorization: Bearer $T1" -H 'Content-Type: application/json' \
  -d '{"station":"菜鸟驿站","pickupCode":"8-8-8","deliverPlace":"8号楼 302","contactPhone":"13800000001"}')
OID=$(echo "$R" | json "['data']['orderId']")
[ -n "$OID" ] && ok "下单成功 orderId=$OID (跑腿费应=¥2.5: 基础2+楼栋0.5)" || bad "下单失败: $R"

step "4. u1 上传付款截图"
R=$(curl -s -X POST $BASE/api/orders/$OID/pay-upload -H "Authorization: Bearer $T1" \
  -F "file=@server/package.json;filename=shot.png")
SC=$(echo "$R" | json "['data']['screenshot']")
[ -n "$SC" ] && ok "截图上传成功 $SC" || bad "上传失败: $R"

step "5. admin 核对并标记已支付"
R=$(curl -s -X POST $BASE/api/users/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123456"}')
TA=$(echo "$R" | json "['data']['token']")
R=$(curl -s -X POST $BASE/api/admin/orders/$OID/mark-paid -H "Authorization: Bearer $TA")
echo "$R" | grep -q '"success":true' && ok "标记已支付" || bad "标记失败: $R"

step "6. u2 查看大厅（取件码应脱敏 ******）"
R=$(curl -s $BASE/api/orders/hall -H "Authorization: Bearer $T2")
echo "$R" | grep -q '******' && ok "大厅取件码已脱敏" || bad "脱敏异常: $(echo $R|head -c 150)"

step "7. u2 抢单"
R=$(curl -s -X POST $BASE/api/orders/$OID/accept -H "Authorization: Bearer $T2")
echo "$R" | grep -q '"success":true' && ok "抢单成功" || bad "抢单失败: $R"

step "8. u2 查看详情（取件码应明文 8-8-8）"
R=$(curl -s $BASE/api/orders/$OID -H "Authorization: Bearer $T2")
echo "$R" | grep -q '8-8-8' && ok "抢单后取件码可见" || bad "取件码不可见: $R"

step "9. u2 送达（上传照片）"
R=$(curl -s -X POST $BASE/api/orders/$OID/deliver -H "Authorization: Bearer $T2" \
  -F "file=@server/package.json;filename=delivery.png")
echo "$R" | grep -q '"success":true' && ok "送达成功" || bad "送达失败: $R"

step "10. u1 确认收货"
R=$(curl -s -X POST $BASE/api/orders/$OID/confirm -H "Authorization: Bearer $T1")
echo "$R" | grep -q '"success":true' && ok "确认收货成功" || bad "确认失败: $R"

step "11. admin 生成本日结算单"
R=$(curl -s -X POST $BASE/api/admin/settlements/generate -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{}')
echo "$R" | grep -q '"count":1' && ok "结算单生成（1 张）" || bad "结算生成异常: $R"

echo
echo "========================================"
echo " 测试结果：通过 $PASS / 失败 $FAIL"
echo "========================================"
[ $FAIL -eq 0 ] && exit 0 || exit 1
