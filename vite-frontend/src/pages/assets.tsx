import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure
} from "@heroui/modal";
import { Spinner } from "@heroui/spinner";
import { Switch } from "@heroui/switch";
import { Accordion, AccordionItem } from "@heroui/accordion";
import { Tabs, Tab } from "@heroui/tabs";
import { Progress } from "@heroui/progress";
import { DatePicker } from "@heroui/date-picker";
import { JwtUtil } from "@/utils/jwt";
import { Autocomplete, AutocompleteItem } from "@heroui/autocomplete";
import { parseDate } from "@internationalized/date";
import toast from 'react-hot-toast';

import {
  AssetHost,
  AssetHostDetail,
  MonitorInstance,
  MonitorNodeSnapshot,
  OnePanelBootstrap,
  XuiInstance,
  createAsset,
  createOnePanelInstance,
  deleteAsset,
  deleteOnePanelInstance,
  deleteMonitorNode,
  getAssetDetail,
  getAssetList,
  getMonitorList,
  createXuiInstance,
  provisionAllAgents,
  ProvisionAllResult,
  rotateOnePanelToken,
  syncMonitorInstance,
  getMonitorNodeStatus,
  updateAsset,
  batchUpdateAsset,
  geolocateIp,
  getNodeList,
  createNode,
  getNodeInstallCommand,
  jumpServerConnect,
  getJumpServerStatus,
  jumpServerMatchByIp,
  archiveAsset,
  restoreAsset,
  getArchivedAssets,
  getAlertingAssetIds,
  getAlertsForAsset,
  acknowledgeAlert,
  getAllActiveAlertsBrief,
  createForward,
  getTunnelList
} from '@/api';
import { hasPermission } from '@/utils/auth';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface AssetForm {
  id?: number;
  name: string;
  label: string;
  primaryIp: string;
  ipv6: string;
  environment: string;
  provider: string;
  region: string;
  role: string;
  os: string;
  osCategory: string;
  cpuCores: string;
  memTotalMb: string;
  diskTotalGb: string;
  bandwidthMbps: string;
  monthlyTrafficGb: string;
  sshPort: string;
  purchaseDate: string;
  expireDate: string;
  monthlyCost: string;
  currency: string;
  billingCycle: string;
  tags: string;
  monitorNodeUuid: string;
  pikaNodeId: string;
  cpuName: string;
  arch: string;
  virtualization: string;
  kernelVersion: string;
  gpuName: string;
  swapTotalMb: string;
  purpose: string;
  remark: string;
  panelUrl: string;
  jumpserverAssetId: string;
  gostNodeId: string;
}

const emptyForm = (): AssetForm => ({
  name: '', label: '', primaryIp: '', ipv6: '', environment: '', provider: '', region: '',
  role: '', os: '', osCategory: '', cpuCores: '', memTotalMb: '', diskTotalGb: '', bandwidthMbps: '',
  monthlyTrafficGb: '', sshPort: '', purchaseDate: '', expireDate: '', monthlyCost: '',
  currency: 'CNY', billingCycle: '', tags: '', monitorNodeUuid: '', pikaNodeId: '', cpuName: '', arch: '', virtualization: '',
  kernelVersion: '', gpuName: '', swapTotalMb: '', purpose: '', remark: '', panelUrl: '', jumpserverAssetId: '', gostNodeId: '',
});

const ROLES = [
  { key: '', label: '未指定' },
  { key: 'entry', label: '入口' },
  { key: 'relay', label: '中转' },
  { key: 'landing', label: '落地' },
  { key: 'standalone', label: '独立' },
];

const CURRENCIES = [
  { key: 'CNY', label: '¥ CNY', symbol: '¥' },
  { key: 'USD', label: '$ USD', symbol: '$' },
  { key: 'EUR', label: '€ EUR', symbol: '€' },
  { key: 'GBP', label: '£ GBP', symbol: '£' },
  { key: 'JPY', label: '¥ JPY', symbol: '¥' },
  { key: 'HKD', label: 'HK$ HKD', symbol: 'HK$' },
  { key: 'TWD', label: 'NT$ TWD', symbol: 'NT$' },
  { key: 'KRW', label: '₩ KRW', symbol: '₩' },
  { key: 'RUB', label: '₽ RUB', symbol: '₽' },
  { key: 'CAD', label: 'C$ CAD', symbol: 'C$' },
  { key: 'AUD', label: 'A$ AUD', symbol: 'A$' },
  { key: 'SGD', label: 'S$ SGD', symbol: 'S$' },
  { key: 'MYR', label: 'RM MYR', symbol: 'RM' },
  { key: 'THB', label: '฿ THB', symbol: '฿' },
  { key: 'INR', label: '₹ INR', symbol: '₹' },
  { key: 'TRY', label: '₺ TRY', symbol: '₺' },
  { key: 'BRL', label: 'R$ BRL', symbol: 'R$' },
];

/** Get currency symbol */
const getCurrencySymbol = (code: string): string => {
  return CURRENCIES.find(c => c.key === code)?.symbol || code;
};

const OS_CATEGORIES = [
  { key: '', label: '未指定' },
  { key: 'Ubuntu', label: 'Ubuntu' },
  { key: 'Debian', label: 'Debian' },
  { key: 'CentOS', label: 'CentOS' },
  { key: 'AlmaLinux', label: 'AlmaLinux' },
  { key: 'Rocky', label: 'Rocky' },
  { key: 'Fedora', label: 'Fedora' },
  { key: 'Alpine', label: 'Alpine' },
  { key: 'Arch', label: 'Arch' },
  { key: 'Windows', label: 'Windows' },
  { key: 'MacOS', label: 'MacOS' },
  { key: 'FreeBSD', label: 'FreeBSD' },
  { key: 'Other', label: 'Other' },
];

const PROVIDERS = [
  { key: '', label: '未指定' },
  { key: 'DMIT', label: 'DMIT' },
  { key: 'Vultr', label: 'Vultr' },
  { key: 'BandwagonHost', label: 'BandwagonHost' },
  { key: 'RackNerd', label: 'RackNerd' },
  { key: 'DigitalOcean', label: 'DigitalOcean' },
  { key: 'Linode', label: 'Linode' },
  { key: 'AWS', label: 'AWS' },
  { key: 'Azure', label: 'Azure' },
  { key: 'GCP', label: 'GCP' },
  { key: 'Oracle', label: 'Oracle' },
  { key: 'Hetzner', label: 'Hetzner' },
  { key: 'OVH', label: 'OVH' },
  { key: 'Contabo', label: 'Contabo' },
  { key: 'CloudCone', label: 'CloudCone' },
  { key: 'HostHatch', label: 'HostHatch' },
  { key: 'AlphaVPS', label: 'AlphaVPS' },
  { key: 'GreenCloud', label: 'GreenCloud' },
  { key: 'V.PS', label: 'V.PS' },
  { key: 'Kurun', label: 'Kurun' },
  { key: 'Akile', label: 'Akile' },
  { key: 'NexTab', label: 'NexTab' },
  { key: '腾讯云', label: '腾讯云' },
  { key: '阿里云', label: '阿里云' },
  { key: '华为云', label: '华为云' },
];

const ENVIRONMENTS = [
  { key: '', label: '未指定' },
  { key: '生产', label: '生产' },
  { key: '测试', label: '测试' },
  { key: '预发布', label: '预发布' },
  { key: '开发', label: '开发' },
  { key: '灾备', label: '灾备' },
  { key: '演示', label: '演示' },
];

const REGIONS = [
  { key: '', label: '未指定', flag: '' },
  { key: '中国大陆', label: '中国大陆', flag: '🇨🇳' },
  { key: '香港', label: '香港', flag: '🇭🇰' },
  { key: '台湾', label: '台湾', flag: '🇹🇼' },
  { key: '日本', label: '日本', flag: '🇯🇵' },
  { key: '新加坡', label: '新加坡', flag: '🇸🇬' },
  { key: '韩国', label: '韩国', flag: '🇰🇷' },
  { key: '美国', label: '美国', flag: '🇺🇸' },
  { key: '英国', label: '英国', flag: '🇬🇧' },
  { key: '德国', label: '德国', flag: '🇩🇪' },
  { key: '法国', label: '法国', flag: '🇫🇷' },
  { key: '荷兰', label: '荷兰', flag: '🇳🇱' },
  { key: '加拿大', label: '加拿大', flag: '🇨🇦' },
  { key: '澳大利亚', label: '澳大利亚', flag: '🇦🇺' },
  { key: '印度', label: '印度', flag: '🇮🇳' },
  { key: '俄罗斯', label: '俄罗斯', flag: '🇷🇺' },
  { key: '土耳其', label: '土耳其', flag: '🇹🇷' },
  { key: '巴西', label: '巴西', flag: '🇧🇷' },
  { key: '马来西亚', label: '马来西亚', flag: '🇲🇾' },
  { key: '泰国', label: '泰国', flag: '🇹🇭' },
  { key: '越南', label: '越南', flag: '🇻🇳' },
  { key: '菲律宾', label: '菲律宾', flag: '🇵🇭' },
  { key: '印度尼西亚', label: '印度尼西亚', flag: '🇮🇩' },
  { key: '阿根廷', label: '阿根廷', flag: '🇦🇷' },
  { key: '南非', label: '南非', flag: '🇿🇦' },
  { key: '波兰', label: '波兰', flag: '🇵🇱' },
  { key: '瑞典', label: '瑞典', flag: '🇸🇪' },
  { key: '瑞士', label: '瑞士', flag: '🇨🇭' },
  { key: '爱尔兰', label: '爱尔兰', flag: '🇮🇪' },
  { key: '意大利', label: '意大利', flag: '🇮🇹' },
  { key: '西班牙', label: '西班牙', flag: '🇪🇸' },
  { key: '罗马尼亚', label: '罗马尼亚', flag: '🇷🇴' },
  { key: '卢森堡', label: '卢森堡', flag: '🇱🇺' },
];

/** ip-api.com 返回的国家名 → REGIONS key 映射 */
const COUNTRY_TO_REGION: Record<string, string> = {
  '中国': '中国大陆',
  'China': '中国大陆',
  '香港': '香港',
  'Hong Kong': '香港',
  '台湾': '台湾',
  'Taiwan': '台湾',
  '日本': '日本',
  'Japan': '日本',
  '新加坡': '新加坡',
  'Singapore': '新加坡',
  '韩国': '韩国',
  'South Korea': '韩国',
  '美国': '美国',
  'United States': '美国',
  '英国': '英国',
  'United Kingdom': '英国',
  '德国': '德国',
  'Germany': '德国',
  '法国': '法国',
  'France': '法国',
  '荷兰': '荷兰',
  'Netherlands': '荷兰',
  '加拿大': '加拿大',
  'Canada': '加拿大',
  '澳大利亚': '澳大利亚',
  'Australia': '澳大利亚',
  '印度': '印度',
  'India': '印度',
  '俄罗斯': '俄罗斯',
  'Russia': '俄罗斯',
  '土耳其': '土耳其',
  'Turkey': '土耳其',
  'Türkiye': '土耳其',
  '巴西': '巴西',
  'Brazil': '巴西',
  '马来西亚': '马来西亚',
  'Malaysia': '马来西亚',
  '泰国': '泰国',
  'Thailand': '泰国',
  '越南': '越南',
  'Vietnam': '越南',
  '菲律宾': '菲律宾',
  'Philippines': '菲律宾',
  '印度尼西亚': '印度尼西亚',
  'Indonesia': '印度尼西亚',
  '阿根廷': '阿根廷',
  'Argentina': '阿根廷',
  '南非': '南非',
  'South Africa': '南非',
  '波兰': '波兰',
  'Poland': '波兰',
  '瑞典': '瑞典',
  'Sweden': '瑞典',
  '瑞士': '瑞士',
  'Switzerland': '瑞士',
  '爱尔兰': '爱尔兰',
  'Ireland': '爱尔兰',
  '意大利': '意大利',
  'Italy': '意大利',
  '西班牙': '西班牙',
  'Spain': '西班牙',
  '罗马尼亚': '罗马尼亚',
  'Romania': '罗马尼亚',
  '卢森堡': '卢森堡',
  'Luxembourg': '卢森堡',
};

const BILLING_CYCLES = [
  { key: '', label: '未知' },
  { key: '0', label: '无需付费' },
  { key: '30', label: '月付' },
  { key: '90', label: '季付' },
  { key: '180', label: '半年付' },
  { key: '365', label: '年付' },
  { key: '730', label: '两年付' },
  { key: '1095', label: '三年付' },
];

// ==================== Alert Snooze (per-user, localStorage) ====================
// Key format: alert_snooze_{userId}, value: { "ruleId:nodeId": snoozeUntilTs, ... }
const getSnoozeKey = () => {
  const uid = JwtUtil.getUserIdFromToken();
  return `alert_snooze_${uid || 'anon'}`;
};
const getSnoozeMap = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(getSnoozeKey()) || '{}'); } catch { return {}; }
};
const setSnoozeMap = (m: Record<string, number>) => {
  localStorage.setItem(getSnoozeKey(), JSON.stringify(m));
};
const snoozeKey = (ruleId: number, nodeId: number) => `${ruleId}:${nodeId}`;
const isSnoozed = (ruleId: number, nodeId: number): number | null => {
  const m = getSnoozeMap();
  const until = m[snoozeKey(ruleId, nodeId)];
  if (until && until > Date.now()) return until;
  return null;
};
const snoozeAlerts = (items: { ruleId: number; nodeId: number }[], days: number) => {
  const m = getSnoozeMap();
  const until = Date.now() + days * 24 * 60 * 60 * 1000;
  items.forEach(({ ruleId, nodeId }) => { m[snoozeKey(ruleId, nodeId)] = until; });
  setSnoozeMap(m);
};
const unsnoozeAlert = (ruleId: number, nodeId: number) => {
  const m = getSnoozeMap();
  delete m[snoozeKey(ruleId, nodeId)];
  setSnoozeMap(m);
};

// Format alert duration from firstLogTime to now
const formatAlertDuration = (firstLogTime?: number): string => {
  if (!firstLogTime) return '';
  const diffMs = Date.now() - firstLogTime;
  if (diffMs < 60000) return '刚刚';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `持续 ${mins} 分钟`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `持续 ${hours} 小时 ${mins % 60} 分钟`;
  const days = Math.floor(hours / 24);
  return `持续 ${days} 天 ${hours % 24} 小时`;
};

// Provision form for new server creation within provision modal
interface ProvisionForm {
  osPlatform: 'linux' | 'windows' | 'macos';
  osArch: 'amd64' | 'arm64';
  primaryIp: string;
  provider: string;
  region: string;
  purchaseDate: string;
  expireDate: string;
  neverExpire: boolean;
  billingCycle: string;
  monthlyCost: string;
  currency: string;
  bandwidthMbps: string;
  monthlyTrafficGb: string;
  trafficUnlimited: boolean;
  trafficUnit: 'GB' | 'TB';
  purpose: string;
  tags: string;
  remark: string;
}
const OS_PLATFORMS = [
  { key: 'linux', label: 'Linux' },
  { key: 'windows', label: 'Windows' },
  { key: 'macos', label: 'macOS' },
];
const OS_ARCHS = [
  { key: 'amd64', label: 'x86_64' },
  { key: 'arm64', label: 'ARM64' },
];

const emptyProvisionForm = (): ProvisionForm => ({
  osPlatform: 'linux', osArch: 'amd64', primaryIp: '', provider: '', region: '',
  purchaseDate: new Date().toISOString().split('T')[0], // default to today
  expireDate: '', neverExpire: false, billingCycle: '', monthlyCost: '', currency: 'CNY',
  bandwidthMbps: '', monthlyTrafficGb: '', trafficUnlimited: false, trafficUnit: 'GB',
  purpose: '', tags: '', remark: '',
});

/** Check if provision form has any user input (for unsaved changes warning) */
const isProvisionFormDirty = (f: ProvisionForm, name: string) =>
  !!(name || f.primaryIp || f.provider || f.purchaseDate || f.expireDate || f.monthlyCost || f.bandwidthMbps || f.monthlyTrafficGb || f.purpose || f.tags || f.remark);

/** Calculate daily cost and yearly cost from billing cycle + price */
const calcCostBreakdown = (monthlyCost: string, billingCycle: string, currency: string) => {
  const price = parseFloat(monthlyCost);
  const days = parseInt(billingCycle);
  if (isNaN(price) || price <= 0 || isNaN(days) || days <= 0) return null;
  const dailyCost = price / days;
  const yearlyCost = dailyCost * 365;
  return { dailyCost: dailyCost.toFixed(2), yearlyCost: yearlyCost.toFixed(2), currency: currency || '' };
};

const getRegionFlag = (region?: string | null) => {
  if (!region) return '';
  const match = REGIONS.find(r => r.key === region);
  return match?.flag || '';
};

const formatBillingCycle = (days?: number | null) => {
  if (days === null || days === undefined) return '';
  if (days === 0) return '无需付费';
  if (days >= 27 && days <= 32) return '月付';
  if (days >= 87 && days <= 95) return '季付';
  if (days >= 175 && days <= 185) return '半年付';
  if (days >= 360 && days <= 370) return '年付';
  if (days >= 720 && days <= 750) return '两年付';
  if (days >= 1080 && days <= 1150) return '三年付';
  return `${days}天`;
};

/** Calculate remaining value: (remaining days / billing cycle days) * price. expireDate=-1 means never expire. */
const calcRemainingValue = (expireDate?: number | null, monthlyCost?: string | null, billingCycle?: number | null, currency?: string | null) => {
  if (!expireDate || !monthlyCost || !billingCycle || billingCycle <= 0) return null;
  if (expireDate === -1) return { remainingDays: Infinity, remainingValue: '∞', currency: currency || '' };
  const price = parseFloat(monthlyCost);
  if (isNaN(price) || price <= 0) return null;
  const remainingDays = Math.max(0, Math.ceil((expireDate - Date.now()) / 86400000));
  const remainingValue = (remainingDays / billingCycle) * price;
  return { remainingDays, remainingValue: remainingValue.toFixed(2), currency: currency || '' };
};

const normalizeKeyword = (value?: string | null) => (value || '').trim().toLowerCase();

const NEVER_EXPIRE_THRESHOLD = 4102444800000; // year ~2100
const isNeverExpireTs = (ts?: number | null): boolean => ts === -1 || (ts != null && ts > NEVER_EXPIRE_THRESHOLD);

const billingCycleLabel = (days?: number | null) => {
  if (!days) return '';
  if (days <= 31) return '月付';
  if (days <= 92) return '季付';
  if (days <= 183) return '半年付';
  if (days <= 366) return '年付';
  if (days <= 732) return '两年付';
  if (days <= 1098) return '三年付';
  return `${days}天`;
};

const formatDateShort = (timestamp?: number | null) => {
  if (!timestamp) return '-';
  if (isNeverExpireTs(timestamp)) return '永不到期';
  return new Date(timestamp).toLocaleDateString();
};

const formatFlow = (value?: number | null) => {
  const bytes = value || 0;
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatSpeed = (bytesPerSec?: number | null) => {
  const bytes = bytesPerSec || 0;
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
};

const formatUptime = (seconds?: number | null) => {
  if (!seconds) return '-';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}天 ${h}时`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}时 ${m}分`;
};

const tsToDateInput = (ts?: number | null) => {
  if (!ts) return '';
  return new Date(ts).toISOString().split('T')[0];
};

const dateInputToTs = (value: string) => {
  if (!value) return undefined;
  return new Date(value + 'T00:00:00').getTime();
};

const getStatusChip = (status?: string | null) => {
  switch (status) {
    case 'success': return { color: 'success' as const, text: '正常' };
    case 'failed': return { color: 'danger' as const, text: '异常' };
    default: return { color: 'default' as const, text: '-' };
  }
};

const getRoleChip = (role?: string | null) => {
  switch (role) {
    case 'entry': return { color: 'primary' as const, text: '入口' };
    case 'relay': return { color: 'warning' as const, text: '中转' };
    case 'landing': return { color: 'success' as const, text: '落地' };
    case 'standalone': return { color: 'secondary' as const, text: '独立' };
    default: return null;
  }
};

const buildInstanceAddress = (instance: Pick<XuiInstance, 'baseUrl' | 'webBasePath'>) =>
  `${instance.baseUrl}${instance.webBasePath || '/'}`;

