import { useEffect, useMemo, useState } from 'react';
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
import { Accordion, AccordionItem } from "@heroui/accordion";
import { Progress } from "@heroui/progress";
// Table imports removed - using native HTML table for better control
import toast from 'react-hot-toast';

import {
  AssetHost,
  AssetHostDetail,
  MonitorInstance,
  MonitorNodeSnapshot,
  MonitorProvisionResult,
  XuiInstance,
  createAsset,
  deleteAsset,
  getAssetDetail,
  getAssetList,
  getMonitorList,
  getMonitorUnboundNodes,
  provisionMonitorAgent,
  updateAsset
} from '@/api';
import { isAdmin } from '@/utils/auth';
import { useNavigate } from 'react-router-dom';

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
  tags: string;
  monitorNodeUuid: string;
  remark: string;
}

const emptyForm = (): AssetForm => ({
  name: '', label: '', primaryIp: '', ipv6: '', environment: '', provider: '', region: '',
  role: '', os: '', cpuCores: '', memTotalMb: '', diskTotalGb: '', bandwidthMbps: '',
  monthlyTrafficGb: '', sshPort: '', purchaseDate: '', expireDate: '', monthlyCost: '',
  currency: 'CNY', tags: '', monitorNodeUuid: '', remark: '',
});

const ROLES = [
  { key: '', label: '未指定' },
  { key: 'entry', label: '入口' },
  { key: 'relay', label: '中转' },
  { key: 'landing', label: '落地' },
  { key: 'standalone', label: '独立' },
];

const CURRENCIES = [
  { key: 'CNY', label: 'CNY' },
  { key: 'USD', label: 'USD' },
  { key: 'EUR', label: 'EUR' },
  { key: 'JPY', label: 'JPY' },
];

const normalizeKeyword = (value?: string | null) => (value || '').trim().toLowerCase();

