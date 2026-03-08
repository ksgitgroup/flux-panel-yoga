/**
 * 公共格式化工具函数
 * 统一替代各页面中重复的 formatFlow / formatSpeed / formatDate / barColor 等函数
 */

/** 格式化字节数为可读字符串 (B / KB / MB / GB / TB) */
export function formatFlow(bytes?: number | null, unit?: string): string {
  if (bytes == null || bytes === 0) return unit === 'hide' ? '0' : '-';
  if (bytes < 1024) return bytes.toFixed(0) + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  if (bytes < 1024 * 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  return (bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2) + ' TB';
}

/** 格式化网速 (bytes/sec → B/s / KB/s / MB/s / Gbps) */
export function formatSpeed(bytesPerSec?: number | null): string {
  if (bytesPerSec == null || bytesPerSec === 0) return '-';
  if (bytesPerSec < 1024) return bytesPerSec.toFixed(0) + ' B/s';
  if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
  if (bytesPerSec < 1024 * 1024 * 1024) return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
  return (bytesPerSec / (1024 * 1024 * 1024)).toFixed(2) + ' GB/s';
}

/** 格式化网速 (bytes/sec → bps/Kbps/Mbps/Gbps) */
export function formatSpeedBits(bytesPerSec?: number | null): string {
  if (bytesPerSec == null || bytesPerSec === 0) return '-';
  const bits = bytesPerSec * 8;
  if (bits < 1000) return bits.toFixed(0) + ' bps';
  if (bits < 1_000_000) return (bits / 1000).toFixed(1) + ' Kbps';
  if (bits < 1_000_000_000) return (bits / 1_000_000).toFixed(1) + ' Mbps';
  return (bits / 1_000_000_000).toFixed(2) + ' Gbps';
}

/** 格式化时间戳为本地时间字符串 */
export function formatDate(timestamp?: number | null): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

/** 格式化为简短日期 (MM/DD HH:mm) */
export function formatDateShort(timestamp?: number | null): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** 格式化相对时间 (几分钟前 / 几小时前 / 几天前) */
export function formatRelativeTime(timestamp?: number | null): string {
  if (!timestamp) return '-';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

/** 格式化运行时间 */
export function formatUptime(seconds?: number | null): string {
  if (seconds == null || seconds === 0) return '-';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}天 ${h}时`;
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}时 ${m}分` : `${m}分`;
}

/** 根据百分比返回 HeroUI 颜色名 */
export function barColor(v: number): 'success' | 'warning' | 'danger' {
  return v > 90 ? 'danger' : v > 75 ? 'warning' : 'success';
}

/** 根据百分比返回 Tailwind 背景色 class */
export function barColorClass(v: number): string {
  return v > 90 ? 'bg-danger' : v > 75 ? 'bg-warning' : 'bg-success';
}

/** 内存百分比计算 */
export function memPercent(used?: number | null, total?: number | null): number {
  if (!used || !total || total === 0) return 0;
  return (used / total) * 100;
}

/** 地区 → 国旗 emoji 映射 */
export const REGION_FLAGS: Record<string, string> = {
  '中国大陆': '🇨🇳', '香港': '🇭🇰', '台湾': '🇹🇼', '日本': '🇯🇵', '新加坡': '🇸🇬',
  '韩国': '🇰🇷', '美国': '🇺🇸', '英国': '🇬🇧', '德国': '🇩🇪', '法国': '🇫🇷',
  '荷兰': '🇳🇱', '加拿大': '🇨🇦', '澳大利亚': '🇦🇺', '印度': '🇮🇳', '俄罗斯': '🇷🇺',
  '土耳其': '🇹🇷', '巴西': '🇧🇷', '马来西亚': '🇲🇾', '泰国': '🇹🇭', '越南': '🇻🇳',
  '菲律宾': '🇵🇭', '印度尼西亚': '🇮🇩', '阿根廷': '🇦🇷', '南非': '🇿🇦', '波兰': '🇵🇱',
  '瑞典': '🇸🇪', '瑞士': '🇨🇭', '爱尔兰': '🇮🇪', '意大利': '🇮🇹', '西班牙': '🇪🇸',
  '罗马尼亚': '🇷🇴', '卢森堡': '🇱🇺',
};

/** 获取地区对应的国旗 emoji */
export function getRegionFlag(region?: string | null): string {
  return region ? (REGION_FLAGS[region] || '') : '';
}