/* Compact resource bar - inspired by Pika's design */
const ResourceBar = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="flex items-center gap-2 h-5 text-xs font-mono">
    <span className="w-8 text-[11px] font-bold tracking-wider opacity-70 flex-shrink-0">{label}</span>
    <div className="w-[90px] h-2 bg-default-200 dark:bg-default-100 relative overflow-hidden rounded-sm flex-shrink-0">
      <div
        className={`h-full transition-all duration-500 ease-out rounded-sm ${color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
    <span className={`w-10 text-right text-xs font-medium ${
      value > 90 ? 'text-danger' : value > 75 ? 'text-warning' : 'text-default-600'
    }`}>{value.toFixed(0)}%</span>
  </div>
);

const barColorClass = (v: number) =>
  v > 90 ? 'bg-danger' : v > 75 ? 'bg-warning' : 'bg-success';

const barColorHero = (v: number): 'danger' | 'warning' | 'success' =>
  v > 90 ? 'danger' : v > 75 ? 'warning' : 'success';

export default function AssetsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canViewAssets = hasPermission('asset.read');
  const canCreateAssets = hasPermission('asset.create');
  const canUpdateAssets = hasPermission('asset.update');
  const canDeleteAssets = hasPermission('asset.delete');
  const canManageXui = hasPermission('xui.create');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assets, setAssets] = useState<AssetHost[]>([]);
  const [expandedAssetId, setExpandedAssetId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AssetHostDetail | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [form, setForm] = useState<AssetForm>(emptyForm());
  const formSnapshotRef = useRef<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [isEdit, setIsEdit] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<AssetHost | null>(null);
  const [monitorInstances, setMonitorInstances] = useState<MonitorInstance[]>([]);
  const [provisionStep, setProvisionStep] = useState<'select' | 'result'>('select');
  const [provisionName, setProvisionName] = useState('');
  const [provisionLoading, setProvisionLoading] = useState(false);
  // Unified multi-agent provision state
  const [provisionKomariEnabled, setProvisionKomariEnabled] = useState(false);
  const [provisionPikaEnabled, setProvisionPikaEnabled] = useState(false);
  const [provisionGostEnabled, setProvisionGostEnabled] = useState(false);
  const [provisionKomariId, setProvisionKomariId] = useState<string>('');
  const [provisionPikaId, setProvisionPikaId] = useState<string>('');
  const [provisionGostPortSta, setProvisionGostPortSta] = useState('10000');
  const [provisionGostPortEnd, setProvisionGostPortEnd] = useState('20000');
  // Context when provisioning from an existing asset
  const [provisionContext, setProvisionContext] = useState<{ assetId: number; assetName: string; assetIp?: string; asset?: AssetHost; missingKomari?: boolean; missingPika?: boolean; missingGost?: boolean } | null>(null);
  const [provisionForm, setProvisionForm] = useState<ProvisionForm>(emptyProvisionForm());
  const [provisionFormErrors, setProvisionFormErrors] = useState<Record<string, string>>({});
  const [provisionSyncLoading, setProvisionSyncLoading] = useState(false);
  const [allProvisionResult, setAllProvisionResult] = useState<ProvisionAllResult | null>(null);
  const [provisionNodeVerified, setProvisionNodeVerified] = useState(false);
  const [provisionNodeStatus, setProvisionNodeStatus] = useState<string>('');
  const [provisionCmdRegion, setProvisionCmdRegion] = useState<'overseas' | 'cn'>('cn');
  const [filterRole, setFilterRole] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<string>('');
  const [filterProbe, setFilterProbe] = useState<string>('');
  const [filterRegion, setFilterRegion] = useState<string>('');
  const [filterOs, setFilterOs] = useState<string>('');
  const [filterProvider, setFilterProvider] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterEnv, setFilterEnv] = useState<string>('');
  const [filterPurpose, setFilterPurpose] = useState<'all' | 'filled' | 'empty'>('all');
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [filterAlertStatus, setFilterAlertStatus] = useState<string>(''); // '' | 'alerting' | 'healthy'
  const [activeAlertNodeIds, setActiveAlertNodeIds] = useState<Set<number>>(new Set());
  // Bulk alert brief data for snooze-aware filtering
  const [allAlertsBrief, setAllAlertsBrief] = useState<{assetId: number; ruleId: number; nodeId: number; severity: string}[]>([]);
  const [alertPopoverAssetId, setAlertPopoverAssetId] = useState<number | null>(null);
  const [alertPopoverName, setAlertPopoverName] = useState('');
  const [alertPopoverData, setAlertPopoverData] = useState<any[]>([]);
  const [alertPopoverLoading, setAlertPopoverLoading] = useState(false);
  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const [snoozeDays, setSnoozeDays] = useState(7);
  const [snoozeChecked, setSnoozeChecked] = useState<Set<string>>(new Set()); // "ruleId:nodeId"
  const [, forceRender] = useState(0); // trigger re-render after snooze change
  const [sortKey, setSortKey] = useState<'name' | 'cpu' | 'mem' | 'traffic' | 'expiry' | 'cost'>('name');
  const [sortAsc, setSortAsc] = useState(true);

  // Recycle bin (archived assets)
  const [showArchived, setShowArchived] = useState(false);
  const [archivedAssets, setArchivedAssets] = useState<AssetHost[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);

  // XUI inline binding form
  const [xuiBindOpen, setXuiBindOpen] = useState(false);
  const [xuiBindForm, setXuiBindForm] = useState({ addr: '', user: '', pass: '' });
  const [xuiBindLoading, setXuiBindLoading] = useState(false);
  // 1Panel inline binding
  const [panelBindOpen, setPanelBindOpen] = useState(false);
  const [panelBindInput, setPanelBindInput] = useState('');
  const [onePanelActionLoading, setOnePanelActionLoading] = useState(false);
  const [onePanelBootstrap, setOnePanelBootstrap] = useState<OnePanelBootstrap | null>(null);
  const [onePanelBootstrapOpen, setOnePanelBootstrapOpen] = useState(false);
  // GOST node binding
  const [gostNodes, setGostNodes] = useState<{ id: number; name: string; ip: string; status: number }[]>([]);
  const [gostBindOpen, setGostBindOpen] = useState(false);
  const [gostCreateForm, setGostCreateForm] = useState({ name: '', ip: '', portSta: '10000', portEnd: '20000' });
  const [gostCreateLoading, setGostCreateLoading] = useState(false);
  const [gostInstallCmd, setGostInstallCmd] = useState<string | null>(null);
  // JumpServer
  const [jsEnabled, setJsEnabled] = useState(false);
  const [jsUrl, setJsUrl] = useState('');
  const [jsConnecting, setJsConnecting] = useState(false);
  const [jsBindPromptOpen, setJsBindPromptOpen] = useState(false);
  // Tag input
  const [tagInput, setTagInput] = useState('');
  // Edit modal active tab
  const [editTab, setEditTab] = useState<string>('basic');
  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const { isOpen: isBatchOpen, onOpen: onBatchOpen, onClose: onBatchClose } = useDisclosure();
  const [batchField, setBatchField] = useState<string>('tags');
  const [batchValue, setBatchValue] = useState<string>('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);

  const { isOpen: isFormOpen, onOpen: onFormOpen, onClose: onFormClose } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
  const { isOpen: isProvisionOpen, onOpen: onProvisionOpen, onClose: onProvisionClose } = useDisclosure();
  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure();

  // ── 快速创建转发 ──
  const { isOpen: isQuickFwdOpen, onOpen: onQuickFwdOpen, onClose: onQuickFwdClose } = useDisclosure();
  const [quickFwdAsset, setQuickFwdAsset] = useState<AssetHost | null>(null);
  const [quickFwdTunnels, setQuickFwdTunnels] = useState<{ id: number; name: string; inNodeId: number; outNodeId?: number; type: number }[]>([]);
  const [quickFwdTunnelId, setQuickFwdTunnelId] = useState<number | null>(null);
  const [quickFwdName, setQuickFwdName] = useState('');
  const [quickFwdRemoteAddr, setQuickFwdRemoteAddr] = useState('');
  const [quickFwdLoading, setQuickFwdLoading] = useState(false);

  const openQuickForward = async (asset: AssetHost) => {
    if (!asset.gostNodeId) {
      toast.error('请先安装 GOST 节点');
      return;
    }
    setQuickFwdAsset(asset);
    setQuickFwdName(`${asset.name || 'fwd'}-${(detail?.forwards?.length ?? 0) + 1}`);
    setQuickFwdRemoteAddr('');
    setQuickFwdTunnelId(null);
    setQuickFwdLoading(false);
    // 加载隧道列表，过滤出该节点相关的隧道
    try {
      const res = await getTunnelList();
      if (res.code === 0 && Array.isArray(res.data)) {
        const matching = res.data.filter((t: any) => t.inNodeId === asset.gostNodeId || t.outNodeId === asset.gostNodeId);
        setQuickFwdTunnels(matching);
        if (matching.length === 1) setQuickFwdTunnelId(matching[0].id);
      } else {
        setQuickFwdTunnels([]);
      }
    } catch { setQuickFwdTunnels([]); }
    onQuickFwdOpen();
  };

  const submitQuickForward = async () => {
    if (!quickFwdTunnelId) { toast.error('请选择隧道'); return; }
    if (!quickFwdRemoteAddr.trim()) { toast.error('请输入目标地址'); return; }
    if (!quickFwdName.trim()) { toast.error('请输入名称'); return; }
    setQuickFwdLoading(true);
    try {
      const res = await createForward({
        name: quickFwdName.trim(),
        tunnelId: quickFwdTunnelId,
        remoteAddr: quickFwdRemoteAddr.trim(),
        strategy: 'fifo',
        remoteSourceType: 'manual',
      });
      if (res.code === 0) {
        toast.success('转发规则已创建');
        onQuickFwdClose();
        // 刷新资产详情
        if (expandedAssetId) void loadAssetDetail(expandedAssetId);
      } else {
        toast.error(res.msg || '创建失败');
      }
    } catch { toast.error('创建失败'); }
    finally { setQuickFwdLoading(false); }
  };

  // Derived: effective alerting IDs (non-snoozed) and snoozed-only IDs
  const { effectiveAlertIds, snoozedOnlyAlertIds } = useMemo(() => {
    const effective = new Set<number>();
    const allWithAlerts = new Set<number>();
    const withActiveAlerts = new Set<number>();
    for (const a of allAlertsBrief) {
      allWithAlerts.add(a.assetId);
      if (!isSnoozed(a.ruleId, a.nodeId)) {
        withActiveAlerts.add(a.assetId);
      }
    }
    // If we have brief data, use it; otherwise fall back to activeAlertNodeIds
    if (allAlertsBrief.length > 0) {
      withActiveAlerts.forEach(id => effective.add(id));
    } else {
      activeAlertNodeIds.forEach(id => effective.add(id));
    }
    const snoozedOnly = new Set<number>();
    allWithAlerts.forEach(id => {
      if (!withActiveAlerts.has(id)) snoozedOnly.add(id);
    });
    return { effectiveAlertIds: effective, snoozedOnlyAlertIds: snoozedOnly };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAlertsBrief, activeAlertNodeIds, /* forceRender triggers re-derive */]);

  useEffect(() => {
    void loadAssets(); void loadGostNodes();
    getJumpServerStatus().then(r => { if (r.code === 0 && r.data) { setJsEnabled(r.data.enabled && r.data.configured); setJsUrl(r.data.url || ''); } });
  }, []);

  // Handle URL params: ?viewId=123 opens detail, ?viewId=123&deploy=1 opens deploy
  useEffect(() => {
    if (loading || assets.length === 0) return;
    const viewId = searchParams.get('viewId');
    const urlRegion = searchParams.get('filterRegion');
    const urlOs = searchParams.get('filterOs');
    const urlTag = searchParams.get('filterTag');
    if (urlRegion) setFilterRegion(urlRegion);
    if (urlOs) setFilterOs(urlOs);
    if (urlTag) setFilterTag(urlTag);
    if (viewId) {
      const id = Number(viewId);
      const asset = assets.find(a => a.id === id);
      if (asset) {
        openDetailModal(id);
        if (searchParams.get('deploy') === '1') {
          setTimeout(() => {
            openProvisionModal({
              assetId: id, assetName: asset.name, assetIp: asset.primaryIp || undefined, asset,
              missingKomari: !asset.monitorNodeUuid, missingPika: !asset.pikaNodeId, missingGost: !asset.gostNodeId,
            });
          }, 300);
        }
      }
    }
    if (viewId || urlRegion || urlOs || urlTag) {
      setSearchParams({}, { replace: true });
    }
  }, [loading, assets]);

  useEffect(() => {
    if (!expandedAssetId) { setDetail(null); return; }
    void loadAssetDetail(expandedAssetId);
  }, [expandedAssetId]);

  // ESC to exit batch mode
  useEffect(() => {
    if (!batchMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setBatchMode(false); setSelectedIds(new Set()); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [batchMode]);

  const summary = useMemo(() => {
    const online = assets.filter(a => a.monitorOnline === 1).length;
    const hasMonitor = assets.filter(a => a.monitorNodeUuid || a.pikaNodeId).length;
    return {
      totalAssets: assets.length,
      onlineAssets: online,
      offlineAssets: hasMonitor - online,
      noMonitor: assets.length - hasMonitor,
      totalXuiInstances: assets.reduce((s, i) => s + (i.totalXuiInstances || 0), 0),
      totalForwards: assets.reduce((s, i) => s + (i.totalForwards || 0), 0),
      totalClients: assets.reduce((s, i) => s + (i.totalClients || 0), 0),
      expiredAssets: assets.filter(a => a.expireDate && !isNeverExpireTs(a.expireDate) && a.expireDate < Date.now()).length,
      expiringSoonAssets: assets.filter(a => a.expireDate && !isNeverExpireTs(a.expireDate) && a.expireDate >= Date.now() && a.expireDate < Date.now() + 14 * 86400000).length,
    };
  }, [assets]);

  const assetTagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    assets.forEach(a => {
      // Only use asset.tags (already merged from probes), avoid double counting
      const src = a.tags;
      if (!src) return;
      const parsed: string[] = [];
      try { parsed.push(...JSON.parse(src)); } catch {
        parsed.push(...src.split(/[;,]/).map(t => t.trim()).filter(Boolean));
      }
      // Deduplicate per-asset before counting
      new Set(parsed).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [assets]);

  // Probe type counts — K/P include dual (same logic as dashboard)
  const probeCounts = useMemo(() => {
    let komari = 0, pika = 0, dual = 0, local = 0;
    assets.forEach(a => {
      const src = a.probeSource || 'local';
      if (src === 'dual') { dual++; komari++; pika++; }
      else if (src === 'komari') komari++;
      else if (src === 'pika') pika++;
      else local++;
    });
    return { komari, pika, dual, local };
  }, [assets]);

  const roleFilters = useMemo(() => {
    const counts: Record<string, number> = {};
    assets.forEach(a => {
      const role = a.role || 'none';
      counts[role] = (counts[role] || 0) + 1;
    });
    return counts;
  }, [assets]);

  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    assets.forEach(a => { const r = a.region || ''; counts[r] = (counts[r] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [assets]);

  const osCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    assets.forEach(a => { const o = a.osCategory || ''; counts[o] = (counts[o] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [assets]);

  const providerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    assets.forEach(a => { const p = a.provider || ''; counts[p] = (counts[p] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [assets]);

  /** Dynamic provider options: merge PROVIDERS constant + any custom providers from assets */
  const allProviderOptions = useMemo(() => {
    const knownKeys = new Set(PROVIDERS.map(p => p.key));
    const extras: { key: string; label: string }[] = [];
    providerCounts.forEach(([p]) => {
      if (p && !knownKeys.has(p)) extras.push({ key: p, label: p });
    });
    return [...PROVIDERS, ...extras];
  }, [providerCounts]);

  /** Dynamic environment options: merge ENVIRONMENTS constant + any custom envs from assets */
  const allEnvironmentOptions = useMemo(() => {
    const knownKeys = new Set(ENVIRONMENTS.map(e => e.key));
    const extras: { key: string; label: string }[] = [];
    assets.forEach(a => {
      if (a.environment && !knownKeys.has(a.environment)) {
        knownKeys.add(a.environment);
        extras.push({ key: a.environment, label: a.environment });
      }
    });
    return [...ENVIRONMENTS, ...extras];
  }, [assets]);

  const envCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    assets.forEach(a => { const e = a.environment || ''; counts[e] = (counts[e] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [assets]);

  const purposeStats = useMemo(() => {
    const filled = assets.filter(a => !!a.purpose).length;
    return { filled, empty: assets.length - filled };
  }, [assets]);

  const filteredAssets = useMemo(() => {
    let list = assets;
    if (filterRole) {
      list = list.filter(a => (filterRole === 'none' ? !a.role : a.role === filterRole));
    }
    if (filterProbe) {
      list = list.filter(a => {
        const src = a.probeSource || 'local';
        if (filterProbe === 'dual') return src === 'dual';
        if (filterProbe === 'komari') return src === 'komari' || src === 'dual';
        if (filterProbe === 'pika') return src === 'pika' || src === 'dual';
        return src === filterProbe;
      });
    }
    if (filterRegion) {
      list = list.filter(a => filterRegion === '_empty' ? !a.region : a.region === filterRegion);
    }
    if (filterOs) {
      list = list.filter(a => filterOs === '_empty' ? !a.osCategory : a.osCategory === filterOs);
    }
    if (filterProvider) {
      list = list.filter(a => filterProvider === '_empty' ? !a.provider : a.provider === filterProvider);
    }
    if (filterStatus === 'online') {
      list = list.filter(a => a.monitorOnline === 1);
    } else if (filterStatus === 'offline') {
      list = list.filter(a => (a.monitorNodeUuid || a.pikaNodeId) && a.monitorOnline !== 1);
    } else if (filterStatus === 'expired') {
      list = list.filter(a => a.expireDate && !isNeverExpireTs(a.expireDate) && a.expireDate < Date.now());
    } else if (filterStatus === 'expiring_soon') {
      list = list.filter(a => a.expireDate && !isNeverExpireTs(a.expireDate) && a.expireDate >= Date.now() && a.expireDate < Date.now() + 14 * 86400000);
    } else if (filterStatus === 'alerting') {
      list = list.filter(a => a.id && effectiveAlertIds.has(a.id));
    }
    if (filterEnv) {
      list = list.filter(a => filterEnv === '_empty' ? !a.environment : a.environment === filterEnv);
    }
    if (filterPurpose === 'filled') list = list.filter(a => !!a.purpose);
    else if (filterPurpose === 'empty') list = list.filter(a => !a.purpose);
    if (filterTag) {
      list = list.filter(a => {
        const src = a.tags;
        if (!src) return false;
        try { if (JSON.parse(src).includes(filterTag)) return true; } catch {
          if (src.split(/[;,]/).map((t: string) => t.trim()).includes(filterTag)) return true;
        }
        return false;
      });
    }
    const kw = normalizeKeyword(searchKeyword);
    if (kw) {
      list = list.filter((item) =>
        [item.name, item.label, item.primaryIp, item.ipv6, item.environment, item.provider, item.region, item.role, item.os, item.osCategory, item.purpose, item.remark, item.tags, item.probeTags, item.cpuName, item.arch, item.virtualization, item.panelUrl, item.monthlyCost]
          .some((v) => normalizeKeyword(v).includes(kw))
      );
    }
    // Alert status filter (by assetId, snooze-aware)
    if (filterAlertStatus === 'alerting') {
      list = list.filter(a => a.id && effectiveAlertIds.has(a.id));
    } else if (filterAlertStatus === 'healthy') {
      list = list.filter(a => a.id ? !effectiveAlertIds.has(a.id) && !snoozedOnlyAlertIds.has(a.id) : true);
    }
    // Sort
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'cpu': cmp = (a.monitorCpuUsage || 0) - (b.monitorCpuUsage || 0); break;
        case 'mem': {
          const aPct = a.monitorMemTotal ? ((a.monitorMemUsed || 0) / a.monitorMemTotal) : 0;
          const bPct = b.monitorMemTotal ? ((b.monitorMemUsed || 0) / b.monitorMemTotal) : 0;
          cmp = aPct - bPct; break;
        }
        case 'traffic': {
          const aPct = a.probeTrafficLimit ? ((a.probeTrafficUsed || 0) / a.probeTrafficLimit) : 0;
          const bPct = b.probeTrafficLimit ? ((b.probeTrafficUsed || 0) / b.probeTrafficLimit) : 0;
          cmp = aPct - bPct; break;
        }
        case 'expiry': {
          const aDate = isNeverExpireTs(a.expireDate) ? Number.MAX_SAFE_INTEGER : (a.expireDate || 0);
          const bDate = isNeverExpireTs(b.expireDate) ? Number.MAX_SAFE_INTEGER : (b.expireDate || 0);
          cmp = aDate - bDate; break;
        }
        case 'cost': {
          cmp = (parseFloat(a.monthlyCost || '0') || 0) - (parseFloat(b.monthlyCost || '0') || 0); break;
        }
        default: cmp = (a.name || '').localeCompare(b.name || '', 'zh-CN');
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [assets, searchKeyword, filterRole, filterProbe, filterTag, filterRegion, filterOs, filterProvider, filterStatus, filterEnv, filterPurpose, filterAlertStatus, effectiveAlertIds, snoozedOnlyAlertIds, sortKey, sortAsc]);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const response = await getAssetList();
      if (response.code !== 0) { toast.error(response.msg || '操作失败'); return; }
      setAssets(response.data || []);
    } catch { toast.error('加载资产失败'); }
    finally { setLoading(false); }
    // 加载有告警的资产ID（不阻塞主流程）
    try {
      const [alertRes, briefRes] = await Promise.all([
        getAlertingAssetIds(),
        getAllActiveAlertsBrief()
      ]);
      if (alertRes.code === 0 && alertRes.data) {
        setActiveAlertNodeIds(new Set(Array.isArray(alertRes.data) ? alertRes.data : []));
      }
      if (briefRes.code === 0 && briefRes.data) {
        setAllAlertsBrief(Array.isArray(briefRes.data) ? briefRes.data : []);
      }
    } catch { /* ignore */ }
  };

  const openAlertPopover = async (assetId: number, name: string) => {
    setAlertPopoverAssetId(assetId);
    setAlertPopoverName(name);
    setAlertPopoverData([]);
    setAlertPopoverLoading(true);
    try {
      const res = await getAlertsForAsset(assetId);
      if (res.code === 0 && res.data) setAlertPopoverData(res.data as any[]);
    } catch { toast.error('加载告警详情失败'); }
    finally { setAlertPopoverLoading(false); }
  };

  const handleAcknowledgeAlert = async (ruleId: number, nodeId: number) => {
    try {
      await acknowledgeAlert(ruleId, nodeId);
      toast.success('已标记为已读');
      setAlertPopoverData(prev => prev.filter(a => !(a.ruleId === ruleId && a.nodeId === nodeId)));
      // 如果该资产无剩余告警，更新 activeAlertNodeIds
      if (alertPopoverData.filter(a => !(a.ruleId === ruleId && a.nodeId === nodeId)).length === 0) {
        setActiveAlertNodeIds(prev => {
          const next = new Set(prev);
          if (alertPopoverAssetId) next.delete(alertPopoverAssetId);
          return next;
        });
        setAlertPopoverAssetId(null);
      }
    } catch { toast.error('操作失败'); }
  };

  const handleAcknowledgeAll = async () => {
    const nonSnoozed = alertPopoverData.filter(a => !isSnoozed(a.ruleId, a.nodeId));
    if (nonSnoozed.length === 0) return;
    try {
      await Promise.all(nonSnoozed.map(a => acknowledgeAlert(a.ruleId, a.nodeId)));
      toast.success(`已标记 ${nonSnoozed.length} 条告警为已读`);
      setAlertPopoverData(prev => prev.filter(a => isSnoozed(a.ruleId, a.nodeId)));
      if (alertPopoverData.every(a => isSnoozed(a.ruleId, a.nodeId))) {
        setActiveAlertNodeIds(prev => {
          const next = new Set(prev);
          if (alertPopoverAssetId) next.delete(alertPopoverAssetId);
          return next;
        });
      }
    } catch { toast.error('批量已读失败'); }
  };

  const openSnoozeDialog = () => {
    // Pre-check all non-snoozed alerts
    const keys = new Set<string>();
    alertPopoverData.forEach(a => {
      if (!isSnoozed(a.ruleId, a.nodeId)) keys.add(snoozeKey(a.ruleId, a.nodeId));
    });
    setSnoozeChecked(keys);
    setSnoozeDays(7);
    setSnoozeDialogOpen(true);
  };

  const confirmSnooze = () => {
    const items = [...snoozeChecked].map(k => {
      const [r, n] = k.split(':').map(Number);
      return { ruleId: r, nodeId: n };
    });
    if (items.length === 0) { toast.error('请至少选择一条告警'); return; }
    snoozeAlerts(items, snoozeDays);
    toast.success(`已忽略 ${items.length} 条告警 ${snoozeDays} 天`);
    setSnoozeDialogOpen(false);
    forceRender(n => n + 1);
    // Check if all alerts for this asset are now snoozed → update badge immediately
    const allSnoozed = alertPopoverData.every(a => isSnoozed(a.ruleId, a.nodeId) || items.some(it => it.ruleId === a.ruleId && it.nodeId === a.nodeId));
    if (allSnoozed && alertPopoverAssetId) {
      setActiveAlertNodeIds(prev => {
        const next = new Set(prev);
        next.delete(alertPopoverAssetId!);
        return next;
      });
    }
  };

  const handleUnsnooze = (ruleId: number, nodeId: number) => {
    unsnoozeAlert(ruleId, nodeId);
    toast.success('已取消忽略');
    forceRender(n => n + 1);
  };

  const loadGostNodes = async () => {
    try {
      const res = await getNodeList();
      if (res.code === 0 && res.data) {
        setGostNodes(res.data.map((n: any) => ({ id: n.id, name: n.name, ip: n.ip || n.serverIp, status: n.status })));
      }
    } catch { /* ignore */ }
  };

  const loadAssetDetail = async (assetId: number) => {
    setDetailLoading(true);
    try {
      const response = await getAssetDetail(assetId);
      if (response.code !== 0) { toast.error(response.msg || '操作失败'); return; }
      setDetail(response.data || null);
    } catch { toast.error('加载详情失败'); }
    finally { setDetailLoading(false); }
  };

  const openProvisionModal = async (ctx?: { assetId: number; assetName: string; assetIp?: string; asset?: AssetHost; missingKomari?: boolean; missingPika?: boolean; missingGost?: boolean }) => {
    if (!(canCreateAssets || canUpdateAssets)) {
      toast.error('权限不足，无法为资产部署探针');
      return;
    }
    setProvisionStep('select');
    setAllProvisionResult(null);
    setProvisionSyncLoading(false);
    setProvisionNodeVerified(false);
    setProvisionNodeStatus('');
    setProvisionContext(ctx || null);
    setProvisionKomariId('');
    setProvisionPikaId('');
    setProvisionGostPortSta('10000');
    setProvisionGostPortEnd('20000');

    if (ctx) {
      setProvisionName(ctx.assetName);
      // Auto-enable missing agent types
      setProvisionKomariEnabled(!!ctx.missingKomari);
      setProvisionPikaEnabled(!!ctx.missingPika);
      setProvisionGostEnabled(!!ctx.missingGost);
      // Pre-fill form from existing asset data — prefer directly passed asset, fallback to list lookup
      const asset = ctx.asset || assets.find(a => a.id === ctx.assetId);
      if (asset) {
        const fmtDate = (ts?: number | null) => {
          if (!ts) return '';
          const d = new Date(ts);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const isNeverExpire = asset.expireDate != null && asset.expireDate > 4102444800000;
        const trafficUnlimited = asset.monthlyTrafficGb != null && asset.monthlyTrafficGb < 0;
        const rawTraffic = asset.monthlyTrafficGb != null && asset.monthlyTrafficGb > 0 ? asset.monthlyTrafficGb : '';
        const trafficUnit: 'GB' | 'TB' = typeof rawTraffic === 'number' && rawTraffic >= 1000 ? 'TB' : 'GB';
        const trafficVal = typeof rawTraffic === 'number' ? (trafficUnit === 'TB' ? String(rawTraffic / 1000) : String(rawTraffic)) : '';
        // Guess osPlatform and arch from OS/arch strings
        const osLower = (asset.os || asset.osCategory || '').toLowerCase();
        const osPlatform: ProvisionForm['osPlatform'] = osLower.includes('windows') ? 'windows' : osLower.includes('darwin') || osLower.includes('macos') ? 'macos' : 'linux';
        const archLower = (asset.arch || '').toLowerCase();
        const osArch: ProvisionForm['osArch'] = archLower.includes('arm') || archLower.includes('aarch') ? 'arm64' : 'amd64';
        setProvisionForm({
          osPlatform, osArch,
          primaryIp: asset.primaryIp || ctx.assetIp || '',
          provider: asset.provider || '',
          region: asset.region || '',
          purchaseDate: fmtDate(asset.purchaseDate) || new Date().toISOString().split('T')[0],
          expireDate: isNeverExpire ? '' : fmtDate(asset.expireDate),
          neverExpire: isNeverExpire,
          billingCycle: asset.billingCycle != null ? String(asset.billingCycle) : '',
          monthlyCost: asset.monthlyCost || '',
          currency: asset.currency || 'CNY',
          bandwidthMbps: asset.bandwidthMbps != null ? String(asset.bandwidthMbps) : '',
          monthlyTrafficGb: trafficVal,
          trafficUnlimited,
          trafficUnit,
          purpose: asset.purpose || '',
          tags: asset.tags || '',
          remark: asset.remark || '',
        });
      } else {
        setProvisionForm({ ...emptyProvisionForm(), primaryIp: ctx.assetIp || '' });
      }
    } else {
      setProvisionName('');
      setProvisionKomariEnabled(true);
      setProvisionPikaEnabled(true);
      setProvisionGostEnabled(true);
      setProvisionForm(emptyProvisionForm());
    }

    onProvisionOpen();
    try {
      const res = await getMonitorList();
      if (res.code === 0) {
        const instances = res.data || [];
        setMonitorInstances(instances);
        // Auto-select first instance of each type
        const km = instances.find(i => i.type === 'komari');
        if (km) setProvisionKomariId(km.id.toString());
        const pk = instances.find(i => i.type === 'pika');
        if (pk) setProvisionPikaId(pk.id.toString());
      }
    } catch { /* ignore */ }
  };

  const handleProvision = async () => {
    if (!(canCreateAssets || canUpdateAssets)) {
      toast.error('权限不足，无法创建安装命令');
      return;
    }
    // Validate required fields
    const pf = provisionForm;
    const errs: Record<string, string> = {};
    if (!provisionName.trim()) errs.name = '必填';
    if (!pf.primaryIp.trim()) errs.primaryIp = '必填';
    if (!pf.provider) errs.provider = '必填';
    if (!pf.purchaseDate) errs.purchaseDate = '必填';
    if (!pf.neverExpire && !pf.expireDate) errs.expireDate = '必填';
    if (!pf.billingCycle) errs.billingCycle = '必填';
    if (!pf.monthlyCost) errs.monthlyCost = '必填';
    if (!pf.currency) errs.currency = '必填';
    if (!pf.bandwidthMbps) errs.bandwidthMbps = '必填';
    if (!pf.trafficUnlimited && !pf.monthlyTrafficGb) errs.monthlyTrafficGb = '必填';
    setProvisionFormErrors(errs);
    if (Object.keys(errs).length > 0) { toast.error('请填写必填字段'); return; }

    const kid = provisionKomariEnabled && provisionKomariId ? parseInt(provisionKomariId) : null;
    const pid = provisionPikaEnabled && provisionPikaId ? parseInt(provisionPikaId) : null;
    // GOST only supports Linux — enforce at submission time
    const gostCfg = provisionGostEnabled && pf.osPlatform === 'linux' && pf.primaryIp ? {
      name: provisionName || 'gost-node',
      serverIp: pf.primaryIp,
      portSta: parseInt(provisionGostPortSta) || 10000,
      portEnd: parseInt(provisionGostPortEnd) || 20000,
      assetId: provisionContext?.assetId,
    } : null;

    setProvisionLoading(true);
    try {
      // Step 1: Create asset record (if not editing existing)
      let newlyCreatedAssetId: number | undefined;
      if (!provisionContext) {
        // Convert traffic: TB → GB
        let trafficGb = pf.trafficUnlimited ? '-1' : pf.monthlyTrafficGb;
        if (!pf.trafficUnlimited && pf.trafficUnit === 'TB' && pf.monthlyTrafficGb) {
          trafficGb = String(parseFloat(pf.monthlyTrafficGb) * 1024);
        }
        const assetPayload: Record<string, any> = {
          name: provisionName.trim(),
          primaryIp: pf.primaryIp.trim(),
          provider: pf.provider,
          region: pf.region || undefined,
          purchaseDate: pf.purchaseDate ? new Date(pf.purchaseDate).getTime() : undefined,
          expireDate: pf.neverExpire ? -1 : (pf.expireDate ? new Date(pf.expireDate).getTime() : undefined),
          billingCycle: pf.billingCycle ? parseInt(pf.billingCycle) : undefined,
          monthlyCost: pf.monthlyCost,
          currency: pf.currency,
          bandwidthMbps: pf.bandwidthMbps ? parseInt(pf.bandwidthMbps) : undefined,
          monthlyTrafficGb: trafficGb ? parseInt(trafficGb) : undefined,
          purpose: pf.purpose || undefined,
          tags: pf.tags ? JSON.stringify(pf.tags.split(/[;,，]/).map(t => t.trim()).filter(Boolean)) : undefined,
          remark: pf.remark || undefined,
        };
        const createRes = await createAsset(assetPayload);
        if (createRes.code !== 0) {
          toast.error(createRes.msg || '创建服务器资产失败');
          setProvisionLoading(false);
          return;
        }
        newlyCreatedAssetId = createRes.data?.id;
        // If GOST enabled, link to new asset
        if (gostCfg && newlyCreatedAssetId) {
          gostCfg.assetId = newlyCreatedAssetId;
        }
        // Auto-geolocate IP → region (background, don't block)
        if (!pf.region && pf.primaryIp && createRes.data?.id) {
          geolocateIp(pf.primaryIp).then(geoRes => {
            if (geoRes.code === 0 && geoRes.data?.country) {
              const region = COUNTRY_TO_REGION[geoRes.data.country];
              if (region) {
                updateAsset({ id: createRes.data!.id, region } as any).catch(() => {});
              }
            }
          }).catch(() => {});
        }
      }

      // Step 2: Provision agents
      if (!kid && !pid && !gostCfg) {
        // No agents selected, just asset creation — done
        setProvisionStep('result');
        setAllProvisionResult({ combinedCommand: '' } as any);
        toast.success('服务器创建成功');
        setProvisionLoading(false);
        return;
      }

      // Pass asset ID so backend can link probe node to this asset (prevents duplicate creation)
      const effectiveAssetId = provisionContext?.assetId || newlyCreatedAssetId;
      const res = await provisionAllAgents(kid, pid, gostCfg, provisionName || undefined, provisionForm.osPlatform, effectiveAssetId, provisionForm.osArch);
      if (res.code === 0 && res.data) {
        setAllProvisionResult(res.data);
        setProvisionStep('result');
        const errors = [res.data.komariError, res.data.pikaError, res.data.gostError].filter(Boolean);
        if (errors.length > 0) {
          toast('部分组件创建成功', { icon: '⚠️' });
        } else {
          const count = [res.data.komari, res.data.pika, res.data.gost].filter(Boolean).length;
          toast.success(`服务器创建成功，${count} 个组件已配置`);
        }
      } else {
        toast.error(res.msg || '创建失败');
      }
    } catch { toast.error('请求失败'); }
    finally { setProvisionLoading(false); }
  };

  // After probe install, sync the instance and verify the new node is online
  const handleProvisionSync = async () => {
    if (!(canCreateAssets || canUpdateAssets)) {
      toast.error('权限不足，无法同步探针实例');
      return;
    }
    const idsToSync: number[] = [];
    const uuidsToCheck: { instanceId: number; uuid: string }[] = [];
    if (allProvisionResult) {
      if (allProvisionResult.komari) {
        idsToSync.push(allProvisionResult.komari.instanceId);
        uuidsToCheck.push({ instanceId: allProvisionResult.komari.instanceId, uuid: allProvisionResult.komari.uuid });
      }
      if (allProvisionResult.pika) {
        idsToSync.push(allProvisionResult.pika.instanceId);
        uuidsToCheck.push({ instanceId: allProvisionResult.pika.instanceId, uuid: allProvisionResult.pika.uuid });
      }
    }
    if (idsToSync.length === 0) { toast.error('没有可同步的实例'); return; }

    setProvisionSyncLoading(true);
    setProvisionNodeStatus('正在同步...');
    setProvisionNodeVerified(false);
    try {
      // Step 1: Sync instances
      let syncOk = true;
      for (const id of idsToSync) {
        const res = await syncMonitorInstance(id);
        if (res.code !== 0) { toast.error(res.msg || '同步失败'); syncOk = false; }
      }
      if (!syncOk) { setProvisionNodeStatus('同步失败，请检查探针配置'); return; }

      // Step 2: Verify each provisioned node's status
      let allOnline = true;
      let anyFound = false;
      const statusMessages: string[] = [];
      for (const { instanceId, uuid } of uuidsToCheck) {
        const statusRes = await getMonitorNodeStatus(instanceId, uuid);
        if (statusRes.code === 0 && statusRes.data) {
          const s = statusRes.data;
          if (s.remoteOnline) {
            statusMessages.push(`${s.remoteName || uuid.substring(0, 8)}: 在线 ✓${s.remoteIp ? ' (' + s.remoteIp + ')' : ''}`);
            anyFound = true;
          } else if (s.remoteExists) {
            statusMessages.push(`${s.remoteName || uuid.substring(0, 8)}: 已注册但未上线，请确认探针已在目标服务器安装并启动`);
            allOnline = false;
            anyFound = true;
          } else {
            statusMessages.push(`${uuid.substring(0, 8)}: 未找到节点，请检查安装命令是否正确`);
            allOnline = false;
          }
        }
      }

      if (allOnline && anyFound) {
        setProvisionNodeVerified(true);
        setProvisionNodeStatus(statusMessages.join('\n'));
        toast.success('节点已上线，同步成功');
        void loadAssets();
      } else if (anyFound) {
        setProvisionNodeStatus(statusMessages.join('\n'));
        toast('节点尚未完全上线，请在目标服务器安装探针后重试', { icon: '⚠️' });
      } else {
        setProvisionNodeStatus('未检测到任何节点上线，请确认探针已安装');
        toast.error('未检测到节点上线');
      }
    } catch { toast.error('同步请求失败'); setProvisionNodeStatus('请求异常'); }
    finally { setProvisionSyncLoading(false); }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success('已复制到剪贴板'))
      .catch(() => toast.error('复制失败，请手动选择文本复制'));
  };

  const refreshAssetContext = async (assetId?: number) => {
    await loadAssets();
    const targetId = assetId || expandedAssetId;
    if (targetId) {
      await loadAssetDetail(targetId);
    }
  };

  const openOnePanelBootstrap = (bootstrap: OnePanelBootstrap, message?: string) => {
    setOnePanelBootstrap(bootstrap);
    setOnePanelBootstrapOpen(true);
    if (message) {
      toast.success(message);
    }
  };

  const handleCreateOnePanelInstance = async (asset: AssetHost) => {
    if (!(canCreateAssets || canUpdateAssets)) {
      toast.error('权限不足，无法创建 1Panel 摘要实例');
      return;
    }
    if (!asset.panelUrl) {
      toast.error('请先在服务器资产中录入 1Panel 地址');
      return;
    }
    setOnePanelActionLoading(true);
    try {
      const response = await createOnePanelInstance({
        name: `${asset.name}-1panel`,
        assetId: asset.id,
        panelUrl: null,
        reportEnabled: 1,
        remark: null,
      });
      if (response.code === 0 && response.data) {
        openOnePanelBootstrap(response.data as OnePanelBootstrap, '1Panel 摘要实例已创建');
        await refreshAssetContext(asset.id);
      } else {
        toast.error(response.msg || '创建 1Panel 摘要实例失败');
      }
    } catch {
      toast.error('创建 1Panel 摘要实例失败');
    } finally {
      setOnePanelActionLoading(false);
    }
  };

  const handleRotateOnePanelToken = async (asset: AssetHost) => {
    if (!(canCreateAssets || canUpdateAssets)) {
      toast.error('权限不足，无法轮换 1Panel Token');
      return;
    }
    if (!asset.onePanelInstanceId) {
      toast.error('当前资产还没有 1Panel 摘要实例');
      return;
    }
    setOnePanelActionLoading(true);
    try {
      const response = await rotateOnePanelToken(asset.onePanelInstanceId);
      if (response.code === 0 && response.data) {
        openOnePanelBootstrap(response.data as OnePanelBootstrap, '新的 1Panel Node Token 已生成');
        await refreshAssetContext(asset.id);
      } else {
        toast.error(response.msg || '轮换 Token 失败');
      }
    } catch {
      toast.error('轮换 Token 失败');
    } finally {
      setOnePanelActionLoading(false);
    }
  };

  const handleDeleteOnePanelInstance = async (asset: AssetHost) => {
    if (!canDeleteAssets) {
      toast.error('权限不足，无法移除 1Panel 摘要实例');
      return;
    }
    if (!asset.onePanelInstanceId) {
      toast.error('当前资产还没有 1Panel 摘要实例');
      return;
    }
    if (!window.confirm(`确认移除 ${asset.name} 的 1Panel 摘要实例吗？`)) {
      return;
    }
    setOnePanelActionLoading(true);
    try {
      const response = await deleteOnePanelInstance(asset.onePanelInstanceId);
      if (response.code === 0) {
        toast.success('1Panel 摘要实例已移除');
        await refreshAssetContext(asset.id);
      } else {
        toast.error(response.msg || '移除失败');
      }
    } catch {
      toast.error('移除 1Panel 摘要实例失败');
    } finally {
      setOnePanelActionLoading(false);
    }
  };

  const openEditModal = (asset: AssetHost, tab?: string) => {
    if (!canUpdateAssets) {
      toast.error('权限不足，无法编辑资产');
      return;
    }
    setIsEdit(true); setErrors({});
    setXuiBindOpen(false); setXuiBindForm({ addr: '', user: '', pass: '' }); setXuiBindLoading(false);
    setPanelBindOpen(false); setGostBindOpen(false); setGostInstallCmd(null); setTagInput('');
    setOnePanelBootstrap(null); setOnePanelBootstrapOpen(false); setOnePanelActionLoading(false);
    setEditTab(tab || 'basic');
    setForm({
      id: asset.id, name: asset.name, label: asset.label || '', primaryIp: asset.primaryIp || '',
      ipv6: asset.ipv6 || '', environment: asset.environment || '', provider: asset.provider || '',
      region: asset.region || '', role: asset.role || '', os: asset.os || '', osCategory: asset.osCategory || '',
      cpuCores: asset.cpuCores?.toString() || '', memTotalMb: asset.memTotalMb?.toString() || '',
      diskTotalGb: asset.diskTotalGb?.toString() || '', bandwidthMbps: asset.bandwidthMbps?.toString() || '',
      monthlyTrafficGb: asset.monthlyTrafficGb === -1 ? '-1' : (asset.monthlyTrafficGb?.toString() || ''),
      sshPort: asset.sshPort?.toString() || '',
      purchaseDate: tsToDateInput(asset.purchaseDate),
      expireDate: asset.expireDate && asset.expireDate > 4102444800000 ? 'never' : tsToDateInput(asset.expireDate),
      monthlyCost: asset.monthlyCost || '', currency: asset.currency || 'CNY',
      billingCycle: asset.billingCycle?.toString() || '',
      tags: asset.tags || '', monitorNodeUuid: asset.monitorNodeUuid || '', pikaNodeId: asset.pikaNodeId || '',
      cpuName: asset.cpuName || '', arch: asset.arch || '', virtualization: asset.virtualization || '',
      kernelVersion: asset.kernelVersion || '', gpuName: asset.gpuName || '',
      swapTotalMb: asset.swapTotalMb?.toString() || '', purpose: asset.purpose || '', remark: asset.remark || '',
      panelUrl: asset.panelUrl || '', jumpserverAssetId: asset.jumpserverAssetId || '', gostNodeId: asset.gostNodeId?.toString() || '',
    });
    formSnapshotRef.current = JSON.stringify({
      name: asset.name, primaryIp: asset.primaryIp || '', provider: asset.provider || '',
      region: asset.region || '', monthlyCost: asset.monthlyCost || '', tags: asset.tags || '',
      purpose: asset.purpose || '', remark: asset.remark || '', label: asset.label || '',
    });
    onFormOpen();
  };

  const validateForm = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = '必填';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!(canCreateAssets || canUpdateAssets)) {
      toast.error('权限不足，无法保存资产');
      return;
    }
    if (!validateForm()) return;
    setSubmitLoading(true);
    try {
      const payload: any = {
        ...(isEdit ? { id: form.id } : {}),
        name: form.name.trim(),
        label: form.label.trim() || null,
        primaryIp: form.primaryIp.trim() || null,
        ipv6: form.ipv6.trim() || null,
        environment: form.environment.trim() || null,
        provider: form.provider.trim() || null,
        region: form.region.trim() || null,
        role: form.role || null,
        os: form.os.trim() || null,
        osCategory: form.osCategory || null,
        cpuCores: form.cpuCores ? parseInt(form.cpuCores) : null,
        memTotalMb: form.memTotalMb ? parseInt(form.memTotalMb) : null,
        diskTotalGb: form.diskTotalGb ? parseInt(form.diskTotalGb) : null,
        bandwidthMbps: form.bandwidthMbps ? parseInt(form.bandwidthMbps) : null,
        monthlyTrafficGb: form.monthlyTrafficGb === '-1' ? -1 : (form.monthlyTrafficGb ? parseInt(form.monthlyTrafficGb) : null),
        sshPort: form.sshPort ? parseInt(form.sshPort) : null,
        purchaseDate: dateInputToTs(form.purchaseDate) ?? null,
        expireDate: form.expireDate === 'never' ? 4102444800000 : (dateInputToTs(form.expireDate) ?? null),
        monthlyCost: form.monthlyCost.trim() || null,
        currency: form.currency || null,
        billingCycle: form.billingCycle ? parseInt(form.billingCycle) : null,
        tags: form.tags.trim() || null,
        monitorNodeUuid: form.monitorNodeUuid.trim() || null,
        pikaNodeId: form.pikaNodeId.trim() || null,
        cpuName: form.cpuName.trim() || null,
        arch: form.arch.trim() || null,
        virtualization: form.virtualization.trim() || null,
        kernelVersion: form.kernelVersion.trim() || null,
        gpuName: form.gpuName.trim() || null,
        swapTotalMb: form.swapTotalMb ? parseInt(form.swapTotalMb) : null,
        purpose: form.purpose.trim() || null,
        remark: form.remark.trim() || null,
        panelUrl: form.panelUrl.trim() || null,
        jumpserverAssetId: form.jumpserverAssetId.trim() || null,
        gostNodeId: form.gostNodeId ? parseInt(form.gostNodeId) : null,
      };
      const response = isEdit ? await updateAsset(payload) : await createAsset(payload);
      if (response.code !== 0) { toast.error(response.msg || '操作失败'); return; }
      toast.success(isEdit ? '已更新' : '已创建');
      onFormClose();
      await loadAssets();
    } catch { toast.error('操作失败'); }
    finally { setSubmitLoading(false); }
  };

  const openDeleteModal = (asset: AssetHost) => {
    if (!canDeleteAssets) {
      toast.error('权限不足，无法删除资产');
      return;
    }
    setAssetToDelete(asset);
    onDeleteOpen();
  };
  const handleDelete = async () => {
    if (!canDeleteAssets) {
      toast.error('权限不足，无法删除资产');
      return;
    }
    if (!assetToDelete) return;
    setActionLoadingId(assetToDelete.id);
    try {
      const response = await deleteAsset(assetToDelete.id);
      if (response.code !== 0) { toast.error(response.msg || '操作失败'); return; }
      toast.success('已删除');
      onDeleteClose(); setAssetToDelete(null);
      if (expandedAssetId === assetToDelete.id) setExpandedAssetId(null);
      await loadAssets();
    } catch { toast.error('操作失败'); }
    finally { setActionLoadingId(null); }
  };

  const fetchArchivedAssets = async () => {
    setArchivedLoading(true);
    try {
      const res = await getArchivedAssets();
      setArchivedAssets(res.data || []);
    } catch { /* ignore */ }
    setArchivedLoading(false);
  };

  const [archiveConfirmId, setArchiveConfirmId] = useState<number | null>(null);
  const handleArchiveAsset = async (id: number) => {
    try {
      await archiveAsset(id);
      toast.success('已移入回收站');
      setArchiveConfirmId(null);
      await loadAssets();
    } catch (e: any) {
      toast.error(e?.message || '操作失败');
    }
  };

  const handleRestoreAsset = async (id: number) => {
    try {
      await restoreAsset(id);
      toast.success('已恢复');
      fetchArchivedAssets();
      loadAssets();
    } catch (e: any) {
      toast.error(e?.message || '操作失败');
    }
  };

  const handlePermanentDelete = async (id: number) => {
    if (!confirm('确定要彻底删除该资产？此操作不可撤销。')) return;
    try {
      await deleteAsset(id);
      toast.success('已彻底删除');
      fetchArchivedAssets();
    } catch (e: any) {
      toast.error(e?.message || '删除失败');
    }
  };

  const toggleSelectId = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAssets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAssets.map(a => a.id)));
    }
  };

  const openBatchModal = () => {
    if (!(canCreateAssets || canUpdateAssets)) {
      toast.error('权限不足，无法批量修改资产');
      return;
    }
    if (selectedIds.size === 0) { toast.error('请先选择资产'); return; }
    setBatchField('tags');
    setBatchValue('');
    onBatchOpen();
  };

  const handleBatchGeolocate = async () => {
    if (!(canCreateAssets || canUpdateAssets)) {
      toast.error('权限不足，无法批量匹配地区');
      return;
    }
    if (selectedIds.size === 0) { toast.error('请先选择资产'); return; }
    const targets = filteredAssets.filter(a => selectedIds.has(a.id) && a.primaryIp);
    if (targets.length === 0) { toast('所选资产都缺少 IP，无法匹配地区', { icon: '📍' }); return; }
    setBatchLoading(true);
    let matched = 0; let failed = 0;
    try {
      for (const asset of targets) {
        try {
          const res = await geolocateIp(asset.primaryIp!);
          if (res.code === 0 && res.data?.country) {
            const regionKey = COUNTRY_TO_REGION[res.data.country] || res.data.country;
            const match = REGIONS.find(r => r.key === regionKey || r.label === regionKey);
            if (match?.key) {
              await batchUpdateAsset({ ids: [asset.id], field: 'region', value: match.key });
              matched++;
            } else { failed++; }
          } else { failed++; }
        } catch { failed++; }
      }
      toast.success(`已匹配 ${matched} 个，失败 ${failed} 个`);
      setSelectedIds(new Set());
      setBatchMode(false);
      await loadAssets();
    } catch { toast.error('批量匹配失败'); }
    finally { setBatchLoading(false); }
  };

  const handleBatchDeriveOs = async () => {
    if (!(canCreateAssets || canUpdateAssets) || selectedIds.size === 0) return;
    const deriveCategory = (os: string): string => {
      const l = os.toLowerCase();
      if (l.includes('ubuntu')) return 'Ubuntu';
      if (l.includes('debian')) return 'Debian';
      if (l.includes('centos')) return 'CentOS';
      if (l.includes('alma')) return 'AlmaLinux';
      if (l.includes('rocky')) return 'Rocky';
      if (l.includes('fedora')) return 'Fedora';
      if (l.includes('alpine')) return 'Alpine';
      if (l.includes('arch')) return 'Arch';
      if (l.includes('windows')) return 'Windows';
      if (l.includes('macos') || l.includes('darwin')) return 'MacOS';
      if (l.includes('freebsd')) return 'FreeBSD';
      return 'Other';
    };
    const targets = filteredAssets.filter(a => selectedIds.has(a.id) && a.os && !a.osCategory);
    if (targets.length === 0) { toast('所选资产已有分类或缺少 OS 信息', { icon: '💻' }); return; }
    setBatchLoading(true);
    let updated = 0;
    try {
      for (const asset of targets) {
        const cat = deriveCategory(asset.os!);
        await batchUpdateAsset({ ids: [asset.id], field: 'osCategory', value: cat });
        updated++;
      }
      toast.success(`已补全 ${updated} 个资产的操作系统分类`);
      setSelectedIds(new Set());
      setBatchMode(false);
      await loadAssets();
    } catch { toast.error('批量补全失败'); }
    finally { setBatchLoading(false); }
  };

  const handleBatchUpdate = async () => {
    if (!(canCreateAssets || canUpdateAssets)) {
      toast.error('权限不足，无法批量修改资产');
      return;
    }
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      const payload: any = {
        ids: Array.from(selectedIds),
        field: batchField,
        value: batchValue || '',
      };
      if (batchField === 'tags') payload.mode = 'merge';
      const res = await batchUpdateAsset(payload);
      if (res.code !== 0) { toast.error(res.msg || '操作失败'); return; }
      toast.success(`已批量更新 ${selectedIds.size} 个资产`);
      onBatchClose();
      setSelectedIds(new Set());
      setBatchMode(false);
      await loadAssets();
    } catch { toast.error('操作失败'); }
    finally { setBatchLoading(false); }
  };

  const handleGeolocate = async () => {
    if (!(canCreateAssets || canUpdateAssets)) {
      toast.error('权限不足，无法修改资产地区');
      return;
    }
    const ip = form.primaryIp.trim();
    if (!ip) { toast.error('请先填写 IP 地址'); return; }
    setGeoLoading(true);
    try {
      const res = await geolocateIp(ip);
      if (res.code === 0 && res.data) {
        const country = res.data.country || '';
        // Use mapping table first, then direct match
        const regionKey = COUNTRY_TO_REGION[country] || country;
        const match = REGIONS.find(r => r.key === regionKey || r.label === regionKey || r.label === country);
        if (match && match.key) {
          setForm(p => ({ ...p, region: match.key }));
          const extra = [res.data.regionName, res.data.city, res.data.isp].filter(Boolean).join(' · ');
          toast.success(`已识别: ${match.flag} ${match.label}${extra ? ` (${extra})` : ''}`);
        } else {
          toast(`国家: ${country}，未匹配预设地区，请手动选择`, { icon: '📍' });
        }
      } else {
        toast.error(res.msg || 'IP 查询失败');
      }
    } catch { toast.error('IP 查询失败'); }
    finally { setGeoLoading(false); }
  };

  const openDetailModal = (assetId: number) => {
    setExpandedAssetId(assetId);
    onDetailOpen();
  };

  if (!canViewAssets) {
    return (
      <Card className="border border-danger/20 bg-danger-50/60">
        <CardBody className="p-6">
          <h1 className="text-xl font-semibold text-danger">缺少资产查看权限</h1>
        </CardBody>
      </Card>
    );
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  }

  const expiringSoon = assets.filter(a => a.expireDate && !isNeverExpireTs(a.expireDate) && a.expireDate < Date.now() + 30 * 86400000 && a.expireDate > Date.now());

  const selectedAsset = assets.find(a => a.id === expandedAssetId) || null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">服务器资产</h1>
          <p className="mt-1 text-sm text-default-500">
            {assets.length} 台服务器，自动关联探针 / X-UI / 转发
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="flat" size="sm" onPress={() => { setShowArchived(!showArchived); if (!showArchived) fetchArchivedAssets(); }}>
            {showArchived ? '返回资产列表' : `回收站${archivedAssets.length > 0 ? ` (${archivedAssets.length})` : ''}`}
          </Button>
          {(canCreateAssets || canUpdateAssets) && (
            <>
              <Button
                variant={batchMode ? 'solid' : 'flat'} size="sm"
                color={batchMode ? 'warning' : 'default'}
                onPress={() => { setBatchMode(!batchMode); setSelectedIds(new Set()); }}
              >
                {batchMode ? '退出批量' : '批量操作'}
              </Button>
              <Button color="primary" size="sm" onPress={() => openProvisionModal()}>添加服务器</Button>
            </>
          )}
        </div>
      </div>

      {/* Summary Stats - compact inline bar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:shadow-sm ${!filterStatus ? 'border-primary/40 bg-primary-50/40 ring-1 ring-primary/20 text-primary' : 'border-divider/60 bg-content1 text-default-600'}`} onClick={() => setFilterStatus('')}>
          全部 <span className="font-mono font-bold">{summary.totalAssets}</span>
        </button>
        <button className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:shadow-sm ${filterStatus === 'online' ? 'border-success/40 ring-1 ring-success/20' : 'border-success/20'} bg-success-50/30 dark:bg-success-50/10 text-success`} onClick={() => setFilterStatus(filterStatus === 'online' ? '' : 'online')}>
          在线 <span className="font-mono font-bold">{summary.onlineAssets}</span>
        </button>
        <button className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:shadow-sm ${filterStatus === 'offline' ? 'border-danger/40 ring-1 ring-danger/20' : summary.offlineAssets > 0 ? 'border-danger/20 bg-danger-50/30 dark:bg-danger-50/10' : 'border-divider/60 bg-content1'} ${summary.offlineAssets > 0 ? 'text-danger' : 'text-default-400'}`} onClick={() => setFilterStatus(filterStatus === 'offline' ? '' : 'offline')}>
          离线 <span className="font-mono font-bold">{summary.offlineAssets}</span>
        </button>
        <button className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:shadow-sm ${filterStatus === 'expiring_soon' ? 'border-warning/40 ring-1 ring-warning/20' : summary.expiringSoonAssets > 0 ? 'border-warning/20 bg-warning-50/30 dark:bg-warning-50/10' : 'border-divider/60 bg-content1'} ${summary.expiringSoonAssets > 0 ? 'text-warning' : 'text-default-400'}`} onClick={() => setFilterStatus(filterStatus === 'expiring_soon' ? '' : 'expiring_soon')}>
          快到期 <span className="font-mono font-bold">{summary.expiringSoonAssets}</span>
        </button>
        <button className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:shadow-sm ${filterStatus === 'expired' ? 'border-danger/40 ring-1 ring-danger/20' : summary.expiredAssets > 0 ? 'border-danger/20 bg-danger-50/30 dark:bg-danger-50/10' : 'border-divider/60 bg-content1'} ${summary.expiredAssets > 0 ? 'text-danger' : 'text-default-400'}`} onClick={() => setFilterStatus(filterStatus === 'expired' ? '' : 'expired')}>
          已到期 <span className="font-mono font-bold">{summary.expiredAssets}</span>
        </button>
        <button className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:shadow-sm ${filterStatus === 'alerting' ? 'border-danger/40 ring-1 ring-danger/20' : effectiveAlertIds.size > 0 ? 'border-danger/20 bg-danger-50/30 dark:bg-danger-50/10' : 'border-divider/60 bg-content1'} ${effectiveAlertIds.size > 0 ? 'text-danger' : 'text-default-400'}`}
          onClick={() => setFilterStatus(filterStatus === 'alerting' ? '' : 'alerting')}>
          告警中 <span className="font-mono font-bold">{effectiveAlertIds.size}</span>
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-divider/60 bg-content1 px-3 py-1.5 text-xs text-default-500">
          <span className="font-mono font-bold">{summary.totalXuiInstances}</span> XUI
          <span className="font-mono font-bold">{summary.totalForwards}</span> 转发
        </span>
      </div>

      {/* Expiry Warnings */}
      {expiringSoon.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning-50/60 p-3 text-sm text-warning-700 dark:text-warning-400">
          {expiringSoon.length} 台资产将在 30 天内到期: {expiringSoon.map(a => a.name).join(', ')}
        </div>
      )}

      {/* Sticky toolbar: search + sort + filters */}
      <div className="sticky top-[61px] z-20 -mx-3 px-3 lg:-mx-6 lg:px-6 py-3 bg-white/95 dark:bg-black/95 backdrop-blur-md border-b border-divider/40 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] space-y-3">
      {/* Filter + Search bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          className="sm:max-w-md"
          size="md"
          value={searchKeyword}
          onValueChange={setSearchKeyword}
          placeholder="搜索名称、IP、OS、供应商、地区、备注..."
          isClearable
          onClear={() => setSearchKeyword('')}
          classNames={{ inputWrapper: 'border-2 border-default-200 hover:border-primary focus-within:border-primary shadow-sm' }}
          startContent={<svg className="w-4 h-4 text-default-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
        />
        {/* Role filter - only show when there are multiple distinct roles */}
        {Object.keys(roleFilters).length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
                !filterRole ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
              }`}
              onClick={() => setFilterRole(null)}
            >
              全部 ({assets.length})
            </button>
            {Object.entries(roleFilters).map(([role, count]) => {
              const roleInfo = getRoleChip(role === 'none' ? null : role);
              return (
                <button
                  key={role}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
                    filterRole === role ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                  }`}
                  onClick={() => setFilterRole(filterRole === role ? null : role)}
                >
                  {roleInfo?.text || '未分类'} ({count})
                </button>
              );
            })}
          </div>
        )}
        {/* Probe type filters */}
        <div className="flex gap-1 ml-auto">
          {[
            { v: '', l: '全部', c: assets.length },
            { v: 'komari', l: 'K', c: probeCounts.komari },
            { v: 'pika', l: 'P', c: probeCounts.pika },
            { v: 'dual', l: '双探针', c: probeCounts.dual },
            { v: 'local', l: '本地', c: probeCounts.local },
          ].map(({ v, l, c }) => (
            <button key={v} onClick={() => setFilterProbe(filterProbe === v ? '' : v)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
                filterProbe === v ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
              }`}>
              {l}({c})
            </button>
          ))}
        </div>
      </div>

      {/* Sort buttons + Reset */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-bold tracking-widest text-default-400 uppercase mr-0.5">排序:</span>
        {([
          ['name', '名称'], ['cpu', 'CPU'], ['mem', '内存'], ['traffic', '流量'], ['expiry', '到期'], ['cost', '月费'],
        ] as [typeof sortKey, string][]).map(([key, label]) => (
          <button key={key}
            onClick={() => { if (sortKey === key) setSortAsc(!sortAsc); else { setSortKey(key); setSortAsc(key === 'name'); } }}
            className={`rounded-lg px-2 py-1 text-[10px] font-bold tracking-wider transition-all cursor-pointer border whitespace-nowrap ${
              sortKey === key ? 'border-primary bg-primary-50 dark:bg-primary/10 text-primary' : 'border-divider/60 text-default-400 hover:border-primary/40'
            }`}>
            {label}{sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}
          </button>
        ))}
        {(searchKeyword || filterRole || filterProbe || filterTag || filterRegion || filterOs || filterProvider || filterStatus || filterEnv || filterPurpose !== 'all' || sortKey !== 'name') && (
          <button onClick={() => { setSearchKeyword(''); setFilterRole(null); setFilterProbe(''); setFilterTag(''); setFilterRegion(''); setFilterOs(''); setFilterProvider(''); setFilterStatus(''); setFilterEnv(''); setFilterPurpose('all'); setSortKey('name'); setSortAsc(true); }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-danger border border-danger/40 bg-danger-50/50 hover:bg-danger-100 dark:hover:bg-danger/20 transition-all cursor-pointer ml-2">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            重置筛选
          </button>
        )}
      </div>

      {/* Collapsible filter panel */}
      <div className="space-y-2">
        <button onClick={() => setFiltersCollapsed(!filtersCollapsed)}
          className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-default-400 hover:text-default-600 transition-colors cursor-pointer">
          <svg className={`w-3.5 h-3.5 transition-transform ${filtersCollapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          筛选面板
          {(filterRegion || filterOs || filterProvider || filterEnv || filterPurpose !== 'all' || filterTag) && (
            <Chip size="sm" variant="flat" color="primary" className="h-4 text-[9px]">
              {[filterRegion, filterOs, filterProvider, filterEnv, filterPurpose !== 'all' ? '用途' : '', filterTag].filter(Boolean).length}
            </Chip>
          )}
        </button>

        {!filtersCollapsed && (
          <div className="space-y-2">
            {/* Region / OS filters */}
            <div className="flex flex-wrap items-center gap-3">
              {regionCounts.length > 1 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] font-bold tracking-widest text-default-400 uppercase mr-0.5">地区:</span>
                  <button onClick={() => setFilterRegion('')}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
                      !filterRegion ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                    }`}>全部</button>
                  {regionCounts.filter(([r]) => r).map(([region, count]) => {
                    const flag = REGIONS.find(r => r.key === region)?.flag || '';
                    return (
                      <button key={region} onClick={() => setFilterRegion(filterRegion === region ? '' : region)}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider transition-all border cursor-pointer ${
                          filterRegion === region ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                        }`}>{flag}{region} ({count})</button>
                    );
                  })}
                  {regionCounts.some(([r]) => !r) && (
                    <button onClick={() => setFilterRegion(filterRegion === '_empty' ? '' : '_empty')}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider transition-all border cursor-pointer ${
                        filterRegion === '_empty' ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                      }`}>未设置 ({regionCounts.find(([r]) => !r)?.[1]})</button>
                  )}
                </div>
              )}
              {osCounts.length > 1 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] font-bold tracking-widest text-default-400 uppercase mr-0.5">系统:</span>
                  <button onClick={() => setFilterOs('')}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
                      !filterOs ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                    }`}>全部</button>
                  {osCounts.filter(([o]) => o).map(([os, count]) => (
                    <button key={os} onClick={() => setFilterOs(filterOs === os ? '' : os)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
                        filterOs === os ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                      }`}>{os} ({count})</button>
                  ))}
                  {osCounts.some(([o]) => !o) && (
                    <button onClick={() => setFilterOs(filterOs === '_empty' ? '' : '_empty')}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
                        filterOs === '_empty' ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                      }`}>未知 ({osCounts.find(([o]) => !o)?.[1]})</button>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] font-bold tracking-widest text-default-400 uppercase mr-0.5">用途:</span>
                {(['all', 'filled', 'empty'] as const).map(v => (
                  <button key={v} onClick={() => setFilterPurpose(filterPurpose === v && v !== 'all' ? 'all' : v)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider transition-all border cursor-pointer ${
                      filterPurpose === v ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                    }`}>{v === 'all' ? '全部' : v === 'filled' ? `已填 (${purposeStats.filled})` : `未填 (${purposeStats.empty})`}</button>
                ))}
              </div>
            </div>

            {/* Provider + Environment (only when data exists) */}
            {(providerCounts.filter(([p]) => p).length > 0 || envCounts.filter(([e]) => e).length > 0) && (
            <div className="flex flex-wrap items-center gap-3">
              {providerCounts.filter(([p]) => p).length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] font-bold tracking-widest text-default-400 uppercase mr-0.5">厂商:</span>
                  <button onClick={() => setFilterProvider('')}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
                      !filterProvider ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                    }`}>全部</button>
                  {providerCounts.filter(([p]) => p).map(([provider, count]) => (
                    <button key={provider} onClick={() => setFilterProvider(filterProvider === provider ? '' : provider)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
                        filterProvider === provider ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                      }`}>{provider} ({count})</button>
                  ))}
                  {providerCounts.some(([p]) => !p) && (
                    <button onClick={() => setFilterProvider(filterProvider === '_empty' ? '' : '_empty')}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
                        filterProvider === '_empty' ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                      }`}>未设置 ({providerCounts.find(([p]) => !p)?.[1]})</button>
                  )}
                </div>
              )}
              {envCounts.filter(([e]) => e).length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] font-bold tracking-widest text-default-400 uppercase mr-0.5">环境:</span>
                  <button onClick={() => setFilterEnv('')}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider transition-all border cursor-pointer ${
                      !filterEnv ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                    }`}>全部</button>
                  {envCounts.filter(([e]) => e).map(([env, count]) => (
                    <button key={env} onClick={() => setFilterEnv(filterEnv === env ? '' : env)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider transition-all border cursor-pointer ${
                        filterEnv === env ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                      }`}>{env} ({count})</button>
                  ))}
                  {envCounts.some(([e]) => !e) && (
                    <button onClick={() => setFilterEnv(filterEnv === '_empty' ? '' : '_empty')}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider transition-all border cursor-pointer ${
                        filterEnv === '_empty' ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                      }`}>未设置 ({envCounts.find(([e]) => !e)?.[1]})</button>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Tag filter bar */}
            {assetTagCounts.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold tracking-widest text-default-400 uppercase mr-1">标签:</span>
                <button
                  onClick={() => setFilterTag('')}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
                    !filterTag ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                  }`}>
                  ALL ({assets.length})
                </button>
                {assetTagCounts.map(([tag, count]) => (
                  <button key={tag} onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
                      filterTag === tag ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                    }`}>
                    {tag.toUpperCase()} ({count})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Alert status filter */}
        {(effectiveAlertIds.size > 0 || snoozedOnlyAlertIds.size > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold tracking-widest text-default-400 uppercase mr-1">告警:</span>
            {[
              { key: '', label: '全部', count: assets.length },
              { key: 'alerting', label: '告警中', count: assets.filter(a => a.id && effectiveAlertIds.has(a.id)).length },
              { key: 'healthy', label: '正常', count: assets.filter(a => a.id ? !effectiveAlertIds.has(a.id) && !snoozedOnlyAlertIds.has(a.id) : true).length },
            ].map(opt => (
              <button key={opt.key} onClick={() => setFilterAlertStatus(filterAlertStatus === opt.key ? '' : opt.key)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
                  filterAlertStatus === opt.key
                    ? (opt.key === 'alerting' ? 'border-danger bg-danger-100/60 text-danger dark:bg-danger/20' : 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20')
                    : 'border-divider text-default-500 hover:border-primary/40'
                }`}>
                {opt.label} ({opt.count})
              </button>
            ))}
          </div>
        )}
      </div>
      </div>{/* end sticky toolbar */}

      {showArchived ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">回收站</h3>
            <span className="text-sm text-default-400">{archivedAssets.length} 台已归档资产</span>
          </div>
          {archivedLoading ? (
            <div className="flex h-32 items-center justify-center"><Spinner size="lg" /></div>
          ) : archivedAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider/60 p-12 text-center">
              <h3 className="text-base font-semibold text-default-600">回收站为空</h3>
              <p className="mt-2 text-sm text-default-400">被归档的服务器资产将显示在此处</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-divider/60">
              <table className="w-full text-sm">
                <thead><tr className="bg-default-50 dark:bg-default-50/5">
                  <th className="px-4 py-3 text-left text-[11px] font-bold tracking-widest text-default-400 uppercase">名称</th>
                  <th className="px-3 py-3 text-left text-[11px] font-bold tracking-widest text-default-400 uppercase">IP</th>
                  <th className="px-3 py-3 text-left text-[11px] font-bold tracking-widest text-default-400 uppercase">厂商</th>
                  <th className="px-3 py-3 text-left text-[11px] font-bold tracking-widest text-default-400 uppercase">到期</th>
                  <th className="px-3 py-3 text-left text-[11px] font-bold tracking-widest text-default-400 uppercase">归档时间</th>
                  <th className="px-3 py-3 text-right text-[11px] font-bold tracking-widest text-default-400 uppercase">操作</th>
                </tr></thead>
                <tbody>
                  {archivedAssets.map(a => (
                    <tr key={a.id} className="border-t border-divider/40 hover:bg-default-50/50">
                      <td className="px-4 py-3 font-medium">{a.name}</td>
                      <td className="px-3 py-3 font-mono text-xs text-default-500">{a.primaryIp || '-'}</td>
                      <td className="px-3 py-3 text-xs text-default-500">{a.provider || '-'}</td>
                      <td className="px-3 py-3 text-xs font-mono text-default-500">{formatDateShort(a.expireDate)}</td>
                      <td className="px-3 py-3 text-xs font-mono text-default-400">{(a as any).updatedTime ? new Date((a as any).updatedTime).toLocaleDateString('zh-CN') : '-'}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="flat" color="success" onPress={() => handleRestoreAsset(a.id)}>恢复</Button>
                          <Button size="sm" variant="flat" color="danger" onPress={() => handlePermanentDelete(a.id)}>彻底删除</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
      <>
      {/* Batch action bar */}
      {(canCreateAssets || canUpdateAssets) && batchMode && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning-50/50 dark:bg-warning-50/10 px-4 py-2">
          <span className="text-sm font-semibold text-warning-700 dark:text-warning-400">
            已选 {selectedIds.size} / {filteredAssets.length}
          </span>
          <Button size="sm" variant="flat" onPress={toggleSelectAll}>
            {selectedIds.size === filteredAssets.length ? '取消全选' : '全选'}
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="flat" isDisabled={selectedIds.size === 0} isLoading={batchLoading} onPress={handleBatchGeolocate}>
            批量匹配地区
          </Button>
          <Button size="sm" variant="flat" isDisabled={selectedIds.size === 0} isLoading={batchLoading} onPress={handleBatchDeriveOs}>
            补全OS分类
          </Button>
          <Button size="sm" color="primary" isDisabled={selectedIds.size === 0} onPress={openBatchModal}>
            批量修改
          </Button>
        </div>
      )}

      {/* Main Server Table (desktop) / Card Grid (mobile) */}
      {filteredAssets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider/60 p-12 text-center">
          <h3 className="text-base font-semibold text-default-600">{assets.length === 0 ? '暂无资产' : '无匹配结果'}</h3>
          <p className="mt-2 text-sm text-default-400">
            {assets.length === 0 ? '点击「添加服务器」开始部署探针' : '尝试调整搜索关键词或筛选条件'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block">
            <div className="overflow-x-auto rounded-xl border border-divider/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-divider/60 bg-default-50/80">
                    {batchMode && (
                      <th className="px-2 py-3 w-[40px]">
                        <input type="checkbox" className="h-4 w-4 rounded accent-primary cursor-pointer"
                          checked={selectedIds.size === filteredAssets.length && filteredAssets.length > 0}
                          onChange={toggleSelectAll} />
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-[11px] font-bold tracking-widest text-default-400 uppercase w-[280px]">服务器</th>
                    <th className="px-3 py-3 text-left text-[11px] font-bold tracking-widest text-default-400 uppercase w-[200px]">遥测</th>
                    <th className="px-3 py-3 text-left text-[11px] font-bold tracking-widest text-default-400 uppercase w-[140px]">流量/到期</th>
                    <th className="px-3 py-3 text-left text-[11px] font-bold tracking-widest text-default-400 uppercase w-[140px]">标签</th>
                    <th className="px-3 py-3 text-left text-[11px] font-bold tracking-widest text-default-400 uppercase w-[90px]">关联</th>
                    <th className="px-3 py-3 text-right text-[11px] font-bold tracking-widest text-default-400 uppercase w-[100px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((asset) => {
                    const isOnline = asset.monitorOnline === 1;
                    const hasMonitor = !!(asset.monitorNodeUuid || asset.pikaNodeId);
                    const cpu = asset.monitorCpuUsage || 0;
                    const memPct = asset.monitorMemTotal ? ((asset.monitorMemUsed || 0) / asset.monitorMemTotal * 100) : 0;
                    const roleChip = getRoleChip(asset.role);

                    return (
                      <tr
                        key={asset.id}
                        className={`border-b border-divider/40 hover:bg-primary-50/40 dark:hover:bg-primary-50/10 transition-colors cursor-pointer group ${batchMode && selectedIds.has(asset.id) ? 'bg-primary-50/30 dark:bg-primary-50/5' : ''}`}
                        onClick={() => batchMode ? toggleSelectId(asset.id) : openDetailModal(asset.id)}
                      >
                        {batchMode && (
                          <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" className="h-4 w-4 rounded accent-primary cursor-pointer"
                              checked={selectedIds.has(asset.id)}
                              onChange={() => toggleSelectId(asset.id)} />
                          </td>
                        )}
                        {/* Server identity + purpose + sync time */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                              isOnline ? 'bg-success animate-pulse' : hasMonitor ? 'bg-danger' : 'bg-default-300'
                            }`} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                {getRegionFlag(asset.region) && <span className="text-base flex-shrink-0">{getRegionFlag(asset.region)}</span>}
                                <span className="truncate font-semibold text-[15px]">{asset.name}</span>
                                {roleChip && (
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    roleChip.color === 'primary' ? 'bg-primary-100 text-primary dark:bg-primary/20' :
                                    roleChip.color === 'warning' ? 'bg-warning-100 text-warning dark:bg-warning/20' :
                                    roleChip.color === 'success' ? 'bg-success-100 text-success dark:bg-success/20' :
                                    'bg-secondary-100 text-secondary dark:bg-secondary/20'
                                  }`}>{roleChip.text}</span>
                                )}
                                {asset.id && effectiveAlertIds.has(asset.id) && (
                                  <button
                                    className="px-2 py-0.5 rounded-md bg-danger text-white text-[10px] font-bold shadow-sm hover:bg-danger-600 active:scale-95 transition-all animate-pulse"
                                    onClick={(e) => { e.stopPropagation(); openAlertPopover(asset.id, asset.name || ''); }}
                                    title="点击查看告警详情"
                                  >告警中</button>
                                )}
                                {asset.id && !effectiveAlertIds.has(asset.id) && snoozedOnlyAlertIds.has(asset.id) && (
                                  <button
                                    className="px-2 py-0.5 rounded-md bg-default-300 text-white text-[10px] font-bold shadow-sm hover:bg-default-400 active:scale-95 transition-all"
                                    onClick={(e) => { e.stopPropagation(); openAlertPopover(asset.id, asset.name || ''); }}
                                    title="所有告警已忽略，点击管理"
                                  >已忽略</button>
                                )}
                              </div>
                              {asset.purpose && (
                                <p className="truncate text-xs text-primary-500 font-medium mt-0.5">{asset.purpose}</p>
                              )}
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="truncate text-xs text-default-400 font-mono">
                                  {asset.primaryIp || '-'}
                                  {(asset.osCategory || asset.os) ? <span className="ml-1.5 opacity-60">/ {asset.osCategory || asset.os}</span> : null}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                {asset.provider && <span className="px-1 py-0 rounded bg-default-100 text-[10px] text-default-500">{asset.provider}</span>}
                                {asset.environment && <span className="px-1 py-0 rounded bg-primary-50 text-[10px] text-primary dark:bg-primary/10">{asset.environment}</span>}
                                {asset.monitorLastSyncAt && (
                                  <span className="text-[10px] text-default-300 font-mono ml-auto">
                                    {new Date(asset.monitorLastSyncAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Telemetry - CPU/MEM bars + Net */}
                        <td className="px-3 py-3">
                          {hasMonitor && isOnline ? (
                            <div className="space-y-1">
                              <ResourceBar label="CPU" value={cpu} color={barColorClass(cpu)} />
                              <ResourceBar label="MEM" value={memPct} color={barColorClass(memPct)} />
                              <div className="flex items-center gap-2 text-xs text-default-400 font-mono">
                                <span className="text-success">&#x2193;{formatSpeed(asset.monitorNetIn)}</span>
                                <span className="text-primary">&#x2191;{formatSpeed(asset.monitorNetOut)}</span>
                              </div>
                            </div>
                          ) : hasMonitor ? (
                            <span className="text-xs text-danger font-mono font-semibold">离线</span>
                          ) : (
                            <span className="text-xs text-default-300 font-mono">-</span>
                          )}
                        </td>

                        {/* Traffic & Expire */}
                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            {asset.probeTrafficLimit && asset.probeTrafficLimit > 0 ? (
                              <div className="text-xs font-mono">
                                <span className="text-default-600">{formatFlow(asset.probeTrafficUsed)}</span>
                                <span className="text-default-400"> / {formatFlow(asset.probeTrafficLimit)}</span>
                              </div>
                            ) : null}
                            {(asset.probeExpiredAt && asset.probeExpiredAt > 0) || asset.expireDate ? (() => {
                              const expiry = (asset.probeExpiredAt && asset.probeExpiredAt > 0) ? asset.probeExpiredAt : asset.expireDate;
                              if (!expiry) return null;
                              if (isNeverExpireTs(expiry)) return <p className="text-xs font-mono text-default-400">永不到期</p>;
                              const days = Math.ceil((expiry - Date.now()) / 86400000);
                              const isExpired = days < 0;
                              const isSoon = days >= 0 && days <= 30;
                              return (
                                <p className={`text-xs font-mono ${isExpired ? 'text-danger font-semibold' : isSoon ? 'text-warning font-semibold' : 'text-default-500'}`}>
                                  {new Date(expiry).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                                  {isExpired ? ' 已过期' : ` ${days}天`}
                                </p>
                              );
                            })() : (
                              <span className="text-xs text-default-300">-</span>
                            )}
                            {/* Billing info */}
                            {(asset.billingCycle || asset.monthlyCost) && (
                              <p className="text-[10px] text-default-400">
                                {asset.billingCycle ? billingCycleLabel(asset.billingCycle) : ''}
                                {asset.billingCycle && asset.monthlyCost ? ' ' : ''}
                                {asset.monthlyCost ? `${asset.currency === 'USD' ? '$' : '¥'}${asset.monthlyCost}` : ''}
                                {(() => {
                                  const rv = calcRemainingValue(asset.expireDate, asset.monthlyCost, asset.billingCycle, asset.currency);
                                  if (rv && rv.remainingValue !== '∞' && parseFloat(rv.remainingValue) > 0) {
                                    return <span className="text-default-300"> · 余{rv.currency === 'USD' ? '$' : '¥'}{rv.remainingValue}</span>;
                                  }
                                  return null;
                                })()}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Tags + meta chips */}
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-0.5">
                            {/* User tags - colored */}
                            {(() => {
                              const tagSrc = asset.tags;
                              if (!tagSrc) return null;
                              try {
                                const arr = JSON.parse(tagSrc);
                                if (Array.isArray(arr) && arr.length > 0) {
                                  return arr.slice(0, 3).map((t: string) => (
                                    <span key={t} className="px-1.5 py-0.5 rounded-full bg-primary-100 text-[10px] text-primary-700 dark:bg-primary/15 dark:text-primary-300 font-medium">{t}</span>
                                  ));
                                }
                              } catch { /* */ }
                              return tagSrc.split(/[;,]/).filter(Boolean).slice(0, 3).map((t: string) => (
                                <span key={t} className="px-1.5 py-0.5 rounded-full bg-primary-100 text-[10px] text-primary-700 dark:bg-primary/15 dark:text-primary-300 font-medium">{t.trim()}</span>
                              ));
                            })()}
                            {/* Meta: provider, OS — muted style (region already in server column) */}
                            {asset.provider && <span className="px-1.5 py-0.5 rounded bg-default-50 text-[10px] text-default-400 border border-divider/40">{asset.provider}</span>}
                            {(asset.osCategory || asset.os) && <span className="px-1.5 py-0.5 rounded bg-default-50 text-[10px] text-default-400 border border-divider/40">{asset.osCategory || asset.os}</span>}
                            {!asset.tags && !asset.provider && !asset.osCategory && !asset.os && <span className="text-xs text-default-300">-</span>}
                          </div>
                        </td>

                        {/* Integration links */}
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-wrap items-center gap-1 text-xs">
                            {asset.monitorNodeUuid && (
                              <span className="px-1.5 py-0.5 rounded bg-primary-50 text-primary dark:bg-primary/10 text-[10px] font-semibold">K</span>
                            )}
                            {asset.pikaNodeId && (
                              <span className="px-1.5 py-0.5 rounded bg-secondary-50 text-secondary dark:bg-secondary/10 text-[10px] font-semibold">P</span>
                            )}
                            {asset.totalXuiInstances > 0 && (
                              <button type="button" onClick={() => navigate('/xui')}
                                className="px-1.5 py-0.5 rounded bg-primary-50 text-primary dark:bg-primary/10 text-[11px] font-semibold hover:bg-primary-100 transition-colors cursor-pointer">
                                {asset.totalXuiInstances} XUI
                              </button>
                            )}
                            {asset.panelUrl && (
                              <a href={asset.panelUrl} target="_blank" rel="noopener noreferrer"
                                className="px-1.5 py-0.5 rounded bg-success-50 text-success dark:bg-success/10 text-[11px] font-semibold hover:bg-success-100 transition-colors no-underline">
                                1Panel
                              </a>
                            )}
                            {asset.gostNodeName && (
                              <button type="button" onClick={() => navigate('/node')}
                                className="px-1.5 py-0.5 rounded bg-warning-50 text-warning dark:bg-warning/10 text-[11px] font-semibold hover:bg-warning-100 transition-colors cursor-pointer">
                                GOST
                              </button>
                            )}
                            {asset.totalForwards > 0 && (
                              <button type="button" onClick={() => navigate('/forward')}
                                className="px-1.5 py-0.5 rounded bg-secondary-50 text-secondary dark:bg-secondary/10 text-[11px] font-semibold hover:bg-secondary-100 transition-colors cursor-pointer">
                                {asset.totalForwards} 转发
                              </button>
                            )}
                            {!asset.monitorNodeUuid && !asset.pikaNodeId && !asset.totalXuiInstances && !asset.panelUrl && !asset.gostNodeName && !asset.totalForwards && (
                              <span className="text-default-300 font-mono">-</span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button type="button"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-default-200 text-[11px] font-medium text-default-600 hover:bg-default-100 hover:border-default-300 transition-all cursor-pointer"
                              onClick={() => openDetailModal(asset.id)}>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                              查看
                            </button>
                            {(canCreateAssets || canUpdateAssets) && (
                              <button type="button"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-primary-200 text-[11px] font-medium text-primary hover:bg-primary-50 hover:border-primary-300 transition-all cursor-pointer"
                                onClick={() => openEditModal(asset)}>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                编辑
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card Grid */}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:hidden">
            {filteredAssets.map((asset) => {
              const isOnline = asset.monitorOnline === 1;
              const hasMonitor = !!(asset.monitorNodeUuid || asset.pikaNodeId);
              const cpu = asset.monitorCpuUsage || 0;
              const memPct = asset.monitorMemTotal ? ((asset.monitorMemUsed || 0) / asset.monitorMemTotal * 100) : 0;
              const roleChip = getRoleChip(asset.role);

              return (
                <button
                  type="button"
                  key={asset.id}
                  onClick={() => openDetailModal(asset.id)}
                  className="rounded-xl border border-divider/60 bg-content1 p-3 text-left transition-all hover:border-primary/40 hover:shadow-sm"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${
                          isOnline ? 'bg-success animate-pulse' : hasMonitor ? 'bg-danger' : 'bg-default-300'
                        }`} />
                        {getRegionFlag(asset.region) && <span className="text-sm flex-shrink-0">{getRegionFlag(asset.region)}</span>}
                        <span className="truncate font-semibold text-sm">{asset.name}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-default-400 font-mono pl-3.5">
                        {asset.primaryIp || '-'}{asset.region ? ` / ${asset.region}` : ''}
                      </p>
                    </div>
                    {roleChip && (
                      <Chip size="sm" color={roleChip.color} variant="flat" className="flex-shrink-0">{roleChip.text}</Chip>
                    )}
                  </div>

                  {/* Metrics */}
                  {hasMonitor && isOnline && (
                    <div className="mt-2 space-y-0.5">
                      <ResourceBar label="CPU" value={cpu} color={barColorClass(cpu)} />
                      <ResourceBar label="MEM" value={memPct} color={barColorClass(memPct)} />
                    </div>
                  )}
                  {hasMonitor && !isOnline && (
                    <p className="mt-2 text-[11px] text-danger font-mono">离线</p>
                  )}

                  {/* Footer */}
                  <div className="mt-2 flex items-center justify-between text-[10px] text-default-400 border-t border-divider/40 pt-1.5">
                    <span>{asset.provider || '-'}{asset.monthlyCost ? ` / ${getCurrencySymbol(asset.currency || 'CNY')}${asset.monthlyCost}` : ''}</span>
                    <div className="flex gap-1.5">
                      {asset.totalXuiInstances > 0 && <span>{asset.totalXuiInstances} XUI</span>}
                      {asset.totalForwards > 0 && <span>{asset.totalForwards} 转发</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
      </>
      )}

      {/* Detail Modal - shows full asset info, probe metrics, XUI, forwards */}
      <Modal isOpen={isDetailOpen} onOpenChange={(open) => !open && onDetailClose()} size="4xl" scrollBehavior="inside">
        <ModalContent>
          {selectedAsset && (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-3 w-3 rounded-full ${selectedAsset.monitorOnline === 1 ? 'bg-success animate-pulse' : (selectedAsset.monitorNodeUuid || selectedAsset.pikaNodeId) ? 'bg-danger' : 'bg-default-300'}`} />
                  {getRegionFlag(selectedAsset.region) && <span className="text-lg">{getRegionFlag(selectedAsset.region)}</span>}
                  <span className="text-lg font-bold">{selectedAsset.name}</span>
                  {selectedAsset.label && <Chip size="sm" variant="flat">{selectedAsset.label}</Chip>}
                  {getRoleChip(selectedAsset.role) && <Chip size="sm" color={getRoleChip(selectedAsset.role)!.color} variant="flat">{getRoleChip(selectedAsset.role)!.text}</Chip>}
                </div>
                <p className="text-sm font-normal text-default-500 font-mono">{selectedAsset.primaryIp || '-'}{selectedAsset.ipv6 ? ` / ${selectedAsset.ipv6}` : ''}</p>
              </ModalHeader>
              <ModalBody className="space-y-0 px-5 pb-4">
                {detailLoading && <div className="flex justify-center py-4"><Spinner /></div>}

                {/* ── 服务关联 (inline chips) ── */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-3">
                  {/* Komari */}
                  <span className="inline-flex items-center gap-1 text-xs">
                    <span className={`h-1.5 w-1.5 rounded-full ${selectedAsset.monitorNodeUuid ? (selectedAsset.monitorOnline === 1 ? 'bg-success' : 'bg-default-300') : 'bg-default-200'}`} />
                    <span className="text-default-600 font-medium">Komari</span>
                    <span className="text-default-400">{selectedAsset.monitorNodeUuid ? (selectedAsset.monitorOnline === 1 ? '在线' : '离线') : '未装'}</span>
                  </span>
                  {/* Pika */}
                  <span className="inline-flex items-center gap-1 text-xs">
                    <span className={`h-1.5 w-1.5 rounded-full ${selectedAsset.pikaNodeId ? (selectedAsset.monitorOnline === 1 ? 'bg-success' : 'bg-default-300') : 'bg-default-200'}`} />
                    <span className="text-default-600 font-medium">Pika</span>
                    <span className="text-default-400">{selectedAsset.pikaNodeId ? (selectedAsset.monitorOnline === 1 ? '在线' : '离线') : '未装'}</span>
                  </span>
                  {/* GOST */}
                  <span className="inline-flex items-center gap-1 text-xs">
                    <span className={`h-1.5 w-1.5 rounded-full ${selectedAsset.gostNodeName ? 'bg-success' : 'bg-default-200'}`} />
                    <span className="text-default-600 font-medium">GOST</span>
                    {selectedAsset.gostNodeName
                      ? <button type="button" onClick={() => navigate('/node')} className="text-primary text-[11px] font-medium hover:underline cursor-pointer">管理</button>
                      : <span className="text-default-400">未装</span>
                    }
                  </span>
                  {/* 隧道 */}
                  <span className="inline-flex items-center gap-1 text-xs">
                    <span className="text-default-600 font-medium">隧道</span>
                    <span className="text-default-400">{(detail?.tunnels?.length ?? 0) > 0 ? `${detail!.tunnels!.length}条` : '无'}</span>
                    <button type="button" onClick={() => navigate('/tunnel')} className="text-primary text-[11px] font-medium hover:underline cursor-pointer">
                      {(detail?.tunnels?.length ?? 0) > 0 ? '管理' : '创建'}
                    </button>
                  </span>
                  {/* 转发 */}
                  <span className="inline-flex items-center gap-1 text-xs">
                    <span className="text-default-600 font-medium">转发</span>
                    <span className="text-default-400">{(detail?.forwards?.length ?? 0) > 0 ? `${detail!.forwards!.length}条` : '无'}</span>
                    {(detail?.forwards?.length ?? 0) > 0 && (
                      <button type="button" onClick={() => navigate('/forward')} className="text-primary text-[11px] font-medium hover:underline cursor-pointer">管理</button>
                    )}
                    <button type="button" onClick={() => openQuickForward(selectedAsset)} className="text-primary text-[11px] font-medium hover:underline cursor-pointer">
                      +添加
                    </button>
                  </span>
                  {/* X-UI */}
                  <span className="inline-flex items-center gap-1 text-xs">
                    <span className="text-default-600 font-medium">X-UI</span>
                    <span className="text-default-400">{(detail?.xuiInstances?.length ?? 0) > 0 ? `${detail!.xuiInstances!.length}实例` : '无'}</span>
                    {(canCreateAssets || canUpdateAssets) && (
                      <button type="button" onClick={() => { onDetailClose(); openEditModal(selectedAsset, 'services'); }} className="text-primary text-[11px] font-medium hover:underline cursor-pointer">
                        {(detail?.xuiInstances?.length ?? 0) > 0 ? '配置' : '绑定'}
                      </button>
                    )}
                  </span>
                  {/* 1Panel */}
                  <span className="inline-flex items-center gap-1 text-xs">
                    <span className="text-default-600 font-medium">1Panel</span>
                    {selectedAsset.panelUrl ? (
                      <a href={selectedAsset.panelUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-[11px] font-medium hover:underline no-underline">打开</a>
                    ) : (
                      <>
                        <span className="text-default-400">无</span>
                        {(canCreateAssets || canUpdateAssets) && (
                          <button type="button" onClick={() => { onDetailClose(); openEditModal(selectedAsset, 'services'); }} className="text-primary text-[11px] font-medium hover:underline cursor-pointer">配置</button>
                        )}
                      </>
                    )}
                  </span>
                  {/* 堡垒机 */}
                  {selectedAsset.jumpserverAssetId && (
                    <span className="inline-flex items-center gap-1 text-xs">
                      <span className="text-default-600 font-medium">堡垒机</span>
                      <Chip size="sm" variant="flat" color="success" classNames={{base: "h-4", content: "text-[10px] px-1"}}>已绑定</Chip>
                    </span>
                  )}
                  {/* 1Panel 摘要 */}
                  {selectedAsset.onePanelInstanceId && (
                    <button type="button" onClick={() => navigate(`/onepanel?instanceId=${selectedAsset.onePanelInstanceId}`)} className="text-[11px] text-warning font-medium hover:underline cursor-pointer">
                      1Panel摘要 {selectedAsset.onePanelLastReportStatus === 'success' ? '✓' : '?'}
                    </button>
                  )}
                  {/* CTA: 安装探针/GOST */}
                  {(canCreateAssets || canUpdateAssets) && (!selectedAsset.monitorNodeUuid || !selectedAsset.pikaNodeId || !selectedAsset.gostNodeId) && (
                    <button type="button" onClick={() => { onDetailClose(); openProvisionModal({ assetId: selectedAsset.id, assetName: selectedAsset.name, assetIp: selectedAsset.primaryIp || undefined, asset: selectedAsset, missingKomari: !selectedAsset.monitorNodeUuid, missingPika: !selectedAsset.pikaNodeId, missingGost: !selectedAsset.gostNodeId }); }}
                      className="ml-auto text-[11px] text-primary font-medium hover:underline cursor-pointer">
                      安装探针/GOST →
                    </button>
                  )}
                </div>

                {/* ── 基本信息 + 硬件配置 (双列无框) ── */}
                {(() => {
                  const probeNode = detail?.monitorNodes?.find(n => n.online === 1) || detail?.monitorNodes?.[0];
                  const effectiveOs = selectedAsset.os || probeNode?.os || '-';
                  const effectiveCpuCores = selectedAsset.cpuCores || probeNode?.cpuCores;
                  const effectiveCpuName = selectedAsset.cpuName || probeNode?.cpuName;
                  const effectiveMemMb = selectedAsset.memTotalMb || (probeNode?.memTotal ? Math.round(probeNode.memTotal / 1024 / 1024) : null);
                  const effectiveDiskGb = selectedAsset.diskTotalGb || (probeNode?.diskTotal ? Math.round(probeNode.diskTotal / 1024 / 1024 / 1024) : null);
                  const effectiveSwapMb = selectedAsset.swapTotalMb || (probeNode?.swapTotal ? Math.round(probeNode.swapTotal / 1024 / 1024) : null);
                  const effectiveArch = selectedAsset.arch || probeNode?.arch;
                  const effectiveVirt = selectedAsset.virtualization || probeNode?.virtualization;
                  // unified row component
                  const R = ({ k, v, cls }: { k: string; v: React.ReactNode; cls?: string }) => (
                    <p className="flex justify-between text-xs"><span className="text-default-400">{k}</span><span className={`font-mono text-right max-w-[65%] truncate ${cls || ''}`}>{v}</span></p>
                  );
                  return (
                    <div className="grid grid-cols-2 gap-x-8 border-t border-divider/40 pt-3">
                      {/* 左列：基本信息 */}
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-default-500 mb-1">基本信息</p>
                        {selectedAsset.provider && <R k="厂商" v={selectedAsset.provider} />}
                        {selectedAsset.region && <R k="地区" v={`${getRegionFlag(selectedAsset.region)} ${selectedAsset.region}`} />}
                        {selectedAsset.environment && <R k="环境" v={selectedAsset.environment} />}
                        {selectedAsset.purpose && <R k="用途" v={selectedAsset.purpose} cls="text-primary font-medium" />}
                        {selectedAsset.bandwidthMbps && <R k="带宽" v={`${selectedAsset.bandwidthMbps} Mbps`} />}
                        {selectedAsset.monthlyTrafficGb && <R k="月流量" v={selectedAsset.monthlyTrafficGb === -1 ? '不限量' : `${selectedAsset.monthlyTrafficGb >= 1024 ? (selectedAsset.monthlyTrafficGb / 1024).toFixed(1) + ' TB' : selectedAsset.monthlyTrafficGb + ' GB'}/月`} />}
                        <R k="SSH" v={selectedAsset.sshPort || 22} />
                        {/* 费用 */}
                        {(selectedAsset.monthlyCost || selectedAsset.expireDate) && (
                          <div className="pt-1.5 mt-1 border-t border-divider/30 space-y-1.5">
                            {selectedAsset.monthlyCost && <R k="费用" v={`${getCurrencySymbol(selectedAsset.currency || 'CNY')}${selectedAsset.monthlyCost}/${formatBillingCycle(selectedAsset.billingCycle) || '周期'}`} />}
                            {selectedAsset.purchaseDate && <R k="购买" v={formatDateShort(selectedAsset.purchaseDate)} />}
                            {selectedAsset.expireDate && <R k="到期" v={formatDateShort(selectedAsset.expireDate)} cls={selectedAsset.expireDate !== -1 && selectedAsset.expireDate < Date.now() + 30 * 86400000 ? 'text-warning font-semibold' : ''} />}
                            {(() => { const rv = calcRemainingValue(selectedAsset.expireDate, selectedAsset.monthlyCost, selectedAsset.billingCycle, selectedAsset.currency); return rv ? <R k="剩余价值" v={`${rv.currency}${rv.remainingValue}`} cls="text-primary font-semibold" /> : null; })()}
                          </div>
                        )}
                      </div>
                      {/* 右列：硬件配置 */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-semibold text-default-500">硬件配置</p>
                          <div className="flex items-center gap-1">
                            {selectedAsset.probeSource && <Chip size="sm" variant="dot" color={selectedAsset.probeSource === 'dual' ? 'warning' : 'primary'} classNames={{content: "text-[10px]"}}>{selectedAsset.probeSource === 'dual' ? '双探针' : selectedAsset.probeSource === 'komari' ? 'Komari' : selectedAsset.probeSource === 'pika' ? 'Pika' : selectedAsset.probeSource}</Chip>}
                            {!selectedAsset.probeSource && selectedAsset.monitorNodeUuid && <Chip size="sm" variant="flat" color="primary" classNames={{content: "text-[10px]"}}>Komari</Chip>}
                            {!selectedAsset.probeSource && selectedAsset.pikaNodeId && <Chip size="sm" variant="flat" color="secondary" classNames={{content: "text-[10px]"}}>Pika</Chip>}
                          </div>
                        </div>
                        <R k="系统" v={effectiveOs} />
                        {effectiveCpuCores && <R k="CPU" v={`${effectiveCpuCores} 核${effectiveCpuName ? ` (${effectiveCpuName})` : ''}`} />}
                        {effectiveMemMb && <R k="内存" v={`${effectiveMemMb} MB`} />}
                        {effectiveDiskGb && <R k="硬盘" v={`${effectiveDiskGb} GB`} />}
                        {effectiveSwapMb && Number(effectiveSwapMb) > 0 && <R k="Swap" v={`${effectiveSwapMb} MB`} />}
                        {effectiveArch && <R k="架构" v={effectiveArch} />}
                        {effectiveVirt && <R k="虚拟化" v={effectiveVirt} />}
                        {probeNode?.kernelVersion && <R k="内核" v={probeNode.kernelVersion} />}
                        {probeNode?.gpuName && probeNode.gpuName !== 'None' && <R k="GPU" v={probeNode.gpuName} />}
                        {selectedAsset.monitorLastSyncAt && (
                          <p className="text-[11px] text-default-400 pt-1">同步于 {new Date(selectedAsset.monitorLastSyncAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ── 告警 (一行) ── */}
                {selectedAsset.id && (effectiveAlertIds.has(selectedAsset.id) || snoozedOnlyAlertIds.has(selectedAsset.id)) && (() => {
                  const assetAlerts = allAlertsBrief.filter(a => a.assetId === selectedAsset.id);
                  const activeCount = assetAlerts.filter(a => !isSnoozed(a.ruleId, a.nodeId)).length;
                  const snoozedCount = assetAlerts.filter(a => !!isSnoozed(a.ruleId, a.nodeId)).length;
                  const criticalCount = assetAlerts.filter(a => a.severity === 'critical' && !isSnoozed(a.ruleId, a.nodeId)).length;
                  const warningCount = assetAlerts.filter(a => a.severity === 'warning' && !isSnoozed(a.ruleId, a.nodeId)).length;
                  return (
                    <button type="button" onClick={() => openAlertPopover(selectedAsset.id!, selectedAsset.name || '')}
                      className="w-full flex items-center gap-2 border-t border-divider/40 pt-3 mt-3 cursor-pointer text-left hover:opacity-80">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${activeCount > 0 ? 'bg-danger animate-pulse' : 'bg-default-300'}`} />
                      <span className="text-xs font-semibold text-default-500">告警</span>
                      {criticalCount > 0 && <Chip size="sm" variant="flat" color="danger" classNames={{base: "h-4", content: "text-[10px] px-1"}}>严重 {criticalCount}</Chip>}
                      {warningCount > 0 && <Chip size="sm" variant="flat" color="warning" classNames={{base: "h-4", content: "text-[10px] px-1"}}>警告 {warningCount}</Chip>}
                      {snoozedCount > 0 && <Chip size="sm" variant="flat" color="default" classNames={{base: "h-4", content: "text-[10px] px-1"}}>已忽略 {snoozedCount}</Chip>}
                      <span className="ml-auto text-[11px] text-primary font-medium">查看详情 →</span>
                    </button>
                  );
                })()}

                {/* ── 备注 ── */}
                {selectedAsset.remark && (
                  <div className="border-t border-divider/40 pt-2 mt-3 text-xs">
                    <span className="text-default-400">备注：</span><span className="text-default-600">{selectedAsset.remark}</span>
                  </div>
                )}

                {/* ── 隧道/转发/X-UI 明细 ── */}
                {((detail?.tunnels?.length ?? 0) > 0 || (detail?.forwards?.length ?? 0) > 0 || (detail?.xuiInstances?.length ?? 0) > 0) && (
                  <div className="border-t border-divider/40 pt-3 mt-3 space-y-1">
                    <p className="text-xs font-semibold text-default-500 mb-1">端点明细</p>
                    {detail?.tunnels?.map((tun) => (
                      <div key={`tun-${tun.id}`} className="flex items-center gap-2 text-xs">
                        <Chip size="sm" variant="flat" color="primary" classNames={{base: "h-4", content: "text-[10px] px-1"}}>
                          {tun.type === 1 ? '端口' : '隧道'}
                        </Chip>
                        <span className="font-mono text-default-500">{tun.inNodeName}</span>
                        {tun.outNodeName && <><span className="text-default-300">→</span><span className="font-mono text-default-500">{tun.outNodeName}</span></>}
                        {tun.protocol && <span className="text-default-400 text-[11px]">{tun.protocol.toUpperCase()}</span>}
                        <span className="text-default-400">{tun.forwardCount}条转发</span>
                        <Chip size="sm" variant="flat" color={tun.role === 'source' ? 'success' : 'warning'} classNames={{base: "h-4", content: "text-[10px] px-1"}}>
                          {tun.role === 'source' ? '入口' : '出口'}
                        </Chip>
                      </div>
                    ))}
                    {detail?.forwards?.map((fwd) => (
                      <div key={fwd.id} className="flex items-center gap-2 text-xs">
                        <Chip size="sm" variant="flat" color={fwd.status === 1 ? 'success' : fwd.status === 0 ? 'warning' : 'danger'} classNames={{base: "h-4", content: "text-[10px] px-1"}}>
                          {fwd.status === 1 ? '转发' : fwd.status === 0 ? '暂停' : '异常'}
                        </Chip>
                        <span className="font-mono text-default-500">{selectedAsset.primaryIp}</span>
                        <span className="text-default-300">→</span>
                        <span className="font-mono text-default-400 truncate max-w-40">{fwd.remoteAddr || '?'}</span>
                        {fwd.name && <span className="text-default-400 truncate max-w-24">{fwd.name}</span>}
                        {fwd.matchType === 'ip_match' && <Chip size="sm" variant="flat" color="default" classNames={{base: "h-4", content: "text-[10px] px-1"}}>IP匹配</Chip>}
                        {fwd.remoteSourceProtocol && <span className="text-default-400 text-[11px]">{fwd.remoteSourceProtocol}</span>}
                      </div>
                    ))}
                    {detail?.xuiInstances?.map((inst) => {
                      const syncChip = getStatusChip(inst.lastSyncStatus);
                      const instUrl = buildInstanceAddress(inst);
                      return (
                        <div key={inst.id} className="flex items-center gap-2 text-xs">
                          <Chip size="sm" color={syncChip.color} variant="flat" classNames={{base: "h-4", content: "text-[10px] px-1"}}>{syncChip.text}</Chip>
                          <span className="font-mono text-default-500 truncate max-w-32">{inst.name}</span>
                          <span className="text-default-400 font-mono">{inst.inboundCount || 0}入/{inst.clientCount || 0}客</span>
                          <a href={instUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary font-medium hover:underline no-underline">后台</a>
                        </div>
                      );
                    })}
                    {detail?.protocolSummaries?.map((p) => (
                      <div key={p.protocol} className="flex items-center gap-2 text-xs">
                        <Chip size="sm" variant="flat" color="secondary" classNames={{base: "h-4", content: "text-[10px] px-1"}}>{p.protocol.toUpperCase()}</Chip>
                        <span className="font-mono text-default-400">{p.inboundCount}入站/{p.clientCount}客户端({p.onlineClientCount}在线)</span>
                        {p.allTime ? <span className="font-mono text-default-400">{formatFlow(p.allTime)}</span> : null}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── 探针指标 ── */}
                {detail?.monitorNodes && detail.monitorNodes.length > 0 && (
                  <div className="border-t border-divider/40 pt-3 mt-3">
                    <p className="text-xs font-semibold text-default-500 mb-2">探针指标</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {detail.monitorNodes.map((node: MonitorNodeSnapshot) => {
                        const m = node.latestMetric;
                        const memPct = m?.memTotal ? ((m.memUsed || 0) / m.memTotal * 100) : 0;
                        const diskPct = m?.diskTotal ? ((m.diskUsed || 0) / m.diskTotal * 100) : 0;
                        const swapPct = m?.swapTotal ? ((m.swapUsed || 0) / m.swapTotal * 100) : 0;
                        return (
                          <div key={node.id} className={`rounded-lg border p-2.5 ${node.online === 1 ? 'border-divider/50' : 'border-danger/20 bg-danger-50/10'}`}>
                            {/* Header: name + type + version + delete */}
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${node.online === 1 ? 'bg-success' : 'bg-danger'}`} />
                              <span className="truncate text-xs font-semibold">{node.name || node.remoteNodeUuid.slice(0, 8)}</span>
                              <Chip size="sm" variant="flat" color={node.instanceType === 'pika' ? 'secondary' : 'primary'} classNames={{base: "h-4", content: "text-[10px] px-1"}}>
                                {node.instanceType === 'pika' ? 'Pika' : 'Komari'}
                              </Chip>
                              <span className="text-[11px] font-mono text-default-400 ml-auto">v{node.version || '?'}</span>
                              <button className="text-[11px] text-danger hover:text-danger-600 cursor-pointer ml-1" title="删除此探针节点"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!confirm(`删除探针节点「${node.name || node.remoteNodeUuid.slice(0, 8)}」？`)) return;
                                  try {
                                    const res = await deleteMonitorNode(node.id);
                                    if (res.code === 0) { toast.success('已删除'); if (expandedAssetId) void loadAssetDetail(expandedAssetId); void loadAssets(); }
                                    else toast.error(res.msg || '删除失败');
                                  } catch { toast.error('删除失败'); }
                                }}>&times;</button>
                            </div>

                            {m && node.online === 1 ? (
                              <>
                                {/* Resource bars — 2 per row */}
                                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                                  <div className="flex items-center gap-1">
                                    <span className="w-7 text-[11px] text-default-400">CPU</span>
                                    <Progress size="sm" value={m.cpuUsage || 0} color={barColorHero(m.cpuUsage || 0)} className="flex-1" aria-label="CPU" />
                                    <span className="w-8 text-right text-[11px] font-mono">{(m.cpuUsage || 0).toFixed(0)}%</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="w-7 text-[11px] text-default-400">MEM</span>
                                    <Progress size="sm" value={memPct} color={barColorHero(memPct)} className="flex-1" aria-label="MEM" />
                                    <span className="w-8 text-right text-[11px] font-mono">{memPct.toFixed(0)}%</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="w-7 text-[11px] text-default-400">DISK</span>
                                    <Progress size="sm" value={diskPct} color={barColorHero(diskPct)} className="flex-1" aria-label="DISK" />
                                    <span className="w-8 text-right text-[11px] font-mono">{diskPct.toFixed(0)}%</span>
                                  </div>
                                  {m.swapTotal && m.swapTotal > 0 ? (
                                    <div className="flex items-center gap-1">
                                      <span className="w-7 text-[11px] text-default-400">SWAP</span>
                                      <Progress size="sm" value={swapPct} color={barColorHero(swapPct)} className="flex-1" aria-label="SWAP" />
                                      <span className="w-8 text-right text-[11px] font-mono">{swapPct.toFixed(0)}%</span>
                                    </div>
                                  ) : (m.gpuUsage != null && m.gpuUsage > 0) ? (
                                    <div className="flex items-center gap-1">
                                      <span className="w-7 text-[11px] text-default-400">GPU</span>
                                      <Progress size="sm" value={m.gpuUsage} color={barColorHero(m.gpuUsage)} className="flex-1" aria-label="GPU" />
                                      <span className="w-8 text-right text-[11px] font-mono">{m.gpuUsage.toFixed(0)}%</span>
                                    </div>
                                  ) : null}
                                </div>
                                {/* One-line stats */}
                                <div className="flex flex-wrap gap-x-3 mt-1 text-[11px] text-default-400 font-mono">
                                  <span>↓{formatSpeed(m.netIn)}</span>
                                  <span>↑{formatSpeed(m.netOut)}</span>
                                  <span>UP {formatUptime(m.uptime)}</span>
                                  <span>LOAD {m.load1?.toFixed(2) || '-'}</span>
                                  {(m.connections || 0) > 0 && <span>TCP {m.connections}</span>}
                                  {((m.netTotalDown && m.netTotalDown > 0) || (m.netTotalUp && m.netTotalUp > 0)) && (
                                    <span>总量 ↓{formatFlow(m.netTotalDown)} ↑{formatFlow(m.netTotalUp)}</span>
                                  )}
                                </div>
                                {/* Traffic quota (Pika) */}
                                {node.trafficLimit && node.trafficLimit > 0 && (
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[11px] text-default-400 font-mono">
                                      配额 {formatFlow(node.trafficUsed)}/{formatFlow(node.trafficLimit)}
                                    </span>
                                    <Progress size="sm" value={node.trafficLimit > 0 ? ((node.trafficUsed || 0) / node.trafficLimit * 100) : 0}
                                      color={node.trafficLimit > 0 && (node.trafficUsed || 0) / node.trafficLimit > 0.9 ? 'danger' : 'primary'}
                                      className="flex-1 max-w-16" aria-label="Traffic" />
                                  </div>
                                )}
                              </>
                            ) : (
                              <p className="text-xs text-danger font-mono py-1">连接断开</p>
                            )}
                            {/* Probe extra: tags / expiry */}
                            {((node.tags) || (node.expiredAt && node.expiredAt > 0)) && (
                              <div className="mt-1 pt-1 border-t border-divider/30 text-[11px] text-default-400 font-mono">
                                {node.expiredAt && node.expiredAt > 0 && (
                                  <span className={node.expiredAt < Date.now() ? 'text-danger' : ''}>
                                    到期 {new Date(node.expiredAt).toLocaleDateString('zh-CN')}
                                    {node.expiredAt < Date.now() ? ' (已过期)' : ` (${Math.ceil((node.expiredAt - Date.now()) / 86400000)}天)`}
                                  </span>
                                )}
                                {node.tags && <span className="ml-2 truncate">标签: {(() => { try { return JSON.parse(node.tags).join(', '); } catch { return node.tags; } })()}</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter className="flex-wrap gap-1">
                {jsEnabled && (
                  <Button size="sm" variant="flat" color="success" isLoading={jsConnecting} onPress={async () => {
                    if (!selectedAsset.jumpserverAssetId) {
                      setJsBindPromptOpen(true);
                      return;
                    }
                    setJsConnecting(true);
                    try {
                      const res = await jumpServerConnect(selectedAsset.id);
                      if (res.code === 0 && res.data?.url) {
                        window.open(res.data.url, '_blank');
                      } else {
                        const fallbackId = res.data?.jsAssetId || selectedAsset.jumpserverAssetId;
                        if (jsUrl && fallbackId) {
                          window.open(jsUrl.replace(/\/+$/, '') + `/luna/admin-connect?asset=${fallbackId}`, '_blank');
                          toast('后端无法直连 JumpServer（可能跨网络），已跳转到堡垒机终端连接页面', { icon: 'ℹ️', duration: 6000 });
                        } else {
                          toast.error(res.msg || '连接失败，请检查 JumpServer 配置');
                        }
                      }
                    } catch {
                      const fallbackId = selectedAsset.jumpserverAssetId;
                      if (jsUrl && fallbackId) {
                        window.open(jsUrl.replace(/\/+$/, '') + `/luna/admin-connect?asset=${fallbackId}`, '_blank');
                        toast('后端无法连接 JumpServer（跨网络），已跳转到堡垒机终端连接页面', { icon: 'ℹ️', duration: 6000 });
                      } else {
                        toast.error('连接异常，且未配置 JumpServer 地址');
                      }
                    } finally { setJsConnecting(false); }
                  }}>终端登录</Button>
                )}
                {(canUpdateAssets) && <Button size="sm" variant="flat" color="primary" onPress={() => { onDetailClose(); openEditModal(selectedAsset); }}>编辑</Button>}
                {(canDeleteAssets) && archiveConfirmId === selectedAsset.id ? (
                  <>
                    <Button size="sm" variant="flat" color="warning" onPress={() => handleArchiveAsset(selectedAsset.id)}>确认归档</Button>
                    <Button size="sm" variant="light" onPress={() => setArchiveConfirmId(null)}>取消</Button>
                  </>
                ) : (canDeleteAssets) && (
                  <Button size="sm" variant="light" onPress={() => setArchiveConfirmId(selectedAsset.id)}>归档</Button>
                )}
                {(canDeleteAssets) && <Button size="sm" variant="flat" color="danger" onPress={() => { onDetailClose(); openDeleteModal(selectedAsset); }}>删除</Button>}
                <Button size="sm" color="primary" onPress={onDetailClose}>关闭</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* ── 快速创建转发弹窗 ── */}
      <Modal isOpen={isQuickFwdOpen} onOpenChange={(open) => !open && onQuickFwdClose()} size="lg">
        <ModalContent>
          <ModalHeader>快速创建转发</ModalHeader>
          <ModalBody className="space-y-3">
            {quickFwdAsset && (
              <>
                <div className="text-xs text-default-400">
                  入口节点：<span className="text-default-600 font-mono">{quickFwdAsset.gostNodeName || `Node#${quickFwdAsset.gostNodeId}`}</span>
                  <span className="ml-2">({quickFwdAsset.primaryIp})</span>
                </div>

                {quickFwdTunnels.length === 0 ? (
                  <div className="rounded-lg bg-warning-50 p-3 text-sm text-warning-700 space-y-1">
                    <p>该节点暂无可用隧道，请先创建隧道。</p>
                    <Button size="sm" variant="flat" color="warning" onPress={() => { onQuickFwdClose(); navigate('/tunnel'); }}>
                      前往隧道管理 →
                    </Button>
                  </div>
                ) : (
                  <>
                    <Select
                      label="选择隧道"
                      size="sm"
                      selectedKeys={quickFwdTunnelId ? [String(quickFwdTunnelId)] : []}
                      onSelectionChange={(keys) => {
                        const v = Array.from(keys)[0];
                        setQuickFwdTunnelId(v ? Number(v) : null);
                      }}
                    >
                      {quickFwdTunnels.map((t) => (
                        <SelectItem key={String(t.id)} textValue={t.name}>
                          {t.name} ({t.type === 1 ? '端口转发' : '隧道转发'})
                        </SelectItem>
                      ))}
                    </Select>

                    <Input
                      label="转发名称"
                      size="sm"
                      value={quickFwdName}
                      onValueChange={setQuickFwdName}
                      placeholder="如: us-proxy-443"
                    />

                    <Textarea
                      label="目标地址"
                      size="sm"
                      value={quickFwdRemoteAddr}
                      onValueChange={setQuickFwdRemoteAddr}
                      placeholder="IP:端口 或 域名:端口，如 192.168.1.100:443"
                      description="多个地址换行分隔，支持负载均衡"
                      minRows={2}
                    />
                  </>
                )}
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="light" onPress={onQuickFwdClose}>取消</Button>
            {quickFwdTunnels.length > 0 && (
              <Button size="sm" color="primary" isLoading={quickFwdLoading} onPress={submitQuickForward}>
                创建转发
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* JumpServer 资产绑定提示弹窗 */}
      <Modal isOpen={jsBindPromptOpen} onOpenChange={(open) => !open && setJsBindPromptOpen(false)} size="md">
        <ModalContent>
          <ModalHeader className="text-warning-600">终端登录 - 需要绑定 JumpServer 资产</ModalHeader>
          <ModalBody className="space-y-3 text-sm">
            <p>当前资产尚未绑定 JumpServer 资产 ID，无法直接终端登录。</p>
            <div className="rounded-lg bg-default-50 p-3 space-y-1.5 text-default-600 text-[12px]">
              <p><strong>如何绑定？</strong></p>
              <p>1. 点击下方「前往编辑」按钮，在编辑页面的 JumpServer 堡垒机 区域填入资产 UUID</p>
              <p>2. 或点击「按 IP 自动匹配」让系统尝试查找（需后端能连通 JumpServer）</p>
              <p><strong>为什么需要绑定？</strong></p>
              <p>绑定后系统可精确定位到 JumpServer 中的对应主机，实现一键终端登录或跨网络跳转到堡垒机资产页面。未绑定时无法确定目标资产。</p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="light" onPress={() => setJsBindPromptOpen(false)}>取消</Button>
            <Button size="sm" color="primary" onPress={() => {
              setJsBindPromptOpen(false);
              if (selectedAsset) {
                onDetailClose();
                openEditModal(selectedAsset);
              }
            }}>前往编辑</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={onePanelBootstrapOpen} onOpenChange={(open) => !open && setOnePanelBootstrapOpen(false)} size="4xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>1Panel Exporter 安装参数</ModalHeader>
          <ModalBody className="space-y-4">
            <Card className="border border-warning/20 bg-warning-50/50">
              <CardBody className="gap-2 p-4 text-sm text-warning-800">
                <p>Node Token 只展示一次。1Panel 管理员 API Key 只保留在服务器本机，不进入 Flux。</p>
              </CardBody>
            </Card>
            <Input
              label="Node Token"
              value={onePanelBootstrap?.nodeToken || ''}
              readOnly
              endContent={<Button size="sm" variant="light" onPress={() => copyToClipboard(onePanelBootstrap?.nodeToken || '')}>复制</Button>}
            />
            <Textarea
              label="环境变量模板"
              minRows={12}
              value={onePanelBootstrap?.envTemplate || ''}
              readOnly
            />
            <div className="flex justify-end">
              <Button size="sm" variant="flat" onPress={() => copyToClipboard(onePanelBootstrap?.envTemplate || '')}>
                复制环境变量模板
              </Button>
            </div>
            <Textarea
              label="安装提示"
              minRows={7}
              value={onePanelBootstrap?.installSnippet || ''}
              readOnly
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setOnePanelBootstrapOpen(false)}>关闭</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Create/Edit Modal */}
      <Modal isOpen={isFormOpen} onOpenChange={(open) => {
        if (!open) {
          const current = JSON.stringify({
            name: form.name, primaryIp: form.primaryIp, provider: form.provider,
            region: form.region, monthlyCost: form.monthlyCost, tags: form.tags,
            purpose: form.purpose, remark: form.remark, label: form.label,
          });
          if (current !== formSnapshotRef.current && !window.confirm('表单已修改，确定要放弃更改吗？')) return;
          onFormClose();
        }
      }} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{isEdit ? '编辑资产' : '新建资产'}</ModalHeader>
          <ModalBody className="px-3 pb-2">
            {(() => {
              const hasBoundProbe = !!(form.monitorNodeUuid || form.pikaNodeId);
              const editingAsset = isEdit ? assets.find(a => a.id === form.id) : null;
              const hasKomari = !!form.monitorNodeUuid;
              const hasPika = !!form.pikaNodeId;
              const hasXui = (editingAsset?.totalXuiInstances || 0) > 0;
              const hasPanel = !!form.panelUrl;

              // Count missing services for badge
              const hasGost = !!form.gostNodeId;
              const missingCount = (isEdit ? [!hasKomari || !hasPika, !hasXui, !hasPanel, !hasGost].filter(Boolean).length : 0);

              return (
                <Tabs
                  selectedKey={isEdit ? editTab : 'basic'}
                  onSelectionChange={(key) => setEditTab(key as string)}
                  variant="solid"
                  size="sm"
                  color="primary"
                  classNames={{
                    tabList: "gap-1 px-1 py-1 bg-default-100 dark:bg-default-50/20 rounded-xl",
                    tab: "rounded-lg px-4 py-1.5 text-xs font-semibold data-[selected=true]:shadow-sm",
                    cursor: "rounded-lg",
                    panel: "pt-4 px-0",
                  }}
                >
                  {/* ===== Tab 1: Basic Info ===== */}
                  <Tab key="basic" title="基本信息">
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-5">
                        <Input size="sm" label="名称" placeholder="HK-VPS-01" value={form.name}
                          onValueChange={(v) => setForm(p => ({ ...p, name: v }))} isInvalid={!!errors.name} errorMessage={errors.name} isRequired />
                        <Input size="sm" label="标识" placeholder="hk-01" value={form.label}
                          onValueChange={(v) => setForm(p => ({ ...p, label: v }))}
                          description="唯一标识，可用于探针推送" />
                        <Input size="sm" label="主 IP / 域名" value={form.primaryIp}
                          onValueChange={(v) => setForm(p => ({ ...p, primaryIp: v }))} />
                        <Select size="sm" label="角色" selectedKeys={form.role ? [form.role] : []}
                          onSelectionChange={(keys) => setForm(p => ({ ...p, role: Array.from(keys)[0]?.toString() || '' }))}>
                          {ROLES.map(r => <SelectItem key={r.key}>{r.label}</SelectItem>)}
                        </Select>
                        <Input size="sm" label="SSH 端口" type="number" placeholder="22" value={form.sshPort}
                          onValueChange={(v) => setForm(p => ({ ...p, sshPort: v }))} />
                      </div>

                      <div className="grid gap-3 md:grid-cols-4">
                        {form.provider && !allProviderOptions.some(p => p.key === form.provider) ? (
                          <div className="flex items-end gap-1">
                            <Input size="sm" label="供应商 (自定义)" value={form.provider} className="flex-1"
                              onValueChange={(v) => setForm(p => ({ ...p, provider: v }))} />
                            <Button size="sm" variant="flat" className="h-8 min-w-8" onPress={() => setForm(p => ({ ...p, provider: '' }))} title="切换为选择">
                              ...
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-end gap-1">
                            <Select size="sm" label="供应商" className="flex-1" selectedKeys={form.provider ? [form.provider] : []}
                              onSelectionChange={(keys) => {
                                const v = Array.from(keys)[0]?.toString() || '';
                                if (v === '__custom__') {
                                  setForm(p => ({ ...p, provider: '' }));
                                  // Switch to custom input mode by setting a placeholder
                                  setTimeout(() => setForm(p => ({ ...p, provider: ' ' })), 0);
                                } else {
                                  setForm(p => ({ ...p, provider: v }));
                                }
                              }}>
                              {[...allProviderOptions.map(p => <SelectItem key={p.key}>{p.label}</SelectItem>),
                                <SelectItem key="__custom__">+ 自定义输入...</SelectItem>]}
                            </Select>
                          </div>
                        )}
                        <div className="flex items-end gap-1">
                          <Select size="sm" label="地区" className="flex-1" selectedKeys={form.region ? [form.region] : []}
                            onSelectionChange={(keys) => setForm(p => ({ ...p, region: Array.from(keys)[0]?.toString() || '' }))}>
                            {REGIONS.map(r => <SelectItem key={r.key}>{r.flag ? `${r.flag} ${r.label}` : r.label}</SelectItem>)}
                          </Select>
                          <Button size="sm" variant="flat" isIconOnly isLoading={geoLoading} isDisabled={!form.primaryIp.trim()}
                            className="h-8 w-8 min-w-8" onPress={handleGeolocate} title="根据 IP 自动识别地区">
                            📍
                          </Button>
                        </div>
                        {form.environment && !allEnvironmentOptions.some(e => e.key === form.environment) ? (
                          <div className="flex items-end gap-1">
                            <Input size="sm" label="环境 (自定义)" value={form.environment} className="flex-1"
                              onValueChange={(v) => setForm(p => ({ ...p, environment: v }))} />
                            <Button size="sm" variant="flat" className="h-8 min-w-8" onPress={() => setForm(p => ({ ...p, environment: '' }))} title="切换为选择">
                              ...
                            </Button>
                          </div>
                        ) : (
                          <Select size="sm" label="环境" selectedKeys={form.environment ? [form.environment] : []}
                            onSelectionChange={(keys) => {
                              const v = Array.from(keys)[0]?.toString() || '';
                              if (v === '__custom__') {
                                setForm(p => ({ ...p, environment: '' }));
                                setTimeout(() => setForm(p => ({ ...p, environment: ' ' })), 0);
                              } else {
                                setForm(p => ({ ...p, environment: v }));
                              }
                            }}>
                            {[...allEnvironmentOptions.map(e => <SelectItem key={e.key}>{e.label}</SelectItem>),
                              <SelectItem key="__custom__">+ 自定义输入...</SelectItem>]}
                          </Select>
                        )}
                      </div>

                      {/* Cost row */}
                      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
                        <DatePicker size="sm" label="购买日期" granularity="day"
                          popoverProps={{ placement: "bottom" }}
                          value={form.purchaseDate ? parseDate(form.purchaseDate) : null}
                          onChange={d => setForm(p => ({ ...p, purchaseDate: d ? `${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}` : '' }))} />
                        {form.expireDate === 'never' ? (
                          <Input size="sm" label="到期" value="永不到期" isReadOnly
                            classNames={{ input: "text-success font-medium" }}
                            endContent={
                              <Button size="sm" isIconOnly variant="solid" color="success" className="min-w-6 w-6 h-6"
                                title="取消永久"
                                onPress={() => setForm(p => ({ ...p, expireDate: '' }))}>
                                ∞
                              </Button>
                            } />
                        ) : (
                          <div className="relative">
                            <DatePicker size="sm" label="到期日期" granularity="day"
                              popoverProps={{ placement: "bottom" }}
                              value={form.expireDate ? parseDate(form.expireDate) : null}
                              onChange={d => setForm(p => ({ ...p, expireDate: d ? `${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}` : '' }))} />
                            <Button size="sm" isIconOnly variant="flat" color="default" className="absolute right-8 top-1/2 -translate-y-1/2 min-w-6 w-6 h-6 z-10"
                              title="设为永不到期"
                              onPress={() => setForm(p => ({ ...p, expireDate: 'never' }))}>
                              ∞
                            </Button>
                          </div>
                        )}
                        <Select size="sm" label="付费周期" selectedKeys={form.billingCycle ? [form.billingCycle] : []}
                          onSelectionChange={(keys) => setForm(p => ({ ...p, billingCycle: Array.from(keys)[0]?.toString() || '' }))}>
                          {BILLING_CYCLES.filter(c => c.key).map(c => <SelectItem key={c.key}>{c.label}</SelectItem>)}
                        </Select>
                        <Input size="sm" label="周期费用" placeholder="10.00" value={form.monthlyCost}
                          onValueChange={(v) => setForm(p => ({ ...p, monthlyCost: v }))} />
                        <Select size="sm" label="币种" selectedKeys={form.currency ? [form.currency] : ['CNY']}
                          onSelectionChange={(keys) => setForm(p => ({ ...p, currency: Array.from(keys)[0]?.toString() || 'CNY' }))}>
                          {CURRENCIES.map(c => <SelectItem key={c.key}>{c.label}</SelectItem>)}
                        </Select>
                      </div>

                      {/* Cost breakdown + Remaining value hint */}
                      {(() => {
                        const b = calcCostBreakdown(form.monthlyCost, form.billingCycle, form.currency);
                        const rv = form.expireDate === 'never' ? null : calcRemainingValue(
                          dateInputToTs(form.expireDate),
                          form.monthlyCost,
                          form.billingCycle ? parseInt(form.billingCycle) : null,
                          form.currency,
                        );
                        if (!b && !rv) return null;
                        return (
                          <div className="rounded-lg bg-default-100/60 dark:bg-default-50/10 px-3 py-1.5 text-xs text-default-500 text-right">
                            {b && <>日均 <span className="font-semibold text-default-700">{b.currency} {b.dailyCost}</span>
                              <span className="mx-1.5">·</span>年化 <span className="font-semibold text-default-700">{b.currency} {b.yearlyCost}</span></>}
                            {b && rv && <span className="mx-1.5">·</span>}
                            {rv && <>剩余 <span className="font-semibold text-default-700">{rv.remainingDays}</span> 天，
                              价值约 <span className="font-semibold text-primary">{rv.currency}{rv.remainingValue}</span></>}
                          </div>
                        );
                      })()}

                      <div className="grid gap-3 md:grid-cols-3">
                        <Input size="sm" label="核心用途" placeholder="Nginx反代 / 博客站 / MC服务器" value={form.purpose}
                          onValueChange={(v) => setForm(p => ({ ...p, purpose: v }))} />
                        <Input size="sm" label="带宽 (Mbps)" type="number" value={form.bandwidthMbps}
                          onValueChange={(v) => setForm(p => ({ ...p, bandwidthMbps: v }))} />
                        {form.monthlyTrafficGb === '-1' ? (
                          <Input size="sm" label="月流量" value="不限量" isReadOnly
                            classNames={{ input: "text-success font-medium" }}
                            endContent={
                              <Button size="sm" isIconOnly variant="solid" color="success" className="min-w-6 w-6 h-6"
                                title="取消不限量"
                                onPress={() => setForm(p => ({ ...p, monthlyTrafficGb: '' }))}>
                                ∞
                              </Button>
                            } />
                        ) : (
                          <Input size="sm" label="月流量 (GB)" type="number"
                            value={form.monthlyTrafficGb}
                            onValueChange={(v) => setForm(p => ({ ...p, monthlyTrafficGb: v }))}
                            endContent={
                              <Button size="sm" isIconOnly variant="flat" color="default" className="min-w-6 w-6 h-6"
                                title="设为不限量"
                                onPress={() => setForm(p => ({ ...p, monthlyTrafficGb: '-1' }))}>
                                ∞
                              </Button>
                            } />
                        )}
                      </div>

                      {/* Tag chip input */}
                      <div>
                        <p className="text-xs font-medium text-default-600 mb-1.5">标签</p>
                        <div className="flex flex-wrap gap-1.5 min-h-[32px] rounded-lg border border-default-200 bg-default-100/50 dark:bg-default-50/10 p-2">
                          {(() => {
                            let tags: string[] = [];
                            try { tags = form.tags ? JSON.parse(form.tags) : []; } catch {
                              tags = form.tags ? form.tags.split(/[;,]/).map(t => t.trim()).filter(Boolean) : [];
                            }
                            return tags.map((tag, idx) => (
                              <Chip key={`${tag}-${idx}`} size="sm" variant="flat" color="primary"
                                onClose={() => {
                                  const newTags = tags.filter((_, i) => i !== idx);
                                  setForm(p => ({ ...p, tags: newTags.length > 0 ? JSON.stringify(newTags) : '' }));
                                }}>
                                {tag}
                              </Chip>
                            ));
                          })()}
                          <input
                            className="flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-default-300"
                            placeholder={(() => { try { return (JSON.parse(form.tags || '[]')).length > 0 ? '' : '回车添加标签'; } catch { return '回车添加标签'; } })()}
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && tagInput.trim()) {
                                e.preventDefault();
                                let tags: string[] = [];
                                try { tags = form.tags ? JSON.parse(form.tags) : []; } catch {
                                  tags = form.tags ? form.tags.split(/[;,]/).map(t => t.trim()).filter(Boolean) : [];
                                }
                                if (!tags.includes(tagInput.trim())) {
                                  tags.push(tagInput.trim());
                                  setForm(p => ({ ...p, tags: JSON.stringify(tags) }));
                                }
                                setTagInput('');
                              }
                              if (e.key === 'Backspace' && !tagInput) {
                                let tags: string[] = [];
                                try { tags = form.tags ? JSON.parse(form.tags) : []; } catch {
                                  tags = form.tags ? form.tags.split(/[;,]/).map(t => t.trim()).filter(Boolean) : [];
                                }
                                if (tags.length > 0) {
                                  tags.pop();
                                  setForm(p => ({ ...p, tags: tags.length > 0 ? JSON.stringify(tags) : '' }));
                                }
                              }
                            }}
                          />
                        </div>
                        {assetTagCounts.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {assetTagCounts.map(([tag]) => {
                              let currentTags: string[] = [];
                              try { currentTags = form.tags ? JSON.parse(form.tags) : []; } catch {
                                currentTags = form.tags ? form.tags.split(/[;,]/).map(t => t.trim()).filter(Boolean) : [];
                              }
                              const isActive = currentTags.includes(tag);
                              return (
                                <button key={tag} type="button"
                                  className={`px-2 py-0.5 rounded-full text-[10px] border transition-all cursor-pointer ${
                                    isActive
                                      ? 'border-primary bg-primary-100 text-primary dark:bg-primary/20'
                                      : 'border-divider text-default-400 hover:border-primary/40'
                                  }`}
                                  onClick={() => {
                                    if (isActive) {
                                      const newTags = currentTags.filter(t => t !== tag);
                                      setForm(p => ({ ...p, tags: newTags.length > 0 ? JSON.stringify(newTags) : '' }));
                                    } else {
                                      currentTags.push(tag);
                                      setForm(p => ({ ...p, tags: JSON.stringify(currentTags) }));
                                    }
                                  }}>
                                  {tag}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <Textarea size="sm" label="备注" value={form.remark}
                        onValueChange={(v) => setForm(p => ({ ...p, remark: v }))} minRows={2} />
                    </div>
                  </Tab>

                  {/* ===== Tab 2: Services ===== */}
                  <Tab key="services" title={
                    <div className="flex items-center gap-1.5">
                      <span>服务绑定</span>
                      {isEdit && missingCount > 0 && (
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warning text-[9px] font-bold text-white px-1">{missingCount}</span>
                      )}
                    </div>
                  }>
                    <div className="space-y-3">
                      {/* Probe Status */}
                      <div className="rounded-xl border border-divider/60 bg-content1 p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-default-700">探针监控</span>
                            <div className="flex items-center gap-1">
                              {hasKomari ? (
                                <Chip size="sm" variant="flat" color="success" className="h-5 text-[10px]">Komari</Chip>
                              ) : (
                                <Chip size="sm" variant="dot" color="default" className="h-5 text-[10px]">Komari</Chip>
                              )}
                              {hasPika ? (
                                <Chip size="sm" variant="flat" color="success" className="h-5 text-[10px]">Pika</Chip>
                              ) : (
                                <Chip size="sm" variant="dot" color="default" className="h-5 text-[10px]">Pika</Chip>
                              )}
                            </div>
                          </div>
                          {(canCreateAssets || canUpdateAssets) && (!hasKomari || !hasPika || !editingAsset?.gostNodeId) && editingAsset && (
                            <Button size="sm" variant="flat" color="primary" className="h-7 text-[11px] min-w-0 px-3"
                              onPress={() => {
                                onFormClose();
                                openProvisionModal({
                                  assetId: editingAsset.id, assetName: editingAsset.name,
                                  assetIp: editingAsset.primaryIp || undefined, asset: editingAsset,
                                  missingKomari: !hasKomari, missingPika: !hasPika, missingGost: !editingAsset.gostNodeId,
                                });
                              }}>
                              部署缺少的组件
                            </Button>
                          )}
                        </div>
                        {hasBoundProbe && editingAsset && (
                          <>
                            <div className="grid gap-x-6 gap-y-1.5 grid-cols-2 text-xs">
                              {editingAsset.probeSource && (
                                <div className="flex items-center gap-2"><span className="text-default-400 flex-shrink-0">数据来源</span><span className="font-mono font-medium">{editingAsset.probeSource === 'dual' ? 'Komari + Pika' : editingAsset.probeSource}</span></div>
                              )}
                              {editingAsset.monitorLastSyncAt && (
                                <div className="flex items-center gap-2"><span className="text-default-400 flex-shrink-0">上次同步</span><span className="font-mono">{new Date(editingAsset.monitorLastSyncAt).toLocaleString('zh-CN', { hour12: false })}</span></div>
                              )}
                              {editingAsset.probeTrafficLimit && editingAsset.probeTrafficLimit > 0 && (
                                <div className="flex items-center gap-2"><span className="text-default-400 flex-shrink-0">流量配额</span><span className="font-mono">{formatFlow(editingAsset.probeTrafficUsed)} / {formatFlow(editingAsset.probeTrafficLimit)}</span></div>
                              )}
                              {editingAsset.probeExpiredAt && editingAsset.probeExpiredAt > 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-default-400 flex-shrink-0">探针到期</span>
                                  <span className={`font-mono ${editingAsset.probeExpiredAt < Date.now() ? 'text-danger' : ''}`}>
                                    {new Date(editingAsset.probeExpiredAt).toLocaleDateString('zh-CN')}
                                    {editingAsset.probeExpiredAt < Date.now() ? ' (已过期)' : ` (${Math.ceil((editingAsset.probeExpiredAt - Date.now()) / 86400000)}天)`}
                                  </span>
                                </div>
                              )}
                            </div>
                            {editingAsset.probeTags && (
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-default-400 flex-shrink-0">探针标签</span>
                                <div className="flex flex-wrap gap-1">
                                  {(() => { try { return JSON.parse(editingAsset.probeTags).map((t: string) => (<Chip key={t} size="sm" variant="flat" className="h-4 text-[9px]">{t}</Chip>)); } catch { return <span className="font-mono">{editingAsset.probeTags}</span>; } })()}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* X-UI Status */}
                      <div className="rounded-xl border border-divider/60 bg-content1 p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-default-700">X-UI 代理</span>
                          {hasXui ? (
                            <div className="flex items-center gap-2">
                              <Chip size="sm" variant="flat" color="success" className="h-5 text-[10px]">已绑定 ({editingAsset?.totalXuiInstances} 个)</Chip>
                              <Button size="sm" variant="light" color="primary" className="h-6 text-[11px] min-w-0 px-2"
                                onPress={() => { onFormClose(); navigate('/xui'); }}>
                                管理
                              </Button>
                            </div>
                          ) : (
                            <Chip size="sm" variant="dot" color="default" className="h-5 text-[10px]">未绑定</Chip>
                          )}
                        </div>
                        {(canCreateAssets || canUpdateAssets) && canManageXui && !hasXui && editingAsset && (
                          <>
                            {!xuiBindOpen ? (
                              <Button size="sm" variant="flat" color="primary"
                                onPress={() => {
                                  setXuiBindOpen(true);
                                  setXuiBindForm({ addr: `https://${editingAsset.primaryIp || ''}:54321`, user: '', pass: '' });
                                }}>
                                快速绑定 X-UI
                              </Button>
                            ) : (
                              <div className="rounded-lg border border-primary/20 bg-primary-50/20 dark:bg-primary-50/5 p-3 space-y-3">
                                <div className="grid gap-3 sm:grid-cols-3">
                                  <Input size="sm" label="面板地址" placeholder="https://ip:54321"
                                    value={xuiBindForm.addr}
                                    onValueChange={(v) => setXuiBindForm(p => ({ ...p, addr: v }))} />
                                  <Input size="sm" label="用户名" placeholder="admin"
                                    value={xuiBindForm.user}
                                    onValueChange={(v) => setXuiBindForm(p => ({ ...p, user: v }))} />
                                  <Input size="sm" label="密码" type="password" placeholder="登录密码"
                                    value={xuiBindForm.pass}
                                    onValueChange={(v) => setXuiBindForm(p => ({ ...p, pass: v }))} />
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" color="primary" isLoading={xuiBindLoading}
                                    isDisabled={!xuiBindForm.addr || !xuiBindForm.user || !xuiBindForm.pass}
                                    onPress={async () => {
                                      setXuiBindLoading(true);
                                      try {
                                        const res = await createXuiInstance({
                                          name: `${editingAsset.name}-xui`,
                                          baseUrl: xuiBindForm.addr,
                                          username: xuiBindForm.user,
                                          password: xuiBindForm.pass,
                                          assetId: editingAsset.id,
                                          managementMode: 'observe',
                                          syncEnabled: 1,
                                          syncIntervalMinutes: 30,
                                          allowInsecureTls: 1,
                                        });
                                        if (res.code === 0) {
                                          toast.success('X-UI 绑定成功，将自动同步');
                                          setXuiBindOpen(false);
                                          void loadAssets();
                                        } else {
                                          toast.error(res.msg || '绑定失败');
                                        }
                                      } catch { toast.error('绑定请求失败'); }
                                      finally { setXuiBindLoading(false); }
                                    }}>
                                    绑定
                                  </Button>
                                  <Button size="sm" variant="flat" onPress={() => setXuiBindOpen(false)}>取消</Button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* 1Panel Status */}
                      <div className="rounded-xl border border-divider/60 bg-content1 p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-default-700">1Panel / 摘要实例</span>
                          {hasPanel ? (
                            <div className="flex items-center gap-2">
                              <Chip size="sm" variant="flat" color="success" className="h-5 text-[10px]">已录入地址</Chip>
                              <a href={form.panelUrl} target="_blank" rel="noopener noreferrer"
                                className="text-[11px] text-primary hover:underline truncate max-w-[200px]">
                                {form.panelUrl}
                              </a>
                              {(canCreateAssets || canUpdateAssets) && (
                                <Button size="sm" variant="light" color="danger" className="h-6 text-[11px] min-w-0 px-2"
                                  onPress={() => setForm(p => ({ ...p, panelUrl: '' }))}>
                                  解绑
                                </Button>
                              )}
                            </div>
                          ) : (
                            <Chip size="sm" variant="dot" color="default" className="h-5 text-[10px]">未录入地址</Chip>
                          )}
                        </div>
                        {(canCreateAssets || canUpdateAssets) && !hasPanel && editingAsset && (
                          <>
                            {!panelBindOpen ? (
                              <Button size="sm" variant="flat" color="primary"
                                onPress={() => { setPanelBindInput(''); setPanelBindOpen(true); }}>
                                绑定 1Panel 地址
                              </Button>
                            ) : (
                              <div className="flex items-end gap-2">
                                <Input size="sm" label="1Panel 地址" className="flex-1"
                                  placeholder={`https://${editingAsset.primaryIp || '1.2.3.4'}:19382`}
                                  value={panelBindInput}
                                  onValueChange={setPanelBindInput}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); }
                                  }} />
                                <Button size="sm" color="primary" className="flex-shrink-0" type="button"
                                  isDisabled={!panelBindInput || panelBindInput.length < 10}
                                  onPress={() => { setForm(p => ({ ...p, panelUrl: panelBindInput })); setPanelBindOpen(false); toast.success('1Panel 地址已设置，保存后生效'); }}>
                                  确定
                                </Button>
                                <Button size="sm" variant="flat" className="flex-shrink-0" type="button"
                                  onPress={() => setPanelBindOpen(false)}>
                                  取消
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                        {editingAsset && hasPanel && (
                          <div className="rounded-lg border border-divider/60 bg-default-50/60 px-3 py-2.5 space-y-2">
                            {editingAsset.onePanelInstanceId ? (
                              <>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Chip size="sm" variant="flat" color="success" className="h-5 text-[10px]">摘要实例已配置</Chip>
                                  <Chip size="sm" variant="flat" color={getStatusChip(editingAsset.onePanelLastReportStatus).color} className="h-5 text-[10px]">
                                    {getStatusChip(editingAsset.onePanelLastReportStatus).text}
                                  </Chip>
                                  {editingAsset.onePanelPanelVersion && (
                                    <span className="text-[11px] text-default-500 font-mono">
                                      Panel {editingAsset.onePanelPanelVersion}
                                      {editingAsset.onePanelExporterVersion ? ` · exporter ${editingAsset.onePanelExporterVersion}` : ''}
                                    </span>
                                  )}
                                </div>
                                <div className="space-y-1 text-[11px] text-default-500">
                                  <p>状态分层：1）地址已录入；2）摘要实例已创建并可上报。</p>
                                  <p>最近上报：{editingAsset.onePanelLastReportAt ? new Date(editingAsset.onePanelLastReportAt).toLocaleString('zh-CN', { hour12: false }) : '尚未收到 exporter 上报'}</p>
                                  {editingAsset.onePanelLastReportError && (
                                    <p className="text-danger">最近错误：{editingAsset.onePanelLastReportError}</p>
                                  )}
                                </div>
                                {(canCreateAssets || canUpdateAssets) && (
                                  <div className="flex flex-wrap gap-2">
                                    <Button size="sm" variant="flat" color="primary"
                                      onPress={() => navigate(`/onepanel?instanceId=${editingAsset.onePanelInstanceId}`)}>
                                      查看摘要
                                    </Button>
                                    <Button size="sm" variant="flat" color="warning" isLoading={onePanelActionLoading}
                                      onPress={() => void handleRotateOnePanelToken(editingAsset)}>
                                      轮换 Token
                                    </Button>
                                    <Button size="sm" variant="flat" color="danger" isLoading={onePanelActionLoading}
                                      onPress={() => void handleDeleteOnePanelInstance(editingAsset)}>
                                      移除摘要实例
                                    </Button>
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Chip size="sm" variant="flat" color="warning" className="h-5 text-[10px]">地址已录入</Chip>
                                  <Chip size="sm" variant="flat" color="default" className="h-5 text-[10px]">摘要实例未配置</Chip>
                                </div>
                                <p className="text-[11px] text-default-500">
                                  当前只完成了 1Panel 面板地址录入。下一步可在这里一键创建 1Panel 摘要实例，Flux 会生成本机 exporter 安装参数。
                                </p>
                                {(canCreateAssets || canUpdateAssets) && (
                                  <div className="flex flex-wrap gap-2">
                                    <Button size="sm" color="primary" isLoading={onePanelActionLoading}
                                      onPress={() => void handleCreateOnePanelInstance(editingAsset)}>
                                      一键配置摘要实例
                                    </Button>
                                    <Button size="sm" variant="flat"
                                      onPress={() => navigate('/onepanel')}>
                                      查看摘要看板
                                    </Button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* JumpServer 堡垒机绑定 */}
                      {jsEnabled && (
                        <div className="rounded-xl border border-divider/60 bg-content1 p-3 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-default-700">JumpServer 堡垒机</span>
                            {form.jumpserverAssetId ? (
                              <div className="flex items-center gap-2">
                                <Chip size="sm" variant="flat" color="success" className="h-5 text-[10px]">已绑定</Chip>
                                <span className="text-[11px] font-mono text-default-500 truncate max-w-[180px]">{form.jumpserverAssetId}</span>
                                {(canCreateAssets || canUpdateAssets) && (
                                  <Button size="sm" variant="light" color="danger" className="h-6 text-[11px] min-w-0 px-2"
                                    onPress={() => setForm(p => ({ ...p, jumpserverAssetId: '' }))}>
                                    解绑
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <Chip size="sm" variant="dot" color="default" className="h-5 text-[10px]">未绑定（将按主 IP 匹配）</Chip>
                            )}
                          </div>
                          <div className="text-[11px] text-default-400 leading-relaxed bg-default-50 rounded-lg px-2.5 py-2 space-y-1">
                            <p><strong>绑定方式：</strong>填入 JumpServer 中该主机的 UUID（资产详情页 URL 中的 ID），或点击下方按钮按 IP 自动匹配。</p>
                            <p><strong>查找 UUID：</strong>JumpServer 控制台 → 资产管理 → 主机列表 → 点击目标主机 → 浏览器地址栏中 <code className="text-[10px] bg-default-200 px-1 rounded">/assets/hosts/&lt;UUID&gt;</code> 即为资产 ID。</p>
                            <p><strong>未绑定时：</strong>终端登录将无法使用，需先绑定资产 ID。绑定后，系统优先通过后端 API 生成终端链接；若后端无法连通 JumpServer（如跨网络部署），将跳转到堡垒机中该资产的详情页面。</p>
                          </div>
                          {(canCreateAssets || canUpdateAssets) && (
                            <div className="space-y-2">
                              <Input size="sm" label="JumpServer 资产 ID（UUID）" placeholder="如 3a2f7c1e-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                value={form.jumpserverAssetId}
                                onValueChange={(v) => setForm(p => ({ ...p, jumpserverAssetId: v }))} />
                              {editingAsset?.primaryIp && (
                                <Button size="sm" variant="flat" color="primary"
                                  onPress={async () => {
                                    if (!editingAsset?.id) return;
                                    try {
                                      const res = await jumpServerMatchByIp(editingAsset.id, true);
                                      if (res.code === 0 && res.data?.id) {
                                        setForm(p => ({ ...p, jumpserverAssetId: res.data!.id }));
                                        toast.success(`已按 IP 匹配并绑定：${res.data!.name || res.data!.address || res.data!.id}`);
                                      } else {
                                        toast.error(res.msg || '匹配失败，请确认 JumpServer 中已注册此 IP 的主机');
                                      }
                                    } catch {
                                      toast.error('请求失败，后端可能无法连接 JumpServer');
                                    }
                                  }}>
                                  按主 IP ({editingAsset.primaryIp}) 自动匹配
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* GOST Node Binding */}
                      <div className="rounded-xl border border-divider/60 bg-content1 p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-default-700">GOST 节点</span>
                          {form.gostNodeId ? (
                            <div className="flex items-center gap-2">
                              <Chip size="sm" variant="flat" color="success" className="h-5 text-[10px]">
                                {gostNodes.find(n => n.id === parseInt(form.gostNodeId))?.name || `ID: ${form.gostNodeId}`}
                              </Chip>
                              {(() => {
                                const node = gostNodes.find(n => n.id === parseInt(form.gostNodeId));
                                return node ? (
                                  <Chip size="sm" variant="dot" color={node.status === 1 ? 'success' : 'danger'} className="h-5 text-[10px]">
                                    {node.status === 1 ? '在线' : '离线'}
                                  </Chip>
                                ) : null;
                              })()}
                              {(canCreateAssets || canUpdateAssets) && (
                                <Button size="sm" variant="light" color="danger" className="h-6 text-[11px] min-w-0 px-2"
                                  onPress={() => setForm(p => ({ ...p, gostNodeId: '' }))}>
                                  解绑
                                </Button>
                              )}
                            </div>
                          ) : (
                            <Chip size="sm" variant="dot" color="default" className="h-5 text-[10px]">未绑定</Chip>
                          )}
                        </div>
                        {(canCreateAssets || canUpdateAssets) && !form.gostNodeId && editingAsset && (
                          <>
                            {!gostBindOpen ? (
                              <Button size="sm" variant="flat" color="primary"
                                onPress={() => { setGostBindOpen(true); void loadGostNodes(); }}>
                                绑定 GOST 节点
                              </Button>
                            ) : (
                              <div className="space-y-3">
                                {/* Auto-detect: highlight matching node by IP */}
                                {(() => {
                                  const matchedNode = editingAsset.primaryIp
                                    ? gostNodes.find(n => n.ip === editingAsset.primaryIp && !assets.some(a => a.gostNodeId === n.id && a.id !== editingAsset.id))
                                    : null;
                                  return matchedNode ? (
                                    <div className="rounded-lg border-2 border-success bg-success-50/30 dark:bg-success-50/10 p-3 space-y-2">
                                      <p className="text-xs font-semibold text-success-700 dark:text-success-400">
                                        发现匹配的 GOST 节点（IP 一致）
                                      </p>
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className={`w-2 h-2 rounded-full ${matchedNode.status === 1 ? 'bg-success' : 'bg-danger'}`} />
                                          <span className="font-medium text-sm">{matchedNode.name}</span>
                                          <span className="text-xs text-default-400 font-mono">{matchedNode.ip}</span>
                                        </div>
                                        <Button size="sm" color="success" variant="flat"
                                          onPress={() => {
                                            setForm(p => ({ ...p, gostNodeId: matchedNode.id.toString() }));
                                            setGostBindOpen(false);
                                            toast.success(`已自动匹配并绑定节点 "${matchedNode.name}"`);
                                          }}>
                                          一键绑定
                                        </Button>
                                      </div>
                                    </div>
                                  ) : null;
                                })()}
                                {/* Select from existing nodes */}
                                {gostNodes.filter(n => !assets.some(a => a.gostNodeId === n.id && a.id !== editingAsset.id)).length > 0 ? (
                                  <div className="space-y-2">
                                    <p className="text-[11px] text-default-400">选择已有节点绑定：</p>
                                    <div className="flex flex-wrap gap-2">
                                      {gostNodes
                                        .filter(n => !assets.some(a => a.gostNodeId === n.id && a.id !== editingAsset.id))
                                        .map(n => (
                                          <button key={n.id} type="button"
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-divider hover:border-primary/60 hover:bg-primary-50/30 dark:hover:bg-primary/10 transition-all text-xs cursor-pointer"
                                            onClick={() => {
                                              setForm(p => ({ ...p, gostNodeId: n.id.toString() }));
                                              setGostBindOpen(false);
                                              toast.success(`已选择节点 "${n.name}"，保存后生效`);
                                            }}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${n.status === 1 ? 'bg-success' : 'bg-danger'}`} />
                                            <span className="font-medium">{n.name}</span>
                                            <span className="text-default-400">{n.ip}</span>
                                          </button>
                                        ))}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-default-400">暂无可用的 GOST 节点，请先创建一个。</p>
                                )}
                                {/* Quick create new node */}
                                <div className="rounded-lg border border-primary/20 bg-primary-50/20 dark:bg-primary-50/5 p-3 space-y-3">
                                  <p className="text-[11px] font-medium text-default-600">或快速创建新节点：</p>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <Input size="sm" label="节点名称" placeholder="默认使用资产名称"
                                      value={gostCreateForm.name || editingAsset.name || ''}
                                      onValueChange={(v) => setGostCreateForm(p => ({ ...p, name: v }))} />
                                    <Input size="sm" label="节点 IP" placeholder="默认使用资产 IP"
                                      value={gostCreateForm.ip || editingAsset.primaryIp || ''}
                                      onValueChange={(v) => setGostCreateForm(p => ({ ...p, ip: v }))} />
                                    <Input size="sm" label="端口范围起始" placeholder="10000"
                                      value={gostCreateForm.portSta}
                                      onValueChange={(v) => setGostCreateForm(p => ({ ...p, portSta: v }))} />
                                    <Input size="sm" label="端口范围结束" placeholder="20000"
                                      value={gostCreateForm.portEnd}
                                      onValueChange={(v) => setGostCreateForm(p => ({ ...p, portEnd: v }))} />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" color="primary" isLoading={gostCreateLoading}
                                      isDisabled={!gostCreateForm.name && !editingAsset.name}
                                      onPress={async () => {
                                        setGostCreateLoading(true);
                                        try {
                                          const nodeName = gostCreateForm.name || editingAsset.name;
                                          const nodeIp = gostCreateForm.ip || editingAsset.primaryIp;
                                          if (!nodeIp) { toast.error('请填写节点 IP'); return; }
                                          const res = await createNode({
                                            name: nodeName,
                                            ip: nodeIp,
                                            portSta: parseInt(gostCreateForm.portSta) || 10000,
                                            portEnd: parseInt(gostCreateForm.portEnd) || 20000,
                                            assetId: editingAsset.id,
                                          });
                                          if (res.code === 0 && res.data) {
                                            const nodeId = typeof res.data === 'object' ? res.data.id : res.data;
                                            toast.success('GOST 节点创建成功');
                                            setForm(p => ({ ...p, gostNodeId: nodeId?.toString() || '' }));
                                            setGostBindOpen(false);
                                            void loadGostNodes();
                                            // Try to get install command
                                            try {
                                              const cmdRes = await getNodeInstallCommand(nodeId);
                                              if (cmdRes.code === 0 && cmdRes.data) {
                                                setGostInstallCmd(cmdRes.data);
                                              }
                                            } catch { /* ignore */ }
                                          } else {
                                            toast.error(res.msg || '创建失败');
                                          }
                                        } catch { toast.error('创建请求失败'); }
                                        finally { setGostCreateLoading(false); }
                                      }}>
                                      创建并绑定
                                    </Button>
                                    <Button size="sm" variant="flat" onPress={() => setGostBindOpen(false)}>取消</Button>
                                  </div>
                                </div>
                                {/* Show install command if just created */}
                                {gostInstallCmd && (
                                  <div className="rounded-lg border border-success/30 bg-success-50/20 dark:bg-success-50/5 p-3 space-y-2">
                                    <p className="text-[11px] font-medium text-success-700 dark:text-success-400">节点创建成功！请在目标服务器上执行以下命令安装 GOST：</p>
                                    <div className="relative">
                                      <pre className="text-[10px] bg-default-100 dark:bg-default-50/10 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">{gostInstallCmd}</pre>
                                      <Button size="sm" variant="flat" className="absolute top-1 right-1 h-6 text-[10px] min-w-0 px-2"
                                        onPress={() => { navigator.clipboard.writeText(gostInstallCmd).then(() => toast.success('已复制安装命令')).catch(() => toast.error('复制失败，请手动选择文本复制')); }}>
                                        复制
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                        {/* Show install command for bound node */}
                        {(canCreateAssets || canUpdateAssets) && form.gostNodeId && (
                          <Button size="sm" variant="flat" color="secondary" className="h-7 text-[11px]"
                            onPress={async () => {
                              try {
                                const res = await getNodeInstallCommand(parseInt(form.gostNodeId));
                                if (res.code === 0 && res.data) {
                                  setGostInstallCmd(res.data);
                                } else {
                                  toast.error(res.msg || '获取安装命令失败');
                                }
                              } catch { toast.error('获取安装命令失败'); }
                            }}>
                            查看安装命令
                          </Button>
                        )}
                        {form.gostNodeId && gostInstallCmd && (
                          <div className="relative">
                            <pre className="text-[10px] bg-default-100 dark:bg-default-50/10 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">{gostInstallCmd}</pre>
                            <Button size="sm" variant="flat" className="absolute top-1 right-1 h-6 text-[10px] min-w-0 px-2"
                              onPress={() => { navigator.clipboard.writeText(gostInstallCmd!).then(() => toast.success('已复制安装命令')).catch(() => toast.error('复制失败，请手动选择文本复制')); }}>
                              复制
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Manual probe UUID binding */}
                      <Accordion variant="light" className="-mx-1">
                        <AccordionItem key="advanced" title="手动关联探针 UUID" classNames={{ title: "text-xs text-default-400" }}>
                          <div className="space-y-3">
                            <p className="text-[11px] text-default-400">通常由系统自动关联，仅在手动修复绑定关系时使用。</p>
                            <div className="grid gap-3 md:grid-cols-2">
                              <Input size="sm" label="Komari 节点 UUID" placeholder="自动同步时填入" value={form.monitorNodeUuid}
                                onValueChange={(v) => setForm(p => ({ ...p, monitorNodeUuid: v }))} />
                              <Input size="sm" label="Pika 节点 ID" placeholder="自动同步时填入" value={form.pikaNodeId}
                                onValueChange={(v) => setForm(p => ({ ...p, pikaNodeId: v }))} />
                            </div>
                          </div>
                        </AccordionItem>
                      </Accordion>
                    </div>
                  </Tab>

                  {/* ===== Tab 3: Hardware & Probe ===== */}
                  <Tab key="hardware" title="硬件配置">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Select size="sm" label="操作系统分类" className="max-w-[200px]" selectedKeys={form.osCategory ? [form.osCategory] : []}
                          isDisabled={hasBoundProbe}
                          onSelectionChange={(keys) => setForm(p => ({ ...p, osCategory: Array.from(keys)[0]?.toString() || '' }))}>
                          {OS_CATEGORIES.map(o => <SelectItem key={o.key}>{o.label}</SelectItem>)}
                        </Select>
                        {hasBoundProbe && (
                          <Chip size="sm" variant="flat" color="success" className="text-[10px]">
                            已绑定{form.monitorNodeUuid && form.pikaNodeId ? '双探针' : form.monitorNodeUuid ? 'Komari' : 'Pika'}，探针同步时自动更新
                          </Chip>
                        )}
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                        <Input size="sm" label="操作系统" placeholder="Ubuntu 22" value={form.os}
                          onValueChange={(v) => setForm(p => ({ ...p, os: v }))}
                          isReadOnly={hasBoundProbe} />
                        <Input size="sm" label="CPU 核心" type="number" value={form.cpuCores}
                          onValueChange={(v) => setForm(p => ({ ...p, cpuCores: v }))}
                          isReadOnly={hasBoundProbe} />
                        <Input size="sm" label="内存 (MB)" type="number" value={form.memTotalMb}
                          onValueChange={(v) => setForm(p => ({ ...p, memTotalMb: v }))}
                          isReadOnly={hasBoundProbe} />
                        <Input size="sm" label="硬盘 (GB)" type="number" value={form.diskTotalGb}
                          onValueChange={(v) => setForm(p => ({ ...p, diskTotalGb: v }))}
                          isReadOnly={hasBoundProbe} />
                        <Input size="sm" label="CPU 型号" placeholder="AMD EPYC 7543" value={form.cpuName}
                          onValueChange={(v) => setForm(p => ({ ...p, cpuName: v }))}
                          isReadOnly={hasBoundProbe} />
                        <Input size="sm" label="架构" placeholder="amd64" value={form.arch}
                          onValueChange={(v) => setForm(p => ({ ...p, arch: v }))}
                          isReadOnly={hasBoundProbe} />
                        <Input size="sm" label="虚拟化" placeholder="kvm / lxc" value={form.virtualization}
                          onValueChange={(v) => setForm(p => ({ ...p, virtualization: v }))}
                          isReadOnly={hasBoundProbe} />
                        <Input size="sm" label="Swap (MB)" type="number" value={form.swapTotalMb}
                          onValueChange={(v) => setForm(p => ({ ...p, swapTotalMb: v }))}
                          isReadOnly={hasBoundProbe} />
                        <Input size="sm" label="内核版本" placeholder="6.1.0-13-amd64" value={form.kernelVersion}
                          onValueChange={(v) => setForm(p => ({ ...p, kernelVersion: v }))}
                          isReadOnly={hasBoundProbe} />
                        <Input size="sm" label="GPU" placeholder="NVIDIA RTX 4090" value={form.gpuName}
                          onValueChange={(v) => setForm(p => ({ ...p, gpuName: v }))}
                          isReadOnly={hasBoundProbe} />
                        <Input size="sm" label="IPv6" value={form.ipv6}
                          onValueChange={(v) => setForm(p => ({ ...p, ipv6: v }))}
                          isReadOnly={hasBoundProbe} className="lg:col-span-2" />
                      </div>
                    </div>
                  </Tab>
                </Tabs>
              );
            })()}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onFormClose}>取消</Button>
            <Button color="primary" isLoading={submitLoading} onPress={handleSubmit} isDisabled={!(canCreateAssets || canUpdateAssets)}>
              {isEdit ? '保存' : '创建'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={isDeleteOpen} onOpenChange={(open) => !open && onDeleteClose()}>
        <ModalContent>
          <ModalHeader>删除资产</ModalHeader>
          <ModalBody>
            <p className="text-sm">确定删除 <span className="font-semibold">{assetToDelete?.name}</span>？已关联 X-UI 实例或转发规则的资产无法删除。</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onDeleteClose}>取消</Button>
            <Button color="danger" isLoading={actionLoadingId === assetToDelete?.id} onPress={handleDelete} isDisabled={!canDeleteAssets}>删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Provision Modal */}
      <Modal isOpen={isProvisionOpen} onOpenChange={(open) => {
        if (!open) {
          if (provisionStep === 'result') return; // result step uses explicit buttons
          if (isProvisionFormDirty(provisionForm, provisionName)) {
            if (!window.confirm('表单已填写内容，确定要放弃吗？')) return;
          }
          onProvisionClose();
        }
      }} size="5xl" backdrop="blur" isDismissable={false} isKeyboardDismissDisabled={provisionStep === 'result' || isProvisionFormDirty(provisionForm, provisionName)} hideCloseButton={provisionStep === 'result'}>
        <ModalContent>
          <ModalHeader>
            {provisionContext
              ? `为「${provisionContext.assetName}」部署组件`
              : '添加服务器'}
          </ModalHeader>
          <ModalBody>
            {provisionStep === 'select' ? (
              <div className="space-y-4">
                {/* Context hint */}
                {provisionContext && (
                  <div className="rounded-lg border border-primary/20 bg-primary-50/40 dark:bg-primary-50/5 p-2.5 text-xs text-default-600">
                    已根据该服务器缺少的组件自动勾选，您也可以手动调整。
                  </div>
                )}

                {/* ===== Row 1: OS + Name + IP + Provider + Region ===== */}
                <div>
                  <p className="text-[11px] font-semibold text-default-400 uppercase tracking-wider mb-2">基本信息</p>
                  <div className="flex flex-wrap gap-2">
                    <Select size="sm" label="系统平台" isRequired className="min-w-[130px] w-[130px]"
                      classNames={{ value: "text-foreground font-medium", trigger: "bg-default-100" }}
                      selectedKeys={[provisionForm.osPlatform]}
                      onSelectionChange={keys => {
                        const os = (Array.from(keys)[0]?.toString() || 'linux') as ProvisionForm['osPlatform'];
                        setProvisionForm(p => ({ ...p, osPlatform: os }));
                        if (os !== 'linux') setProvisionGostEnabled(false);
                      }}>
                      {OS_PLATFORMS.map(o => <SelectItem key={o.key}>{o.label}</SelectItem>)}
                    </Select>
                    {provisionForm.osPlatform === 'windows' && (
                      <Select size="sm" label="架构" className="min-w-[110px] w-[110px]"
                        classNames={{ value: "text-foreground font-medium", trigger: "bg-default-100" }}
                        selectedKeys={[provisionForm.osArch]}
                        onSelectionChange={keys => setProvisionForm(p => ({ ...p, osArch: (Array.from(keys)[0]?.toString() || 'amd64') as ProvisionForm['osArch'] }))}>
                        {OS_ARCHS.map(o => <SelectItem key={o.key}>{o.label}</SelectItem>)}
                      </Select>
                    )}
                    <Input size="sm" label="名称" placeholder="HK-VPS-01" isRequired className="min-w-[140px] flex-1"
                      value={provisionName} onValueChange={setProvisionName}
                      isInvalid={!!provisionFormErrors.name} errorMessage={provisionFormErrors.name} />
                    <Input size="sm" label="IP / 域名" placeholder="1.2.3.4" isRequired className="min-w-[120px] flex-1"
                      value={provisionForm.primaryIp} isInvalid={!!provisionFormErrors.primaryIp} errorMessage={provisionFormErrors.primaryIp}
                      onValueChange={v => setProvisionForm(p => ({ ...p, primaryIp: v }))} />
                    <Autocomplete size="sm" label="供应商" isRequired allowsCustomValue className="min-w-[120px] flex-1"
                      defaultItems={allProviderOptions.filter(p => p.key)}
                      inputValue={provisionForm.provider}
                      onInputChange={v => setProvisionForm(p => ({ ...p, provider: v }))}
                      onSelectionChange={key => { if (key) setProvisionForm(p => ({ ...p, provider: key.toString() })); }}
                      isInvalid={!!provisionFormErrors.provider} errorMessage={provisionFormErrors.provider}>
                      {(item) => <AutocompleteItem key={item.key}>{item.label}</AutocompleteItem>}
                    </Autocomplete>
                    <Select size="sm" label="地区" className="min-w-[120px] flex-1"
                      classNames={{ value: "text-foreground", trigger: "bg-default-100" }}
                      selectedKeys={provisionForm.region ? [provisionForm.region] : []}
                      onSelectionChange={keys => setProvisionForm(p => ({ ...p, region: Array.from(keys)[0]?.toString() || '' }))}>
                      {REGIONS.map(r => <SelectItem key={r.key}>{r.flag ? `${r.flag} ${r.label}` : r.label}</SelectItem>)}
                    </Select>
                  </div>
                </div>

                {/* ===== Row 2: Billing ===== */}
                <div>
                  <p className="text-[11px] font-semibold text-default-400 uppercase tracking-wider mb-2">计费</p>
                  <div className="flex flex-wrap gap-2">
                    <DatePicker size="sm" label="购买日期" isRequired granularity="day" className="min-w-[140px] flex-1"
                      popoverProps={{ placement: "bottom" }}
                      value={provisionForm.purchaseDate ? parseDate(provisionForm.purchaseDate) : null}
                      isInvalid={!!provisionFormErrors.purchaseDate} errorMessage={provisionFormErrors.purchaseDate}
                      onChange={d => setProvisionForm(p => ({ ...p, purchaseDate: d ? `${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}` : '' }))} />
                    <div className="flex gap-1.5 items-start min-w-[160px] flex-1">
                      {provisionForm.neverExpire ? (
                        <Input size="sm" label="到期" value="永不到期" isReadOnly className="flex-1" classNames={{ input: "text-success font-medium" }} />
                      ) : (
                        <DatePicker size="sm" label="到期日期" isRequired granularity="day" className="flex-1"
                          popoverProps={{ placement: "bottom" }}
                          value={provisionForm.expireDate ? parseDate(provisionForm.expireDate) : null}
                          isInvalid={!!provisionFormErrors.expireDate} errorMessage={provisionFormErrors.expireDate}
                          onChange={d => setProvisionForm(p => ({ ...p, expireDate: d ? `${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}` : '' }))} />
                      )}
                      <Button size="sm" isIconOnly variant={provisionForm.neverExpire ? 'solid' : 'flat'}
                        color={provisionForm.neverExpire ? 'success' : 'default'} className="shrink-0 mt-1"
                        title={provisionForm.neverExpire ? '取消永久' : '设为永不到期'}
                        onPress={() => setProvisionForm(p => ({ ...p, neverExpire: !p.neverExpire, expireDate: '' }))}>
                        ∞
                      </Button>
                    </div>
                    <Select size="sm" label="周期" isRequired className="min-w-[100px] w-[100px]"
                      classNames={{ value: "text-foreground", trigger: "bg-default-100" }}
                      selectedKeys={provisionForm.billingCycle ? [provisionForm.billingCycle] : []}
                      isInvalid={!!provisionFormErrors.billingCycle} errorMessage={provisionFormErrors.billingCycle}
                      onSelectionChange={keys => setProvisionForm(p => ({ ...p, billingCycle: Array.from(keys)[0]?.toString() || '' }))}>
                      {BILLING_CYCLES.filter(c => c.key).map(c => <SelectItem key={c.key}>{c.label}</SelectItem>)}
                    </Select>
                    <Input size="sm" label="周期费用" placeholder="10.00" type="number" isRequired className="min-w-[100px] flex-1"
                      value={provisionForm.monthlyCost} isInvalid={!!provisionFormErrors.monthlyCost} errorMessage={provisionFormErrors.monthlyCost}
                      onValueChange={v => setProvisionForm(p => ({ ...p, monthlyCost: v }))} />
                    <Select size="sm" label="币种" isRequired className="min-w-[100px] w-[100px]"
                      classNames={{ value: "text-foreground", trigger: "bg-default-100" }}
                      selectedKeys={provisionForm.currency ? [provisionForm.currency] : []}
                      onSelectionChange={keys => setProvisionForm(p => ({ ...p, currency: Array.from(keys)[0]?.toString() || '' }))}>
                      {CURRENCIES.map(c => <SelectItem key={c.key}>{c.label}</SelectItem>)}
                    </Select>
                  </div>
                  {/* Cost breakdown inline */}
                  {(() => {
                    const b = calcCostBreakdown(provisionForm.monthlyCost, provisionForm.billingCycle, provisionForm.currency);
                    if (!b) return null;
                    return (
                      <p className="text-[11px] text-default-400 mt-1.5 text-right">
                        日均 <strong className="text-default-600">{b.currency} {b.dailyCost}</strong>
                        <span className="mx-2">·</span>
                        年化 <strong className="text-default-600">{b.currency} {b.yearlyCost}</strong>
                      </p>
                    );
                  })()}
                </div>

                {/* ===== Row 3: Network (single row) ===== */}
                <div>
                  <p className="text-[11px] font-semibold text-default-400 uppercase tracking-wider mb-2">网络</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input size="sm" label="带宽 (Mbps)" placeholder="1000" type="number" isRequired
                      value={provisionForm.bandwidthMbps} isInvalid={!!provisionFormErrors.bandwidthMbps} errorMessage={provisionFormErrors.bandwidthMbps}
                      onValueChange={v => setProvisionForm(p => ({ ...p, bandwidthMbps: v }))} />
                    <div className="flex gap-1.5 items-start">
                      {provisionForm.trafficUnlimited ? (
                        <Input size="sm" label="月流量" value="不限量" isReadOnly className="flex-1"
                          classNames={{ input: "text-success font-medium" }} />
                      ) : (
                        <Input size="sm" label={`月流量 (${provisionForm.trafficUnit})`} placeholder="1000" type="number" isRequired className="flex-1"
                          value={provisionForm.monthlyTrafficGb} isInvalid={!!provisionFormErrors.monthlyTrafficGb} errorMessage={provisionFormErrors.monthlyTrafficGb}
                          onValueChange={v => setProvisionForm(p => ({ ...p, monthlyTrafficGb: v }))} />
                      )}
                      {!provisionForm.trafficUnlimited && (
                        <Button size="sm" isIconOnly variant="flat" className="shrink-0 mt-1"
                          onPress={() => setProvisionForm(p => ({ ...p, trafficUnit: p.trafficUnit === 'GB' ? 'TB' : 'GB' }))}>
                          {provisionForm.trafficUnit === 'GB' ? 'TB' : 'GB'}
                        </Button>
                      )}
                      <Button size="sm" isIconOnly variant={provisionForm.trafficUnlimited ? 'solid' : 'flat'}
                        color={provisionForm.trafficUnlimited ? 'success' : 'default'} className="shrink-0 mt-1"
                        title={provisionForm.trafficUnlimited ? '取消不限量' : '设为不限量'}
                        onPress={() => setProvisionForm(p => ({ ...p, trafficUnlimited: !p.trafficUnlimited, monthlyTrafficGb: '' }))}>
                        ∞
                      </Button>
                    </div>
                  </div>
                </div>

                {/* ===== Row 4: Optional ===== */}
                <div>
                  <p className="text-[11px] font-semibold text-default-400 uppercase tracking-wider mb-2">其他（选填）</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Input size="sm" label="核心用途" placeholder="Nginx反代 / 博客站"
                      value={provisionForm.purpose}
                      onValueChange={v => setProvisionForm(p => ({ ...p, purpose: v }))} />
                    <Input size="sm" label="标签" placeholder="逗号分隔"
                      value={provisionForm.tags}
                      onValueChange={v => setProvisionForm(p => ({ ...p, tags: v }))} />
                    <Input size="sm" label="备注" placeholder="可选"
                      value={provisionForm.remark}
                      onValueChange={v => setProvisionForm(p => ({ ...p, remark: v }))} />
                  </div>
                </div>

                {/* ===== Row 5: Agent Deployment (compact inline) ===== */}
                <div>
                  <p className="text-[11px] font-semibold text-default-400 uppercase tracking-wider mb-2">探针部署</p>
                  <div className="grid grid-cols-3 gap-2">
                    {/* Komari */}
                    <div className={`rounded-lg border p-2 transition-all ${provisionKomariEnabled ? 'border-primary/40 bg-primary-50/20 dark:bg-primary-50/5' : 'border-divider'}`}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Switch size="sm" isSelected={provisionKomariEnabled} onValueChange={setProvisionKomariEnabled} />
                        <span className="text-xs font-medium">Komari</span>
                      </div>
                      {provisionKomariEnabled && (
                        <Select size="sm" placeholder="选择实例" className="w-full"
                          classNames={{ value: "text-foreground", trigger: "bg-default-100" }}
                          selectedKeys={provisionKomariId ? [provisionKomariId] : []}
                          onSelectionChange={keys => setProvisionKomariId(Array.from(keys)[0]?.toString() || '')}>
                          {monitorInstances.filter(i => i.type === 'komari').map(inst => (
                            <SelectItem key={inst.id.toString()}>{inst.name}</SelectItem>
                          ))}
                        </Select>
                      )}
                    </div>
                    {/* Pika */}
                    <div className={`rounded-lg border p-2 transition-all ${provisionPikaEnabled ? 'border-secondary/40 bg-secondary-50/20 dark:bg-secondary-50/5' : 'border-divider'}`}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Switch size="sm" isSelected={provisionPikaEnabled} onValueChange={setProvisionPikaEnabled} />
                        <span className="text-xs font-medium">Pika</span>
                      </div>
                      {provisionPikaEnabled && (
                        <Select size="sm" placeholder="选择实例" className="w-full"
                          classNames={{ value: "text-foreground", trigger: "bg-default-100" }}
                          selectedKeys={provisionPikaId ? [provisionPikaId] : []}
                          onSelectionChange={keys => setProvisionPikaId(Array.from(keys)[0]?.toString() || '')}>
                          {monitorInstances.filter(i => i.type === 'pika').map(inst => (
                            <SelectItem key={inst.id.toString()}>{inst.name}</SelectItem>
                          ))}
                        </Select>
                      )}
                    </div>
                    {/* GOST */}
                    <div className={`rounded-lg border p-2 transition-all ${provisionGostEnabled ? 'border-warning/40 bg-warning-50/20 dark:bg-warning-50/5' : 'border-divider'}`}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Switch size="sm" isSelected={provisionGostEnabled}
                          isDisabled={provisionForm.osPlatform !== 'linux'}
                          onValueChange={setProvisionGostEnabled} />
                        <span className="text-xs font-medium">GOST</span>
                        {provisionForm.osPlatform !== 'linux' && (
                          <span className="text-[10px] text-warning">仅 Linux</span>
                        )}
                      </div>
                      {provisionGostEnabled && provisionForm.osPlatform === 'linux' && (
                        <div className="flex gap-1">
                          <Input size="sm" label="起始" value={provisionGostPortSta} onValueChange={setProvisionGostPortSta} type="number" />
                          <Input size="sm" label="结束" value={provisionGostPortEnd} onValueChange={setProvisionGostPortEnd} type="number" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : allProvisionResult ? (
              /* Unified result display */
              <div className="space-y-3">
                {/* Compact component status summary */}
                <div className="flex flex-wrap gap-2">
                  {allProvisionResult.komari && (
                    <Chip size="sm" color="success" variant="flat" startContent={<span className="ml-1">&#10003;</span>}>
                      Komari {allProvisionResult.komari.uuid?.slice(0, 8)}
                    </Chip>
                  )}
                  {allProvisionResult.komariError && (
                    <Chip size="sm" color="danger" variant="flat" startContent={<span className="ml-1">&#10007;</span>}>
                      Komari 失败
                    </Chip>
                  )}
                  {allProvisionResult.pika && (
                    <Chip size="sm" color="success" variant="flat" startContent={<span className="ml-1">&#10003;</span>}>
                      Pika {allProvisionResult.pika.uuid?.slice(0, 8)}
                    </Chip>
                  )}
                  {allProvisionResult.pikaError && (
                    <Chip size="sm" color="danger" variant="flat" startContent={<span className="ml-1">&#10007;</span>}>
                      Pika 失败
                    </Chip>
                  )}
                  {allProvisionResult.gost && (
                    <Chip size="sm" color="success" variant="flat" startContent={<span className="ml-1">&#10003;</span>}>
                      GOST {allProvisionResult.gost.nodeName}
                    </Chip>
                  )}
                  {allProvisionResult.gostError && (
                    <Chip size="sm" color="danger" variant="flat" startContent={<span className="ml-1">&#10007;</span>}>
                      GOST 失败
                    </Chip>
                  )}
                </div>

                {/* Error details (only show if there are errors) */}
                {(allProvisionResult.komariError || allProvisionResult.pikaError || allProvisionResult.gostError) && (
                  <div className="rounded-lg border border-danger-200 bg-danger-50/50 dark:border-danger-800 dark:bg-danger-950/30 p-2.5 text-xs text-danger-600 dark:text-danger-400 space-y-1">
                    {allProvisionResult.komariError && <p>Komari: {allProvisionResult.komariError}</p>}
                    {allProvisionResult.pikaError && <p>Pika: {allProvisionResult.pikaError}</p>}
                    {allProvisionResult.gostError && <p>GOST: {allProvisionResult.gostError}</p>}
                  </div>
                )}

                {/* Install command with region toggle */}
                {allProvisionResult.combinedCommand && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">安装命令</p>
                      {allProvisionResult.combinedCommandCn && (
                        <div className="flex rounded-lg bg-default-100 dark:bg-default-50 p-0.5">
                          <button type="button"
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${provisionCmdRegion === 'cn' ? 'bg-warning-500 text-white shadow-sm' : 'text-default-500 hover:text-default-700'}`}
                            onClick={() => setProvisionCmdRegion('cn')}>
                            国内加速
                          </button>
                          <button type="button"
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${provisionCmdRegion === 'overseas' ? 'bg-primary text-white shadow-sm' : 'text-default-500 hover:text-default-700'}`}
                            onClick={() => setProvisionCmdRegion('overseas')}>
                            海外直连
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="mb-2 text-xs text-default-500">
                      {provisionCmdRegion === 'cn' && allProvisionResult.combinedCommandCn
                        ? '使用 GitHub 镜像加速，适合国内服务器：'
                        : '复制以下命令到 VPS 上以 root 执行：'}
                    </p>
                    {(() => {
                      const cmd = provisionCmdRegion === 'cn' && allProvisionResult.combinedCommandCn
                        ? allProvisionResult.combinedCommandCn
                        : allProvisionResult.combinedCommand;
                      const isCn = provisionCmdRegion === 'cn' && !!allProvisionResult.combinedCommandCn;
                      return (
                        <div className={`relative rounded-lg p-3 ${isCn ? 'bg-warning-50 dark:bg-warning-950/30 border border-warning-200 dark:border-warning-800' : 'bg-default-100 dark:bg-default-50'}`}>
                          <code className="block whitespace-pre-wrap break-all text-xs leading-relaxed pr-14">
                            {cmd}
                          </code>
                          <Button size="sm" color={isCn ? 'warning' : 'primary'} variant="flat" className="absolute right-2 top-2"
                            onPress={() => copyToClipboard(cmd)}>
                            复制
                          </Button>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Detail accordion for each component */}
                {(allProvisionResult.komari || allProvisionResult.pika) && (
                  <Accordion variant="light" isCompact>
                    {[
                      allProvisionResult.komari && (
                        <AccordionItem key="komari" title="Komari 安装参数" classNames={{ title: "text-xs text-default-400" }}>
                          <div className="space-y-1.5 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-default-500 min-w-[60px]">Endpoint</span>
                              <code className="flex-1 truncate rounded bg-default-100 px-2 py-0.5">{allProvisionResult.komari!.endpoint}</code>
                              <Button size="sm" variant="light" className="h-6 min-w-0 px-2" onPress={() => copyToClipboard(allProvisionResult.komari!.endpoint)}>复制</Button>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-default-500 min-w-[60px]">Token</span>
                              <code className="flex-1 truncate rounded bg-default-100 px-2 py-0.5">{allProvisionResult.komari!.token}</code>
                              <Button size="sm" variant="light" className="h-6 min-w-0 px-2" onPress={() => copyToClipboard(allProvisionResult.komari!.token)}>复制</Button>
                            </div>
                          </div>
                        </AccordionItem>
                      ),
                      allProvisionResult.pika && (
                        <AccordionItem key="pika" title="Pika 安装参数 & 手动指引" classNames={{ title: "text-xs text-default-400" }}>
                          <div className="space-y-2 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-default-500 min-w-[60px]">Endpoint</span>
                              <code className="flex-1 truncate rounded bg-default-100 px-2 py-0.5">{allProvisionResult.pika!.endpoint}</code>
                              <Button size="sm" variant="light" className="h-6 min-w-0 px-2" onPress={() => copyToClipboard(allProvisionResult.pika!.endpoint)}>复制</Button>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-default-500 min-w-[60px]">Token</span>
                              <code className="flex-1 truncate rounded bg-default-100 px-2 py-0.5">{allProvisionResult.pika!.token}</code>
                              <Button size="sm" variant="light" className="h-6 min-w-0 px-2" onPress={() => copyToClipboard(allProvisionResult.pika!.token)}>复制</Button>
                            </div>
                            <div className="mt-2 rounded border border-default-200 bg-default-50 p-2 space-y-1.5">
                              <p className="font-medium text-default-600">手动安装指引</p>
                              {provisionForm.osPlatform === 'windows' ? (
                                <>
                                  <p className="text-default-500">Windows PowerShell（管理员）手动操作：</p>
                                  <p className="text-default-500">1. 下载：<code className="bg-default-100 px-1 rounded text-[10px]">Invoke-WebRequest -Uri "{allProvisionResult.pika!.endpoint}/api/agent/downloads/agent-windows-{provisionForm.osArch}.exe?key={allProvisionResult.pika!.token}" -OutFile "pika-agent.exe"</code></p>
                                  <p className="text-default-500">2. 注册并安装：<code className="bg-default-100 px-1 rounded text-[10px]">.\pika-agent.exe register --endpoint '{allProvisionResult.pika!.endpoint}' --token '{allProvisionResult.pika!.token}' --yes</code></p>
                                </>
                              ) : (
                                <>
                                  <p className="text-default-500">{provisionForm.osPlatform === 'macos' ? 'macOS' : 'Linux'} 一键脚本（自动检测架构）：</p>
                                  <p className="text-default-500"><code className="bg-default-100 px-1 rounded text-[10px]">curl -fsSL "{allProvisionResult.pika!.endpoint}/api/agent/install.sh?token={allProvisionResult.pika!.token}" | sudo bash</code></p>
                                  <p className="text-[10px] text-default-400 mt-0.5">支持 amd64 / arm64 / loongarch64，脚本自动识别当前系统架构</p>
                                </>
                              )}
                            </div>
                          </div>
                        </AccordionItem>
                      ),
                    ].filter(Boolean) as React.ReactElement[]}
                  </Accordion>
                )}

                {/* Verification */}
                <div className="rounded-lg border border-primary/20 bg-primary-50/30 dark:bg-primary-50/5 p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <Button size="sm" color={provisionNodeVerified ? 'success' : 'primary'} variant="flat" isLoading={provisionSyncLoading} onPress={handleProvisionSync} isDisabled={!(canCreateAssets || canUpdateAssets)}>
                      {provisionNodeVerified ? '已验证 ✓' : '同步验证'}
                    </Button>
                    <span className="text-xs text-default-500">执行安装命令后，点击验证探针是否上线</span>
                  </div>
                  {provisionNodeStatus && (
                    <div className={`text-xs whitespace-pre-wrap rounded p-2 ${provisionNodeVerified ? 'bg-success-50 dark:bg-success-950/30 text-success-700 dark:text-success-400' : 'bg-warning-50 dark:bg-warning-950/30 text-warning-700 dark:text-warning-400'}`}>
                      {provisionNodeStatus}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </ModalBody>
          <ModalFooter>
            {provisionStep === 'select' ? (
              <>
                <Button variant="flat" onPress={onProvisionClose}>取消</Button>
                <Button color="primary" isLoading={provisionLoading} onPress={handleProvision}
                  isDisabled={
                    !(canCreateAssets || canUpdateAssets) ||
                    !provisionName.trim() ||
                    !provisionForm.primaryIp.trim() ||
                    !provisionForm.provider ||
                    !provisionForm.purchaseDate ||
                    (!provisionForm.neverExpire && !provisionForm.expireDate) ||
                    !provisionForm.billingCycle ||
                    !provisionForm.monthlyCost ||
                    !provisionForm.bandwidthMbps ||
                    (!provisionForm.trafficUnlimited && !provisionForm.monthlyTrafficGb) ||
                    (provisionKomariEnabled && !provisionKomariId) ||
                    (provisionPikaEnabled && !provisionPikaId)
                  }>
                  添加服务器
                </Button>
              </>
            ) : (
              <>
                {provisionNodeVerified ? (
                  <Button color="success" onPress={() => { onProvisionClose(); void loadAssets(); }}>完成</Button>
                ) : (
                  <Button color="default" variant="flat" onPress={() => {
                    if (window.confirm('节点尚未验证上线，确定要关闭吗？您可以稍后在探针页面手动同步。')) {
                      onProvisionClose(); void loadAssets();
                    }
                  }}>跳过验证并关闭</Button>
                )}
              </>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Batch Edit Modal */}
      <Modal isOpen={isBatchOpen} onOpenChange={(open) => !open && onBatchClose()} size="lg">
        <ModalContent>
          <ModalHeader>批量修改 ({selectedIds.size} 个资产)</ModalHeader>
          <ModalBody className="space-y-4">
            <Select
              label="修改字段"
              selectedKeys={[batchField]}
              onSelectionChange={(keys) => { const v = Array.from(keys)[0] as string; setBatchField(v); setBatchValue(''); }}
            >
              <SelectItem key="tags">标签</SelectItem>
              <SelectItem key="region">地区</SelectItem>
              <SelectItem key="environment">环境</SelectItem>
              <SelectItem key="provider">供应商</SelectItem>
              <SelectItem key="role">角色</SelectItem>
              <SelectItem key="purpose">核心用途</SelectItem>
              <SelectItem key="osCategory">操作系统类别</SelectItem>
              <SelectItem key="monthlyCost">费用</SelectItem>
              <SelectItem key="currency">货币</SelectItem>
              <SelectItem key="billingCycle">付费周期</SelectItem>
              <SelectItem key="bandwidthMbps">带宽 (Mbps)</SelectItem>
              <SelectItem key="monthlyTrafficGb">月流量 (GB)</SelectItem>
              <SelectItem key="sshPort">SSH端口</SelectItem>
              <SelectItem key="remark">备注</SelectItem>
            </Select>

            {batchField === 'region' ? (
              <Select label="地区" selectedKeys={batchValue ? [batchValue] : []}
                onSelectionChange={(keys) => setBatchValue(Array.from(keys)[0] as string || '')}>
                {REGIONS.map(r => <SelectItem key={r.key}>{r.flag} {r.label}</SelectItem>)}
              </Select>
            ) : batchField === 'environment' ? (
              <Select label="环境" selectedKeys={batchValue ? [batchValue] : []}
                onSelectionChange={(keys) => setBatchValue(Array.from(keys)[0] as string || '')}>
                {allEnvironmentOptions.filter(e => e.key).map(e => <SelectItem key={e.key}>{e.label}</SelectItem>)}
              </Select>
            ) : batchField === 'role' ? (
              <Select label="角色" selectedKeys={batchValue ? [batchValue] : []}
                onSelectionChange={(keys) => setBatchValue(Array.from(keys)[0] as string || '')}>
                {ROLES.map(r => <SelectItem key={r.key}>{r.label}</SelectItem>)}
              </Select>
            ) : batchField === 'osCategory' ? (
              <Select label="操作系统类别" selectedKeys={batchValue ? [batchValue] : []}
                onSelectionChange={(keys) => setBatchValue(Array.from(keys)[0] as string || '')}>
                {OS_CATEGORIES.map(o => <SelectItem key={o.key}>{o.label}</SelectItem>)}
              </Select>
            ) : batchField === 'provider' ? (
              <Select label="供应商" selectedKeys={batchValue ? [batchValue] : []}
                onSelectionChange={(keys) => setBatchValue(Array.from(keys)[0] as string || '')}>
                {allProviderOptions.filter(p => p.key).map(p => <SelectItem key={p.key}>{p.label}</SelectItem>)}
              </Select>
            ) : batchField === 'currency' ? (
              <Select label="货币" selectedKeys={batchValue ? [batchValue] : []}
                onSelectionChange={(keys) => setBatchValue(Array.from(keys)[0] as string || '')}>
                {CURRENCIES.map(r => <SelectItem key={r.key}>{r.label}</SelectItem>)}
              </Select>
            ) : batchField === 'billingCycle' ? (
              <Select label="付费周期" selectedKeys={batchValue ? [batchValue] : []}
                onSelectionChange={(keys) => setBatchValue(Array.from(keys)[0] as string || '')}>
                {BILLING_CYCLES.map(r => <SelectItem key={r.key}>{r.label}</SelectItem>)}
              </Select>
            ) : batchField === 'tags' ? (
              <div className="space-y-2">
                <Input label="添加标签 (逗号分隔)" value={batchValue}
                  onValueChange={setBatchValue} placeholder="标签1,标签2" />
                {assetTagCounts.length > 0 && (
                  <div>
                    <p className="text-[10px] text-default-400 mb-1">点击已有标签快速添加:</p>
                    <div className="flex flex-wrap gap-1">
                      {assetTagCounts.map(([tag]) => (
                        <button key={tag} type="button"
                          className={`px-2 py-0.5 rounded-full text-[11px] border transition-all cursor-pointer ${
                            batchValue.split(',').map(t => t.trim()).includes(tag)
                              ? 'border-primary bg-primary-100 text-primary dark:bg-primary/20'
                              : 'border-divider text-default-500 hover:border-primary/40'
                          }`}
                          onClick={() => {
                            const current = batchValue.split(',').map(t => t.trim()).filter(Boolean);
                            if (current.includes(tag)) {
                              setBatchValue(current.filter(t => t !== tag).join(','));
                            } else {
                              setBatchValue([...current, tag].join(','));
                            }
                          }}>
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-default-400">批量标签使用「合并」模式，不会覆盖已有标签</p>
              </div>
            ) : (
              <Input label="新值" value={batchValue} onValueChange={setBatchValue} />
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onBatchClose}>取消</Button>
            <Button color="primary" isLoading={batchLoading} onPress={handleBatchUpdate} isDisabled={!(canCreateAssets || canUpdateAssets)}>
              确认修改
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Alert Detail Popover */}
      <Modal isOpen={alertPopoverAssetId !== null} onClose={() => { setAlertPopoverAssetId(null); setSnoozeDialogOpen(false); }} size="md">
        <ModalContent>
          <ModalHeader className="text-base">活跃告警 — {alertPopoverName}</ModalHeader>
          <ModalBody>
            {alertPopoverLoading ? (
              <div className="flex justify-center py-6"><Spinner size="sm" /></div>
            ) : alertPopoverData.length === 0 ? (
              <p className="text-center text-default-400 text-sm py-6">该资产暂无活跃告警</p>
            ) : (
              <div className="space-y-2">
                {/* Sort: active first, snoozed last */}
                {[...alertPopoverData].sort((a, b) => {
                  const aS = isSnoozed(a.ruleId, a.nodeId) ? 1 : 0;
                  const bS = isSnoozed(b.ruleId, b.nodeId) ? 1 : 0;
                  return aS - bS;
                }).map((a: any, i: number) => {
                  const snoozedUntil = isSnoozed(a.ruleId, a.nodeId);
                  return (
                    <div key={i} className={`rounded-lg border p-2.5 flex items-start gap-2 ${snoozedUntil ? 'border-default-200 bg-default-50 opacity-60' : 'border-divider/40'}`}>
                      <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                        snoozedUntil ? 'bg-default-300' :
                        a.severity === 'critical' ? 'bg-danger animate-pulse' : a.severity === 'warning' ? 'bg-warning' : 'bg-primary'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-sm font-medium ${snoozedUntil ? 'text-default-400' : ''}`}>{a.ruleName}</span>
                          <Chip size="sm" variant="flat" className="h-4 text-[9px]"
                            color={snoozedUntil ? 'default' : a.severity === 'critical' ? 'danger' : a.severity === 'warning' ? 'warning' : 'default'}>
                            {a.severity === 'critical' ? '严重' : a.severity === 'warning' ? '警告' : '提示'}
                          </Chip>
                          {a.category && <Chip size="sm" variant="flat" className="h-4 text-[9px]">{a.category}</Chip>}
                          {snoozedUntil && (
                            <Chip size="sm" variant="flat" color="default" className="h-4 text-[9px]">
                              已忽略 · 剩余{Math.ceil((snoozedUntil - Date.now()) / 86400000)}天
                            </Chip>
                          )}
                        </div>
                        <p className={`text-xs mt-0.5 ${snoozedUntil ? 'text-default-300' : 'text-default-500'}`}>{a.message}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-default-300">{a.timestamp ? new Date(a.timestamp).toLocaleString('zh-CN', { hour12: false }) : ''}</span>
                          {a.firstLogTime && !snoozedUntil && (
                            <span className="text-[10px] text-warning font-medium">{formatAlertDuration(a.firstLogTime)}</span>
                          )}
                        </div>
                      </div>
                      {snoozedUntil ? (
                        <Button size="sm" variant="flat" color="default" className="h-6 text-[10px] min-w-0 flex-shrink-0"
                          onPress={() => handleUnsnooze(a.ruleId, a.nodeId)}>
                          取消忽略
                        </Button>
                      ) : (
                        <Button size="sm" variant="flat" color="primary" className="h-6 text-[10px] min-w-0 flex-shrink-0"
                          onPress={() => handleAcknowledgeAlert(a.ruleId, a.nodeId)}>
                          已读
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ModalBody>
          <ModalFooter className="flex justify-between">
            <div className="flex gap-2">
              {alertPopoverData.some(a => !isSnoozed(a.ruleId, a.nodeId)) && (
                <>
                  <Button size="sm" variant="flat" onPress={handleAcknowledgeAll}>全部已读</Button>
                  <Button size="sm" variant="flat" color="warning" onPress={openSnoozeDialog}>忽略告警…</Button>
                </>
              )}
            </div>
            <Button size="sm" variant="light" onPress={() => setAlertPopoverAssetId(null)}>关闭</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Snooze Confirmation Dialog */}
      <Modal isOpen={snoozeDialogOpen} onClose={() => setSnoozeDialogOpen(false)} size="sm">
        <ModalContent>
          <ModalHeader className="text-sm">忽略告警</ModalHeader>
          <ModalBody>
            <p className="text-xs text-default-500 mb-2">选择要忽略的告警规则，忽略期间仅记录日志、不再弹出提醒。仅对当前用户生效。</p>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {alertPopoverData.filter(a => !isSnoozed(a.ruleId, a.nodeId)).map((a: any, i: number) => {
                const k = snoozeKey(a.ruleId, a.nodeId);
                return (
                  <label key={i} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-default-100 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 rounded accent-warning cursor-pointer"
                      checked={snoozeChecked.has(k)}
                      onChange={(e) => {
                        setSnoozeChecked(prev => {
                          const next = new Set(prev);
                          e.target.checked ? next.add(k) : next.delete(k);
                          return next;
                        });
                      }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm">{a.ruleName}</span>
                      <Chip size="sm" variant="flat" className="h-4 text-[9px] ml-1.5"
                        color={a.severity === 'critical' ? 'danger' : a.severity === 'warning' ? 'warning' : 'default'}>
                        {a.severity === 'critical' ? '严重' : a.severity === 'warning' ? '警告' : '提示'}
                      </Chip>
                      <p className="text-[10px] text-default-400 truncate">{a.message}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-divider/40">
              <span className="text-xs text-default-500 whitespace-nowrap">忽略时长</span>
              <Input size="sm" type="number" className="w-20" value={String(snoozeDays)}
                onValueChange={(v) => setSnoozeDays(Math.max(1, parseInt(v) || 7))} />
              <span className="text-xs text-default-500">天</span>
              <div className="flex gap-1 ml-auto">
                {[3, 7, 14, 30].map(d => (
                  <Button key={d} size="sm" variant={snoozeDays === d ? 'solid' : 'flat'} color={snoozeDays === d ? 'warning' : 'default'}
                    className="h-6 text-[10px] min-w-0 px-2" onPress={() => setSnoozeDays(d)}>
                    {d}天
                  </Button>
                ))}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="light" onPress={() => setSnoozeDialogOpen(false)}>取消</Button>
            <Button size="sm" color="warning" onPress={confirmSnooze}>
              确认忽略 ({snoozeChecked.size})
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