const formatDateShort = (timestamp?: number | null) => {
  if (!timestamp) return '-';
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
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
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
  <div className="flex items-center gap-1.5 h-4 text-xs font-mono">
    <span className="w-7 text-[10px] font-bold tracking-wider opacity-70 flex-shrink-0">{label}</span>
    <div className="w-[80px] h-1.5 bg-default-200 dark:bg-default-100 relative overflow-hidden rounded-sm flex-shrink-0">
      <div
        className={`h-full transition-all duration-500 ease-out rounded-sm ${color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
    <span className={`w-9 text-right text-[11px] font-medium ${
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
  const admin = isAdmin();
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assets, setAssets] = useState<AssetHost[]>([]);
  const [expandedAssetId, setExpandedAssetId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AssetHostDetail | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [form, setForm] = useState<AssetForm>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [isEdit, setIsEdit] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<AssetHost | null>(null);
  const [unboundNodes, setUnboundNodes] = useState<MonitorNodeSnapshot[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [monitorInstances, setMonitorInstances] = useState<MonitorInstance[]>([]);
  const [provisionStep, setProvisionStep] = useState<'select' | 'result'>('select');
  const [provisionName, setProvisionName] = useState('');
  const [provisionInstanceId, setProvisionInstanceId] = useState<string>('');
  const [provisionLoading, setProvisionLoading] = useState(false);
  const [provisionResult, setProvisionResult] = useState<MonitorProvisionResult | null>(null);
  const [filterRole, setFilterRole] = useState<string | null>(null);

  const { isOpen: isFormOpen, onOpen: onFormOpen, onClose: onFormClose } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
  const { isOpen: isProvisionOpen, onOpen: onProvisionOpen, onClose: onProvisionClose } = useDisclosure();
  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure();

  useEffect(() => { void loadAssets(); }, []);
  useEffect(() => {
    if (!expandedAssetId) { setDetail(null); return; }
    void loadAssetDetail(expandedAssetId);
  }, [expandedAssetId]);

  const summary = useMemo(() => {
    const online = assets.filter(a => a.monitorOnline === 1).length;
    const hasMonitor = assets.filter(a => a.monitorNodeUuid).length;
    return {
      totalAssets: assets.length,
      onlineAssets: online,
      offlineAssets: hasMonitor - online,
      noMonitor: assets.length - hasMonitor,
      totalXuiInstances: assets.reduce((s, i) => s + (i.totalXuiInstances || 0), 0),
      totalForwards: assets.reduce((s, i) => s + (i.totalForwards || 0), 0),
      totalClients: assets.reduce((s, i) => s + (i.totalClients || 0), 0),
    };
  }, [assets]);

  const roleFilters = useMemo(() => {
    const counts: Record<string, number> = {};
    assets.forEach(a => {
      const role = a.role || 'none';
      counts[role] = (counts[role] || 0) + 1;
    });
    return counts;
  }, [assets]);

  const filteredAssets = useMemo(() => {
    let list = assets;
    if (filterRole) {
      list = list.filter(a => (filterRole === 'none' ? !a.role : a.role === filterRole));
    }
    const kw = normalizeKeyword(searchKeyword);
    if (kw) {
      list = list.filter((item) =>
        [item.name, item.label, item.primaryIp, item.environment, item.provider, item.region, item.role, item.remark, item.tags]
          .some((v) => normalizeKeyword(v).includes(kw))
      );
    }
    return list;
  }, [assets, searchKeyword, filterRole]);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const response = await getAssetList();
      if (response.code !== 0) { toast.error(response.msg || '操作失败'); return; }
      setAssets(response.data || []);
    } catch { toast.error('加载资产失败'); }
    finally { setLoading(false); }
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

  const openCreateModal = () => {
    setIsEdit(false); setErrors({}); setForm(emptyForm()); setUnboundNodes([]);
    onFormOpen();
    void loadUnboundNodes();
  };

  const loadUnboundNodes = async () => {
    setImportLoading(true);
    try {
      const res = await getMonitorUnboundNodes();
      if (res.code === 0) setUnboundNodes(res.data || []);
    } catch { /* ignore */ }
    finally { setImportLoading(false); }
  };

  const importFromNode = (node: MonitorNodeSnapshot) => {
    const memMb = node.memTotal ? Math.round(node.memTotal / (1024 * 1024)) : undefined;
    const diskGb = node.diskTotal ? Math.round(node.diskTotal / (1024 * 1024 * 1024)) : undefined;
    setForm(p => ({
      ...p,
      name: p.name || node.name || '',
      primaryIp: p.primaryIp || node.ip || '',
      ipv6: p.ipv6 || node.ipv6 || '',
      os: node.os || p.os,
      cpuCores: node.cpuCores?.toString() || p.cpuCores,
      memTotalMb: memMb?.toString() || p.memTotalMb,
      diskTotalGb: diskGb?.toString() || p.diskTotalGb,
      region: node.region || p.region,
      monitorNodeUuid: node.remoteNodeUuid || p.monitorNodeUuid,
    }));
    toast.success(`已导入探针节点: ${node.name || node.ip}`);
  };

  const openProvisionModal = async () => {
    setProvisionStep('select');
    setProvisionName('');
    setProvisionInstanceId('');
    setProvisionResult(null);
    onProvisionOpen();
    try {
      const res = await getMonitorList();
      if (res.code === 0) setMonitorInstances(res.data || []);
    } catch { /* ignore */ }
  };

  const handleProvision = async () => {
    const iid = parseInt(provisionInstanceId);
    if (!iid) { toast.error('请选择探针实例'); return; }
    setProvisionLoading(true);
    try {
      const res = await provisionMonitorAgent(iid, provisionName || undefined);
      if (res.code === 0 && res.data) {
        setProvisionResult(res.data);
        setProvisionStep('result');
        toast.success('客户端创建成功');
      } else {
        toast.error(res.msg || '创建失败');
      }
    } catch { toast.error('请求失败'); }
    finally { setProvisionLoading(false); }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('已复制到剪贴板'));
  };

  const openEditModal = (asset: AssetHost) => {
    setIsEdit(true); setErrors({});
    setForm({
      id: asset.id, name: asset.name, label: asset.label || '', primaryIp: asset.primaryIp || '',
      ipv6: asset.ipv6 || '', environment: asset.environment || '', provider: asset.provider || '',
      region: asset.region || '', role: asset.role || '', os: asset.os || '',
      cpuCores: asset.cpuCores?.toString() || '', memTotalMb: asset.memTotalMb?.toString() || '',
      diskTotalGb: asset.diskTotalGb?.toString() || '', bandwidthMbps: asset.bandwidthMbps?.toString() || '',
      monthlyTrafficGb: asset.monthlyTrafficGb?.toString() || '', sshPort: asset.sshPort?.toString() || '',
      purchaseDate: tsToDateInput(asset.purchaseDate), expireDate: tsToDateInput(asset.expireDate),
      monthlyCost: asset.monthlyCost || '', currency: asset.currency || 'CNY',
      tags: asset.tags || '', monitorNodeUuid: asset.monitorNodeUuid || '', remark: asset.remark || '',
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
        cpuCores: form.cpuCores ? parseInt(form.cpuCores) : null,
        memTotalMb: form.memTotalMb ? parseInt(form.memTotalMb) : null,
        diskTotalGb: form.diskTotalGb ? parseInt(form.diskTotalGb) : null,
        bandwidthMbps: form.bandwidthMbps ? parseInt(form.bandwidthMbps) : null,
        monthlyTrafficGb: form.monthlyTrafficGb ? parseInt(form.monthlyTrafficGb) : null,
        sshPort: form.sshPort ? parseInt(form.sshPort) : null,
        purchaseDate: dateInputToTs(form.purchaseDate) ?? null,
        expireDate: dateInputToTs(form.expireDate) ?? null,
        monthlyCost: form.monthlyCost.trim() || null,
        currency: form.currency || null,
        tags: form.tags.trim() || null,
        monitorNodeUuid: form.monitorNodeUuid.trim() || null,
        remark: form.remark.trim() || null,
      };
      const response = isEdit ? await updateAsset(payload) : await createAsset(payload);
      if (response.code !== 0) { toast.error(response.msg || '操作失败'); return; }
      toast.success(isEdit ? '已更新' : '已创建');
      onFormClose();
      await loadAssets();
    } catch { toast.error('操作失败'); }
    finally { setSubmitLoading(false); }
  };

  const openDeleteModal = (asset: AssetHost) => { setAssetToDelete(asset); onDeleteOpen(); };
  const handleDelete = async () => {
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

  const openDetailModal = (assetId: number) => {
    setExpandedAssetId(assetId);
    onDetailOpen();
  };

  if (!admin) {
    return (
      <Card className="border border-danger/20 bg-danger-50/60">
        <CardBody className="p-6">
          <h1 className="text-xl font-semibold text-danger">Admin Only</h1>
        </CardBody>
      </Card>
    );
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  }

  const expiringSoon = assets.filter(a => a.expireDate && a.expireDate < Date.now() + 30 * 86400000 && a.expireDate > Date.now());

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
          <Button color="primary" size="sm" onPress={openProvisionModal}>添加服务器</Button>
          <Button variant="flat" size="sm" onPress={openCreateModal}>手动新建</Button>
        </div>
      </div>

      {/* Summary Stats - 4 compact cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <div className="rounded-xl border border-divider/60 bg-content1 p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">Total</p>
          <p className="text-2xl font-bold font-mono">{summary.totalAssets}</p>
        </div>
        <div className="rounded-xl border border-success/20 bg-success-50/30 dark:bg-success-50/10 p-3">
          <p className="text-[10px] font-bold tracking-widest text-success uppercase">Online</p>
          <p className="text-2xl font-bold font-mono text-success">{summary.onlineAssets}</p>
        </div>
        <div className={`rounded-xl border p-3 ${summary.offlineAssets > 0 ? 'border-danger/20 bg-danger-50/30 dark:bg-danger-50/10' : 'border-divider/60 bg-content1'}`}>
          <p className={`text-[10px] font-bold tracking-widest uppercase ${summary.offlineAssets > 0 ? 'text-danger' : 'text-default-400'}`}>Offline</p>
          <p className={`text-2xl font-bold font-mono ${summary.offlineAssets > 0 ? 'text-danger' : 'text-default-300'}`}>{summary.offlineAssets}</p>
        </div>
        <div className="rounded-xl border border-divider/60 bg-content1 p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">Integrations</p>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold font-mono">{summary.totalXuiInstances}</span>
            <span className="text-[10px] text-default-400">XUI</span>
            <span className="text-lg font-bold font-mono">{summary.totalForwards}</span>
            <span className="text-[10px] text-default-400">FWD</span>
          </div>
        </div>
      </div>

      {/* Expiry Warnings */}
      {expiringSoon.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning-50/60 p-3 text-sm text-warning-700 dark:text-warning-400">
          {expiringSoon.length} 台资产将在 30 天内到期: {expiringSoon.map(a => a.name).join(', ')}
        </div>
      )}

      {/* Filter + Search bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          className="sm:max-w-xs"
          size="sm"
          value={searchKeyword}
          onValueChange={setSearchKeyword}
          placeholder="搜索名称、IP、供应商、地区..."
          isClearable
          onClear={() => setSearchKeyword('')}
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
              !filterRole ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
            }`}
            onClick={() => setFilterRole(null)}
          >
            ALL ({assets.length})
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
      </div>

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
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold tracking-widest text-default-400 uppercase w-[220px]">Server</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold tracking-widest text-default-400 uppercase w-[200px]">Telemetry</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold tracking-widest text-default-400 uppercase w-[140px]">Network</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold tracking-widest text-default-400 uppercase w-[140px]">Provider</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold tracking-widest text-default-400 uppercase w-[100px]">Expire</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold tracking-widest text-default-400 uppercase w-[100px]">Links</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((asset) => {
                    const isOnline = asset.monitorOnline === 1;
                    const hasMonitor = !!asset.monitorNodeUuid;
                    const cpu = asset.monitorCpuUsage || 0;
                    const memPct = asset.monitorMemTotal ? ((asset.monitorMemUsed || 0) / asset.monitorMemTotal * 100) : 0;
                    const roleChip = getRoleChip(asset.role);
                    const isExpiringSoon = asset.expireDate && asset.expireDate < Date.now() + 30 * 86400000;

                    return (
                      <tr
                        key={asset.id}
                        className="border-b border-divider/40 hover:bg-primary-50/40 dark:hover:bg-primary-50/10 transition-colors cursor-pointer group"
                        onClick={() => openDetailModal(asset.id)}
                      >
                        {/* Server identity */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${
                              isOnline ? 'bg-success animate-pulse' : hasMonitor ? 'bg-danger' : 'bg-default-300'
                            }`} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate font-semibold text-sm">{asset.name}</span>
                                {roleChip && (
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    roleChip.color === 'primary' ? 'bg-primary-100 text-primary dark:bg-primary/20' :
                                    roleChip.color === 'warning' ? 'bg-warning-100 text-warning dark:bg-warning/20' :
                                    roleChip.color === 'success' ? 'bg-success-100 text-success dark:bg-success/20' :
                                    'bg-secondary-100 text-secondary dark:bg-secondary/20'
                                  }`}>{roleChip.text}</span>
                                )}
                              </div>
                              <p className="truncate text-[11px] text-default-400 font-mono">
                                {asset.primaryIp || '-'}
                                {asset.os ? <span className="ml-1 opacity-60">/ {asset.os}</span> : null}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Telemetry - CPU/MEM bars */}
                        <td className="px-3 py-2.5">
                          {hasMonitor && isOnline ? (
                            <div className="space-y-0.5">
                              <ResourceBar label="CPU" value={cpu} color={barColorClass(cpu)} />
                              <ResourceBar label="MEM" value={memPct} color={barColorClass(memPct)} />
                            </div>
                          ) : hasMonitor ? (
                            <span className="text-[11px] text-danger font-mono">OFFLINE</span>
                          ) : (
                            <span className="text-[11px] text-default-300 font-mono">-</span>
                          )}
                        </td>

                        {/* Network speed */}
                        <td className="px-3 py-2.5">
                          {hasMonitor && isOnline ? (
                            <div className="space-y-0.5 font-mono text-[11px]">
                              <div className="flex items-center gap-1">
                                <span className="text-success">&#x2193;</span>
                                <span>{formatSpeed(asset.monitorNetIn)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-primary">&#x2191;</span>
                                <span>{formatSpeed(asset.monitorNetOut)}</span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-default-300 font-mono">-</span>
                          )}
                        </td>

                        {/* Provider & Cost */}
                        <td className="px-3 py-2.5">
                          <p className="truncate text-xs">{asset.provider || '-'}</p>
                          {asset.monthlyCost && (
                            <p className="text-[11px] text-default-400 font-mono">{asset.monthlyCost} {asset.currency || ''}/mo</p>
                          )}
                        </td>

                        {/* Expire */}
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-mono ${isExpiringSoon ? 'text-warning font-semibold' : 'text-default-500'}`}>
                            {formatDateShort(asset.expireDate)}
                          </span>
                        </td>

                        {/* Integration links */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-default-400">
                            {asset.totalXuiInstances > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-primary-50 text-primary dark:bg-primary/10">
                                {asset.totalXuiInstances} XUI
                              </span>
                            )}
                            {asset.totalForwards > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-secondary-50 text-secondary dark:bg-secondary/10">
                                {asset.totalForwards} FWD
                              </span>
                            )}
                            {!asset.totalXuiInstances && !asset.totalForwards && '-'}
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
              const hasMonitor = !!asset.monitorNodeUuid;
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
                    <p className="mt-2 text-[11px] text-danger font-mono">OFFLINE</p>
                  )}

                  {/* Footer */}
                  <div className="mt-2 flex items-center justify-between text-[10px] text-default-400 border-t border-divider/40 pt-1.5">
                    <span>{asset.provider || '-'}{asset.monthlyCost ? ` / ${asset.monthlyCost}${asset.currency || ''}` : ''}</span>
                    <div className="flex gap-1.5">
                      {asset.totalXuiInstances > 0 && <span>{asset.totalXuiInstances} XUI</span>}
                      {asset.totalForwards > 0 && <span>{asset.totalForwards} FWD</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Detail Modal - shows full asset info, probe metrics, XUI, forwards */}
      <Modal isOpen={isDetailOpen} onOpenChange={(open) => !open && onDetailClose()} size="4xl" scrollBehavior="inside">
        <ModalContent>
          {selectedAsset && (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-3 w-3 rounded-full ${selectedAsset.monitorOnline === 1 ? 'bg-success animate-pulse' : selectedAsset.monitorNodeUuid ? 'bg-danger' : 'bg-default-300'}`} />
                  <span className="text-lg font-bold">{selectedAsset.name}</span>
                  {selectedAsset.label && <Chip size="sm" variant="flat">{selectedAsset.label}</Chip>}
                  {getRoleChip(selectedAsset.role) && <Chip size="sm" color={getRoleChip(selectedAsset.role)!.color} variant="flat">{getRoleChip(selectedAsset.role)!.text}</Chip>}
                </div>
                <p className="text-sm font-normal text-default-500 font-mono">{selectedAsset.primaryIp || '-'}{selectedAsset.ipv6 ? ` / ${selectedAsset.ipv6}` : ''}</p>
              </ModalHeader>
              <ModalBody className="space-y-4">
                {detailLoading && <div className="flex justify-center py-4"><Spinner /></div>}

                {/* Info Cards Grid */}
                <div className="grid gap-3 md:grid-cols-3">
                  {/* Server Info */}
                  <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">Server</p>
                      {selectedAsset.monitorNodeUuid && <Chip size="sm" variant="flat" color="secondary" classNames={{content: "text-[10px]"}}>Probe</Chip>}
                    </div>
                    <div className="space-y-1 text-xs">
                      <p className="flex justify-between"><span className="text-default-400">OS</span><span className="font-mono">{selectedAsset.os || '-'}</span></p>
                      <p className="flex justify-between"><span className="text-default-400">CPU</span><span className="font-mono">{selectedAsset.cpuCores || '?'} cores</span></p>
                      <p className="flex justify-between"><span className="text-default-400">RAM</span><span className="font-mono">{selectedAsset.memTotalMb ? `${selectedAsset.memTotalMb} MB` : '-'}</span></p>
                      <p className="flex justify-between"><span className="text-default-400">Disk</span><span className="font-mono">{selectedAsset.diskTotalGb ? `${selectedAsset.diskTotalGb} GB` : '-'}</span></p>
                      <p className="flex justify-between"><span className="text-default-400">BW</span><span className="font-mono">{selectedAsset.bandwidthMbps ? `${selectedAsset.bandwidthMbps} Mbps` : '-'}</span></p>
                      <p className="flex justify-between"><span className="text-default-400">SSH</span><span className="font-mono">{selectedAsset.sshPort || 22}</span></p>
                    </div>
                  </div>

                  {/* Provider & Cost */}
                  <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                    <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-2">Provider</p>
                    <div className="space-y-1 text-xs">
                      <p className="flex justify-between"><span className="text-default-400">Vendor</span><span>{selectedAsset.provider || '-'}</span></p>
                      <p className="flex justify-between"><span className="text-default-400">Region</span><span>{selectedAsset.region || '-'}</span></p>
                      <p className="flex justify-between"><span className="text-default-400">Cost</span><span className="font-mono">{selectedAsset.monthlyCost ? `${selectedAsset.monthlyCost} ${selectedAsset.currency || ''}/mo` : '-'}</span></p>
                      <p className="flex justify-between"><span className="text-default-400">Traffic</span><span className="font-mono">{selectedAsset.monthlyTrafficGb ? `${selectedAsset.monthlyTrafficGb} GB/mo` : '-'}</span></p>
                      <p className="flex justify-between"><span className="text-default-400">Purchase</span><span className="font-mono">{formatDateShort(selectedAsset.purchaseDate)}</span></p>
                      <p className="flex justify-between">
                        <span className="text-default-400">Expire</span>
                        <span className={`font-mono ${selectedAsset.expireDate && selectedAsset.expireDate < Date.now() + 30 * 86400000 ? 'text-warning font-semibold' : ''}`}>
                          {formatDateShort(selectedAsset.expireDate)}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Integrations */}
                  <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                    <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-2">Integrations</p>
                    <div className="space-y-1 text-xs">
                      <p className="flex justify-between"><span className="text-default-400">X-UI</span><span className="font-mono">{selectedAsset.totalXuiInstances || 0}</span></p>
                      <p className="flex justify-between"><span className="text-default-400">Protocols</span><span className="font-mono">{selectedAsset.totalProtocols || 0}</span></p>
                      <p className="flex justify-between"><span className="text-default-400">Inbounds</span><span className="font-mono">{selectedAsset.totalInbounds || 0}</span></p>
                      <p className="flex justify-between"><span className="text-default-400">Clients</span><span className="font-mono">{selectedAsset.totalClients || 0} ({selectedAsset.onlineClients || 0} online)</span></p>
                      <p className="flex justify-between"><span className="text-default-400">Forwards</span><span className="font-mono">{selectedAsset.totalForwards || 0}</span></p>
                      <p className="flex justify-between"><span className="text-default-400">GOST</span><span className="font-mono">{selectedAsset.gostNodeName || '-'}</span></p>
                    </div>
                  </div>
                </div>

                {selectedAsset.remark && (
                  <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3 text-xs">
                    <span className="text-default-400 mr-2">Remark:</span>{selectedAsset.remark}
                  </div>
                )}

                {/* Probe Monitor Metrics */}
                {detail?.monitorNodes && detail.monitorNodes.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-2">Probe Metrics</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {detail.monitorNodes.map((node: MonitorNodeSnapshot) => {
                        const m = node.latestMetric;
                        const memPct = m?.memTotal ? ((m.memUsed || 0) / m.memTotal * 100) : 0;
                        const diskPct = m?.diskTotal ? ((m.diskUsed || 0) / m.diskTotal * 100) : 0;
                        const swapPct = m?.swapTotal ? ((m.swapUsed || 0) / m.swapTotal * 100) : 0;
                        return (
                          <div key={node.id} className={`rounded-xl border p-3 ${
                            node.online === 1 ? 'border-divider/60 bg-content1' : 'border-danger/20 bg-danger-50/20'
                          }`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`inline-block h-2 w-2 rounded-full ${node.online === 1 ? 'bg-success animate-pulse' : 'bg-danger'}`} />
                                <span className="truncate font-semibold text-sm">{node.name || node.remoteNodeUuid.slice(0, 8)}</span>
                              </div>
                              <span className="text-[10px] font-mono text-default-400">v{node.version || '?'}</span>
                            </div>

                            {m && node.online === 1 ? (
                              <div className="space-y-1">
                                {/* Resource bars */}
                                <div className="flex items-center gap-1.5">
                                  <span className="w-8 text-[10px] font-bold text-default-400 tracking-wider">CPU</span>
                                  <Progress size="sm" value={m.cpuUsage || 0} color={barColorHero(m.cpuUsage || 0)} className="flex-1" aria-label="CPU" />
                                  <span className="w-10 text-right text-[11px] font-mono">{(m.cpuUsage || 0).toFixed(1)}%</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="w-8 text-[10px] font-bold text-default-400 tracking-wider">MEM</span>
                                  <Progress size="sm" value={memPct} color={barColorHero(memPct)} className="flex-1" aria-label="MEM" />
                                  <span className="w-10 text-right text-[11px] font-mono">{memPct.toFixed(0)}%</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="w-8 text-[10px] font-bold text-default-400 tracking-wider">DISK</span>
                                  <Progress size="sm" value={diskPct} color={barColorHero(diskPct)} className="flex-1" aria-label="DISK" />
                                  <span className="w-10 text-right text-[11px] font-mono">{diskPct.toFixed(0)}%</span>
                                </div>
                                {m.swapTotal && m.swapTotal > 0 && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-8 text-[10px] font-bold text-default-400 tracking-wider">SWAP</span>
                                    <Progress size="sm" value={swapPct} color={barColorHero(swapPct)} className="flex-1" aria-label="SWAP" />
                                    <span className="w-10 text-right text-[11px] font-mono">{swapPct.toFixed(0)}%</span>
                                  </div>
                                )}

                                {/* Compact stats */}
                                <div className="grid grid-cols-3 gap-1.5 pt-1">
                                  <div className="rounded-lg bg-default-100/60 px-2 py-1 text-center">
                                    <p className="text-[9px] text-default-400">NET IN</p>
                                    <p className="text-[11px] font-semibold font-mono">{formatSpeed(m.netIn)}</p>
                                  </div>
                                  <div className="rounded-lg bg-default-100/60 px-2 py-1 text-center">
                                    <p className="text-[9px] text-default-400">NET OUT</p>
                                    <p className="text-[11px] font-semibold font-mono">{formatSpeed(m.netOut)}</p>
                                  </div>
                                  <div className="rounded-lg bg-default-100/60 px-2 py-1 text-center">
                                    <p className="text-[9px] text-default-400">UPTIME</p>
                                    <p className="text-[11px] font-semibold font-mono">{formatUptime(m.uptime)}</p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-x-3 text-[10px] text-default-400 font-mono">
                                  <span>LOAD {m.load1?.toFixed(2) || '-'} / {m.load5?.toFixed(2) || '-'} / {m.load15?.toFixed(2) || '-'}</span>
                                  <span>TCP {m.connections || 0}{m.connectionsUdp ? ` UDP ${m.connectionsUdp}` : ''}</span>
                                  <span>PROC {m.processCount || 0}</span>
                                  {m.gpuUsage != null && m.gpuUsage > 0 && <span>GPU {m.gpuUsage.toFixed(1)}%</span>}
                                </div>
                                {/* Traffic totals */}
                                <div className="flex gap-3 text-[10px] text-default-400 font-mono">
                                  <span>&#x2193; {formatFlow(m.netTotalDown)}</span>
                                  <span>&#x2191; {formatFlow(m.netTotalUp)}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-[11px] text-danger font-mono py-2">CONNECTION_LOST</div>
                            )}

                            {/* Hardware info */}
                            <div className="mt-1.5 pt-1.5 border-t border-divider/40 text-[10px] text-default-400 font-mono space-y-0.5">
                              <p className="truncate">{node.cpuName || '-'} / {node.cpuCores || '?'}C{node.arch ? ` / ${node.arch}` : ''}</p>
                              {node.virtualization && <p>VIRT: {node.virtualization}</p>}
                              {node.kernelVersion && <p className="truncate">Kernel: {node.kernelVersion}</p>}
                              {node.gpuName && <p className="truncate">GPU: {node.gpuName}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* X-UI Instances */}
                {detail?.xuiInstances && detail.xuiInstances.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-2">X-UI Instances</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {detail.xuiInstances.map((inst) => {
                        const syncChip = getStatusChip(inst.lastSyncStatus);
                        return (
                          <button type="button" key={inst.id} onClick={() => navigate('/xui')}
                            className="rounded-xl border border-divider/60 bg-default-50/60 p-3 text-left transition-all hover:border-primary/40">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-sm">{inst.name}</p>
                                <p className="truncate text-[11px] text-default-400 font-mono">{buildInstanceAddress(inst)}</p>
                              </div>
                              <Chip size="sm" color={syncChip.color} variant="flat">{syncChip.text}</Chip>
                            </div>
                            <div className="mt-2 flex gap-3 text-[11px] text-default-500 font-mono">
                              <span>{inst.inboundCount || 0} inbounds</span>
                              <span>{inst.clientCount || 0} clients</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Protocol Summary */}
                {detail?.protocolSummaries && detail.protocolSummaries.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-2">Protocols</p>
                    <div className="flex flex-wrap gap-2">
                      {detail.protocolSummaries.map((p) => (
                        <div key={p.protocol} className="rounded-lg border border-divider/60 bg-default-50/60 px-3 py-2 text-xs">
                          <span className="font-bold uppercase">{p.protocol}</span>
                          <span className="ml-2 text-default-400 font-mono">
                            {p.inboundCount} in / {p.clientCount} clients ({p.onlineClientCount} online)
                          </span>
                          {p.allTime ? <span className="ml-2 text-default-400 font-mono">{formatFlow(p.allTime)}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Forwards */}
                {detail?.forwards && detail.forwards.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-2">Forwards</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {detail.forwards.map((item) => (
                        <button type="button" key={item.id} onClick={() => navigate('/forward')}
                          className="rounded-xl border border-divider/60 bg-default-50/60 p-2.5 text-left transition-all hover:border-primary/40 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium">{item.name}</span>
                            <Chip size="sm" color={item.status === 1 ? 'success' : item.status === 0 ? 'warning' : 'danger'} variant="flat">
                              {item.status === 1 ? 'Running' : item.status === 0 ? 'Paused' : 'Error'}
                            </Chip>
                          </div>
                          <p className="mt-1 text-[11px] text-default-400 font-mono truncate">
                            {item.tunnelName ? `${item.tunnelName} -> ` : ''}{item.remoteAddr}
                          </p>
                          {item.remoteSourceLabel && (
                            <Chip size="sm" variant="flat" color="secondary" className="mt-1">{item.remoteSourceLabel}</Chip>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button size="sm" variant="flat" onPress={() => { onDetailClose(); openEditModal(selectedAsset); }}>Edit</Button>
                <Button size="sm" variant="flat" color="danger" onPress={() => { onDetailClose(); openDeleteModal(selectedAsset); }}>Delete</Button>
                <Button size="sm" variant="flat" onPress={() => navigate('/probe')}>Probe</Button>
                <Button size="sm" variant="flat" onPress={() => navigate('/xui')}>X-UI</Button>
                <Button size="sm" color="primary" onPress={onDetailClose}>Close</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Create/Edit Modal */}
      <Modal isOpen={isFormOpen} onOpenChange={(open) => !open && onFormClose()} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{isEdit ? '编辑资产' : '新建资产'}</ModalHeader>
          <ModalBody>
            {!isEdit && unboundNodes.length > 0 && (
              <div className="rounded-lg border border-primary-200 bg-primary-50 p-3 dark:border-primary-800 dark:bg-primary-950">
                <p className="mb-2 text-xs font-medium text-primary-600 dark:text-primary-400">从探针导入（自动填充服务器信息）</p>
                <div className="flex flex-wrap gap-2">
                  {unboundNodes.map(node => (
                    <Button key={node.id} size="sm" variant="flat" color="primary"
                      onPress={() => importFromNode(node)}>
                      {node.name || node.ip || node.remoteNodeUuid.slice(0, 8)}
                      {node.online === 1 && <Chip size="sm" color="success" variant="dot" className="ml-1 border-none" />}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {!isEdit && importLoading && (
              <div className="flex items-center gap-2 text-xs text-default-400">
                <Spinner size="sm" /> 加载探针节点...
              </div>
            )}

            {/* Section: Local Config (user-editable) */}
            <div className="rounded-xl border border-primary/20 bg-primary-50/30 dark:bg-primary-50/5 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Chip size="sm" variant="flat" color="primary">本地配置</Chip>
                <span className="text-[11px] text-default-400">手动维护的资产信息</span>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Input label="名称" placeholder="HK-VPS-01" value={form.name}
                  onValueChange={(v) => setForm(p => ({ ...p, name: v }))} isInvalid={!!errors.name} errorMessage={errors.name} isRequired />
                <Input label="主 IP / 域名" value={form.primaryIp}
                  onValueChange={(v) => setForm(p => ({ ...p, primaryIp: v }))} />
                <Select label="角色" selectedKeys={form.role ? [form.role] : []}
                  onSelectionChange={(keys) => setForm(p => ({ ...p, role: Array.from(keys)[0]?.toString() || '' }))}>
                  {ROLES.map(r => <SelectItem key={r.key}>{r.label}</SelectItem>)}
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Input label="供应商" placeholder="DMIT / Vultr" value={form.provider}
                  onValueChange={(v) => setForm(p => ({ ...p, provider: v }))} />
                <Input label="地区" placeholder="香港" value={form.region}
                  onValueChange={(v) => setForm(p => ({ ...p, region: v }))} />
                <Input label="环境" placeholder="生产 / 测试" value={form.environment}
                  onValueChange={(v) => setForm(p => ({ ...p, environment: v }))} />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Input label="到期日期" type="date" value={form.expireDate}
                  onValueChange={(v) => setForm(p => ({ ...p, expireDate: v }))} />
                <Input label="月费" value={form.monthlyCost}
                  onValueChange={(v) => setForm(p => ({ ...p, monthlyCost: v }))} />
                <Select label="币种" selectedKeys={form.currency ? [form.currency] : ['CNY']}
                  onSelectionChange={(keys) => setForm(p => ({ ...p, currency: Array.from(keys)[0]?.toString() || 'CNY' }))}>
                  {CURRENCIES.map(c => <SelectItem key={c.key}>{c.label}</SelectItem>)}
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Input label="带宽 (Mbps)" type="number" value={form.bandwidthMbps}
                  onValueChange={(v) => setForm(p => ({ ...p, bandwidthMbps: v }))} />
                <Input label="月流量 (GB)" type="number" value={form.monthlyTrafficGb}
                  onValueChange={(v) => setForm(p => ({ ...p, monthlyTrafficGb: v }))} />
              </div>

              <Textarea label="备注" value={form.remark}
                onValueChange={(v) => setForm(p => ({ ...p, remark: v }))} minRows={2} />
            </div>

            {/* Section: Probe-synced fields */}
            <div className="rounded-xl border border-secondary/20 bg-secondary-50/30 dark:bg-secondary-50/5 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Chip size="sm" variant="flat" color="secondary">探针同步</Chip>
                <span className="text-[11px] text-default-400">绑定探针后自动同步，也可手动填写</span>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <Input label="操作系统" placeholder="Ubuntu 22" value={form.os}
                  onValueChange={(v) => setForm(p => ({ ...p, os: v }))}
                  description={form.monitorNodeUuid ? '探针可同步' : undefined} />
                <Input label="CPU 核心" type="number" value={form.cpuCores}
                  onValueChange={(v) => setForm(p => ({ ...p, cpuCores: v }))}
                  description={form.monitorNodeUuid ? '探针可同步' : undefined} />
                <Input label="内存 (MB)" type="number" value={form.memTotalMb}
                  onValueChange={(v) => setForm(p => ({ ...p, memTotalMb: v }))}
                  description={form.monitorNodeUuid ? '探针可同步' : undefined} />
                <Input label="硬盘 (GB)" type="number" value={form.diskTotalGb}
                  onValueChange={(v) => setForm(p => ({ ...p, diskTotalGb: v }))}
                  description={form.monitorNodeUuid ? '探针可同步' : undefined} />
                <Input label="IPv6" value={form.ipv6}
                  onValueChange={(v) => setForm(p => ({ ...p, ipv6: v }))} />
              </div>
            </div>

            {/* Section: Advanced / Linking */}
            <Accordion variant="light" className="-mx-1">
              <AccordionItem key="advanced" title="更多配置" classNames={{ title: "text-xs text-default-400" }}>
                <div className="space-y-4">
                  <p className="text-xs font-medium text-default-400">网络与接入</p>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Input label="标签" placeholder="可选标识" value={form.label}
                      onValueChange={(v) => setForm(p => ({ ...p, label: v }))} />
                    <Input label="SSH 端口" type="number" value={form.sshPort}
                      onValueChange={(v) => setForm(p => ({ ...p, sshPort: v }))} />
                    <Input label="购买日期" type="date" value={form.purchaseDate}
                      onValueChange={(v) => setForm(p => ({ ...p, purchaseDate: v }))} />
                  </div>

                  <p className="text-xs font-medium text-default-400">关联</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input label="探针节点 UUID" placeholder="Komari 节点 UUID（绑定后自动同步指标）" value={form.monitorNodeUuid}
                      onValueChange={(v) => setForm(p => ({ ...p, monitorNodeUuid: v }))}
                      description="绑定探针后，服务器看板和资产详情会自动展示实时指标" />
                    <Input label="标签 (JSON)" placeholder='["tag1","tag2"]' value={form.tags}
                      onValueChange={(v) => setForm(p => ({ ...p, tags: v }))} />
                  </div>
                </div>
              </AccordionItem>
            </Accordion>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onFormClose}>取消</Button>
            <Button color="primary" isLoading={submitLoading} onPress={handleSubmit}>
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
            <Button color="danger" isLoading={actionLoadingId === assetToDelete?.id} onPress={handleDelete}>删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Provision Modal */}
      <Modal isOpen={isProvisionOpen} onOpenChange={(open) => !open && onProvisionClose()} size="2xl">
        <ModalContent>
          <ModalHeader>添加服务器</ModalHeader>
          <ModalBody>
            {provisionStep === 'select' ? (
              <div className="space-y-4">
                <p className="text-sm text-default-500">
                  选择探针实例，系统将在 Komari 上创建客户端并生成安装命令。
                </p>
                <Select
                  label="探针实例"
                  placeholder="选择 Komari 实例"
                  selectedKeys={provisionInstanceId ? [provisionInstanceId] : []}
                  onSelectionChange={(keys) => setProvisionInstanceId(Array.from(keys)[0]?.toString() || '')}
                >
                  {monitorInstances.map(inst => (
                    <SelectItem key={inst.id.toString()}>
                      {inst.name} ({inst.baseUrl})
                    </SelectItem>
                  ))}
                </Select>
                <Input
                  label="服务器名称（可选）"
                  placeholder="例如 HK-VPS-01，留空自动生成"
                  value={provisionName}
                  onValueChange={setProvisionName}
                />
                {monitorInstances.length === 0 && (
                  <div className="rounded-lg border border-dashed border-warning-300 bg-warning-50 p-3 text-sm text-warning-700 dark:border-warning-800 dark:bg-warning-950 dark:text-warning-400">
                    暂无探针实例。请先在
                    <span className="cursor-pointer font-medium text-primary hover:underline" onClick={() => { onProvisionClose(); navigate('/probe'); }}>
                      {' '}探针管理{' '}
                    </span>
                    中添加 Komari 实例。
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-success-200 bg-success-50 p-4 dark:border-success-800 dark:bg-success-950">
                  <p className="text-sm font-medium text-success-700 dark:text-success-400">客户端创建成功</p>
                  <p className="mt-1 text-xs text-success-600 dark:text-success-500">
                    探针: {provisionResult?.instanceName} / UUID: {provisionResult?.uuid?.slice(0, 8)}...
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">一键安装命令</p>
                  <p className="mb-2 text-xs text-default-500">复制以下命令到 VPS 上以 root 执行：</p>
                  <div className="relative rounded-lg bg-default-100 p-3 dark:bg-default-50">
                    <code className="block whitespace-pre-wrap break-all text-xs leading-relaxed">
                      {provisionResult?.installCommand}
                    </code>
                    <Button
                      size="sm"
                      color="primary"
                      variant="flat"
                      className="absolute right-2 top-2"
                      onPress={() => provisionResult && copyToClipboard(provisionResult.installCommand)}
                    >
                      复制
                    </Button>
                  </div>
                </div>

                <Accordion variant="light">
                  <AccordionItem key="manual" title="手动安装参数" classNames={{ title: "text-xs text-default-400" }}>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-default-500 min-w-[70px]">Endpoint:</span>
                        <code className="flex-1 rounded bg-default-100 px-2 py-1">{provisionResult?.endpoint}</code>
                        <Button size="sm" variant="light" onPress={() => provisionResult && copyToClipboard(provisionResult.endpoint)}>复制</Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-default-500 min-w-[70px]">Token:</span>
                        <code className="flex-1 truncate rounded bg-default-100 px-2 py-1">{provisionResult?.token}</code>
                        <Button size="sm" variant="light" onPress={() => provisionResult && copyToClipboard(provisionResult.token)}>复制</Button>
                      </div>
                    </div>
                  </AccordionItem>
                </Accordion>

                <p className="text-xs text-default-400">
                  安装完成后，前往探针管理点击「同步」，系统将自动发现新节点并创建服务器资产。
                </p>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            {provisionStep === 'select' ? (
              <>
                <Button variant="flat" onPress={onProvisionClose}>取消</Button>
                <Button color="primary" isLoading={provisionLoading} onPress={handleProvision}
                  isDisabled={!provisionInstanceId}>
                  创建并生成命令
                </Button>
              </>
            ) : (
              <>
                <Button variant="flat" onPress={() => setProvisionStep('select')}>再添加一台</Button>
                <Button color="primary" onPress={() => { onProvisionClose(); void loadAssets(); }}>完成</Button>
              </>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
