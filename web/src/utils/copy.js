/**
 * 复制工具：全局用户ID/订单号等点击复制
 */
import { showToast } from 'vant';

export function copyText(text, label = '内容') {
  const value = String(text == null ? '' : text);
  if (!value) return showToast('暂无可复制内容');
  navigator.clipboard
    .writeText(value)
    .then(() => showToast(`${label}已复制`))
    .catch(() => showToast('复制失败'));
}
