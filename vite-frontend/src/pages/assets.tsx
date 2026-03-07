import { useEffect, useMemo, useState } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow
} from "@heroui/table";
import toast from 'react-hot-toast';

import {
  AssetHost,
  AssetHostDetail,
  MonitorNodeSnapshot,
  XuiInstance,
  createAsset,
  deleteAsset,
  getAssetDetail,
  getAssetList,
  getMonitorUnboundNodes,
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

const formatDate = (timestamp?: number | null) => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
};

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

export default function AssetsPage() {
  const navigate = useNavigate();
  const admin = isAdmin();
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assets, setAssets] = useState<AssetHost[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
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

  const { isOpen: isFormOpen, onOpen: onFormOpen, onClose: onFormClose } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();

  useEffect(() => { void loadAssets(); }, []);
  useEffect(() => {
    if (!selectedAssetId) { setDetail(null); return; }
    void loadAssetDetail(selectedAssetId);
  }, [selectedAssetId]);

  const summary = useMemo(() => ({
    totalAssets: assets.length,
    onlineAssets: assets.filter(a => a.monitorOnline === 1).length,
    totalXuiInstances: assets.reduce((s, i) => s + (i.totalXuiInstances || 0), 0),
    totalForwards: assets.reduce((s, i) => s + (i.totalForwards || 0), 0),
    totalClients: assets.reduce((s, i) => s + (i.totalClients || 0), 0),
  }), [assets]);

  const filteredAssets = useMemo(() => {
    const kw = normalizeKeyword(searchKeyword);
    if (!kw) return assets;
    return assets.filter((item) =>
      [item.name, item.label, item.primaryIp, item.environment, item.provider, item.region, item.role, item.remark]
        .some((v) => normalizeKeyword(v).includes(kw))
    );
  }, [assets, searchKeyword]);

  const selectedAsset = useMemo(
    () => assets.find((item) => item.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );

  const loadAssets = async () => {
    setLoading(true);
    try {
      const response = await getAssetList();
      if (response.code !== 0) { toast.error(response.msg || '操作失败'); return; }
      const list = response.data || [];
      setAssets(list);
      setSelectedAssetId((cur) => (cur && list.some((i) => i.id === cur)) ? cur : (list[0]?.id ?? null));
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
    // Pre-load unbound nodes for import
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
      const targetId = response.data?.id || form.id;
      if (targetId) setSelectedAssetId(targetId);
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
      if (selectedAssetId === assetToDelete.id) setSelectedAssetId(null);
      await loadAssets();
    } catch { toast.error('操作失败'); }
    finally { setActionLoadingId(null); }
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">服务器资产</h1>
          <p className="mt-1 max-w-3xl text-sm text-default-500">
            每台服务器作为一个资产，自动关联探针数据、X-UI 实例、协议节点和转发规则。
          </p>
        </div>
        <Button color="primary" onPress={openCreateModal}>新建资产</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <Card className="border border-divider/80"><CardBody className="gap-1 p-5">
          <p className="text-xs tracking-widest text-default-400">资产总数</p>
          <p className="text-3xl font-semibold">{summary.totalAssets}</p>
        </CardBody></Card>
        <Card className="border border-divider/80"><CardBody className="gap-1 p-5">
          <p className="text-xs tracking-widest text-default-400">在线</p>
          <p className="text-3xl font-semibold text-success">{summary.onlineAssets}</p>
        </CardBody></Card>
        <Card className="border border-divider/80"><CardBody className="gap-1 p-5">
          <p className="text-xs tracking-widest text-default-400">X-UI 实例</p>
          <p className="text-3xl font-semibold">{summary.totalXuiInstances}</p>
        </CardBody></Card>
        <Card className="border border-divider/80"><CardBody className="gap-1 p-5">
          <p className="text-xs tracking-widest text-default-400">转发规则</p>
          <p className="text-3xl font-semibold">{summary.totalForwards}</p>
        </CardBody></Card>
        <Card className="border border-divider/80"><CardBody className="gap-1 p-5">
          <p className="text-xs tracking-widest text-default-400">客户端</p>
          <p className="text-3xl font-semibold">{summary.totalClients}</p>
        </CardBody></Card>
      </div>

      {/* Expiry Warnings */}
      {expiringSoon.length > 0 && (
        <Card className="border border-warning/30 bg-warning-50/60">
          <CardBody className="p-4">
            <p className="text-sm font-medium text-warning-700">
              {expiringSoon.length} 台资产将在 30 天内到期: {expiringSoon.map(a => a.name).join(', ')}
            </p>
          </CardBody>
        </Card>
      )}

      {/* Main 2-column layout */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        {/* Left: Asset List */}
        <Card className="border border-divider/80">
          <CardHeader className="flex flex-col items-start gap-3">
            <h2 className="text-lg font-semibold">资产列表</h2>
            <Input value={searchKeyword} onValueChange={setSearchKeyword} placeholder="搜索名称、IP、角色、地区..." />
          </CardHeader>
          <CardBody className="space-y-3">
            {filteredAssets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                {assets.length === 0 ? '暂无资产，点击「新建资产」添加' : '没有匹配的结果'}
              </div>
            ) : (
              filteredAssets.map((asset) => {
                const selected = asset.id === selectedAssetId;
                const roleChip = getRoleChip(asset.role);
                const isOnline = asset.monitorOnline === 1;
                return (
                  <button type="button" key={asset.id} onClick={() => setSelectedAssetId(asset.id)}
                    className={`w-full rounded-3xl border p-4 text-left transition-all ${
                      selected ? 'border-primary bg-primary-50/70 shadow-lg shadow-primary/10'
                        : 'border-divider/80 bg-content1 hover:border-primary/40 hover:bg-default-50'
                    }`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-success' : 'bg-default-300'}`} />
                          <p className="truncate text-base font-semibold">{asset.name}</p>
                          {asset.label && <Chip size="sm" variant="flat">{asset.label}</Chip>}
                          {roleChip && <Chip size="sm" color={roleChip.color} variant="flat">{roleChip.text}</Chip>}
                        </div>
                        <p className="mt-1 truncate text-xs text-default-500">
                          {asset.primaryIp || '未设置 IP'}{asset.environment ? ` / ${asset.environment}` : ''}
                          {asset.provider ? ` / ${asset.provider}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Monitor mini metrics */}
                    {asset.monitorCpuUsage != null && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-default-100/80 px-2 py-1.5">
                          <p className="text-[10px] text-default-400">CPU</p>
                          <p className="text-sm font-semibold">{asset.monitorCpuUsage.toFixed(1)}%</p>
                        </div>
                        <div className="rounded-xl bg-default-100/80 px-2 py-1.5">
                          <p className="text-[10px] text-default-400">MEM</p>
                          <p className="text-sm font-semibold">
                            {asset.monitorMemTotal ? ((asset.monitorMemUsed || 0) / asset.monitorMemTotal * 100).toFixed(0) + '%' : '-'}
                          </p>
                        </div>
                        <div className="rounded-xl bg-default-100/80 px-2 py-1.5">
                          <p className="text-[10px] text-default-400">NET</p>
                          <p className="text-sm font-semibold">{formatSpeed(asset.monitorNetIn)}</p>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-4 gap-1.5">
                      <div className="rounded-lg bg-default-100/80 px-1.5 py-1">
                        <p className="text-[10px] text-default-400">X-UI</p>
                        <p className="text-xs font-semibold">{asset.totalXuiInstances || 0}</p>
                      </div>
                      <div className="rounded-lg bg-default-100/80 px-1.5 py-1">
                        <p className="text-[10px] text-default-400">协议</p>
                        <p className="text-xs font-semibold">{asset.totalProtocols || 0}</p>
                      </div>
                      <div className="rounded-lg bg-default-100/80 px-1.5 py-1">
                        <p className="text-[10px] text-default-400">转发</p>
                        <p className="text-xs font-semibold">{asset.totalForwards || 0}</p>
                      </div>
                      <div className="rounded-lg bg-default-100/80 px-1.5 py-1">
                        <p className="text-[10px] text-default-400">在线</p>
                        <p className="text-xs font-semibold">{asset.onlineClients || 0}</p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </CardBody>
        </Card>

        {/* Right: Detail */}
        <div className="space-y-6">
          {/* Asset Info */}
          <Card className="border border-divider/80">
            <CardHeader className="flex flex-col items-start gap-3">
              {!selectedAsset ? (
                <div>
                  <h2 className="text-lg font-semibold">资产概览</h2>
                  <p className="text-sm text-default-500">从左侧列表选择一个资产</p>
                </div>
              ) : (
                <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-block h-3 w-3 rounded-full ${selectedAsset.monitorOnline === 1 ? 'bg-success' : 'bg-default-300'}`} />
                      <h2 className="truncate text-lg font-semibold">{selectedAsset.name}</h2>
                      {selectedAsset.label && <Chip size="sm" variant="flat">{selectedAsset.label}</Chip>}
                      {getRoleChip(selectedAsset.role) && <Chip size="sm" color={getRoleChip(selectedAsset.role)!.color} variant="flat">{getRoleChip(selectedAsset.role)!.text}</Chip>}
                    </div>
                    <p className="mt-1 break-all text-sm text-default-500">{selectedAsset.primaryIp || '未设置 IP'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detailLoading && <Spinner size="sm" />}
                    <Button size="sm" variant="flat" onPress={() => openEditModal(selectedAsset)}>编辑</Button>
                    <Button size="sm" variant="flat" color="danger" onPress={() => openDeleteModal(selectedAsset)}>删除</Button>
                  </div>
                </div>
              )}
            </CardHeader>
            <CardBody>
              {!selectedAsset ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  选择一台服务器资产，查看关联的 X-UI、协议、探针和转发信息
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    {/* Server Info */}
                    <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                      <p className="text-xs tracking-widest text-default-400">服务器</p>
                      <div className="mt-3 space-y-1.5 text-sm">
                        <p><span className="text-default-500">IP:</span> {selectedAsset.primaryIp || '-'}{selectedAsset.ipv6 ? ` / ${selectedAsset.ipv6}` : ''}</p>
                        <p><span className="text-default-500">SSH:</span> {selectedAsset.sshPort || 22}</p>
                        <p><span className="text-default-500">系统:</span> {selectedAsset.os || '-'}</p>
                        <p><span className="text-default-500">配置:</span> {selectedAsset.cpuCores || '?'}核 / {selectedAsset.memTotalMb ? `${selectedAsset.memTotalMb}MB` : '?'} / {selectedAsset.diskTotalGb ? `${selectedAsset.diskTotalGb}GB` : '?'}</p>
                        <p><span className="text-default-500">带宽:</span> {selectedAsset.bandwidthMbps ? `${selectedAsset.bandwidthMbps} Mbps` : '-'}{selectedAsset.monthlyTrafficGb ? ` / ${selectedAsset.monthlyTrafficGb} GB/月` : ''}</p>
                      </div>
                    </div>

                    {/* Provider & Cost */}
                    <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                      <p className="text-xs tracking-widest text-default-400">供应商</p>
                      <div className="mt-3 space-y-1.5 text-sm">
                        <p><span className="text-default-500">厂商:</span> {selectedAsset.provider || '-'}</p>
                        <p><span className="text-default-500">地区:</span> {selectedAsset.region || '-'}</p>
                        <p><span className="text-default-500">月费:</span> {selectedAsset.monthlyCost ? `${selectedAsset.monthlyCost} ${selectedAsset.currency || ''}` : '-'}/月</p>
                        <p><span className="text-default-500">购买:</span> {formatDateShort(selectedAsset.purchaseDate)}</p>
                        <p>
                          <span className="text-default-500">到期:</span>{' '}
                          {selectedAsset.expireDate ? (
                            <span className={selectedAsset.expireDate < Date.now() + 30 * 86400000 ? 'font-semibold text-warning' : ''}>
                              {formatDateShort(selectedAsset.expireDate)}
                            </span>
                          ) : '-'}
                        </p>
                      </div>
                    </div>

                    {/* Integration Summary */}
                    <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                      <p className="text-xs tracking-widest text-default-400">关联信息</p>
                      <div className="mt-3 space-y-1.5 text-sm">
                        <p><span className="text-default-500">X-UI:</span> {selectedAsset.totalXuiInstances || 0} 个实例</p>
                        <p><span className="text-default-500">协议:</span> {selectedAsset.totalProtocols || 0} 种</p>
                        <p><span className="text-default-500">转发:</span> {selectedAsset.totalForwards || 0} 条</p>
                        <p><span className="text-default-500">GOST 节点:</span> {selectedAsset.gostNodeName || '-'}</p>
                        <p><span className="text-default-500">探针 UUID:</span> {selectedAsset.monitorNodeUuid || '-'}</p>
                      </div>
                    </div>
                  </div>

                  {selectedAsset.remark && (
                    <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4 text-sm text-default-700">
                      <p className="font-medium">备注</p>
                      <p className="mt-1">{selectedAsset.remark}</p>
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Monitor Section */}
          <Card className="border border-divider/80">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">探针监控</h2>
                <p className="text-sm text-default-500">来自关联探针节点的实时指标</p>
              </div>
              <Button size="sm" variant="flat" color="primary" onPress={() => navigate('/probe')}>
                管理探针
              </Button>
            </CardHeader>
            <CardBody>
              {!detail || !detail.monitorNodes || detail.monitorNodes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500 text-center">
                  暂无关联探针。{' '}
                  <span className="text-primary cursor-pointer hover:underline" onClick={() => navigate('/probe')}>
                    前往探针管理
                  </span>{' '}
                  添加并同步 Komari 实例，然后将节点绑定到资产。
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {detail.monitorNodes.map((node: MonitorNodeSnapshot) => {
                    const m = node.latestMetric;
                    const memPct = m?.memTotal ? ((m.memUsed || 0) / m.memTotal * 100) : 0;
                    const diskPct = m?.diskTotal ? ((m.diskUsed || 0) / m.diskTotal * 100) : 0;
                    return (
                      <div key={node.id} className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block h-2.5 w-2.5 rounded-full ${node.online === 1 ? 'bg-success' : 'bg-default-300'}`} />
                              <p className="truncate font-semibold">{node.name || node.remoteNodeUuid}</p>
                            </div>
                            <p className="mt-1 text-xs text-default-500">{node.ip}{node.os ? ` / ${node.os}` : ''}</p>
                          </div>
                          <Chip size="sm" variant="flat" color={node.online === 1 ? 'success' : 'default'}>
                            {node.online === 1 ? '在线' : '离线'}
                          </Chip>
                        </div>

                        {m && (
                          <div className="mt-4 space-y-3">
                            <div>
                              <div className="flex justify-between text-xs text-default-500">
                                <span>CPU</span><span>{m.cpuUsage?.toFixed(1)}%</span>
                              </div>
                              <Progress size="sm" value={m.cpuUsage || 0} color={m.cpuUsage && m.cpuUsage > 80 ? 'danger' : 'primary'} className="mt-1" />
                            </div>
                            <div>
                              <div className="flex justify-between text-xs text-default-500">
                                <span>Memory</span><span>{formatFlow(m.memUsed)} / {formatFlow(m.memTotal)}</span>
                              </div>
                              <Progress size="sm" value={memPct} color={memPct > 85 ? 'danger' : 'primary'} className="mt-1" />
                            </div>
                            <div>
                              <div className="flex justify-between text-xs text-default-500">
                                <span>Disk</span><span>{formatFlow(m.diskUsed)} / {formatFlow(m.diskTotal)}</span>
                              </div>
                              <Progress size="sm" value={diskPct} color={diskPct > 90 ? 'danger' : 'primary'} className="mt-1" />
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="rounded-xl bg-content1 p-2">
                                <p className="text-[10px] text-default-400">NET IN</p>
                                <p className="text-xs font-semibold">{formatSpeed(m.netIn)}</p>
                              </div>
                              <div className="rounded-xl bg-content1 p-2">
                                <p className="text-[10px] text-default-400">NET OUT</p>
                                <p className="text-xs font-semibold">{formatSpeed(m.netOut)}</p>
                              </div>
                              <div className="rounded-xl bg-content1 p-2">
                                <p className="text-[10px] text-default-400">UPTIME</p>
                                <p className="text-xs font-semibold">{formatUptime(m.uptime)}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-default-500">
                              <span>Load: {m.load1?.toFixed(2) || '-'}</span>
                              <span>Conn: {m.connections || 0}</span>
                              <span>Proc: {m.processCount || 0}</span>
                              <span>Sampled: {formatDate(m.sampledAt)}</span>
                            </div>
                          </div>
                        )}

                        <div className="mt-3 text-xs text-default-500">
                          <span>{node.cpuName || '-'} / {node.cpuCores || '?'}C</span>
                          <span className="ml-2">v{node.version || '?'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          {/* X-UI Instances */}
          <Card className="border border-divider/80">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">X-UI 实例</h2>
              <Button size="sm" variant="flat" color="primary" onPress={() => navigate('/xui')}>
                管理 X-UI
              </Button>
            </CardHeader>
            <CardBody>
              {!detail || detail.xuiInstances.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  暂无关联的 X-UI 实例
                  <Button size="sm" variant="light" color="primary" className="ml-2" onPress={() => navigate('/xui')}>
                    前往 X-UI 添加
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {detail.xuiInstances.map((inst) => {
                    const syncChip = getStatusChip(inst.lastSyncStatus);
                    return (
                      <button type="button" key={inst.id} onClick={() => navigate('/xui')}
                        className="rounded-3xl border border-divider/80 bg-default-50/80 p-4 text-left transition-all hover:border-primary/40 hover:bg-primary-50/40">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{inst.name}</p>
                            <p className="mt-1 break-all text-xs text-default-500">{buildInstanceAddress(inst)}</p>
                          </div>
                          <Chip size="sm" color={syncChip.color} variant="flat">{syncChip.text}</Chip>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div className="rounded-xl bg-content1 p-2">
                            <p className="text-[10px] text-default-400">入站</p>
                            <p className="text-sm font-semibold">{inst.inboundCount || 0}</p>
                          </div>
                          <div className="rounded-xl bg-content1 p-2">
                            <p className="text-[10px] text-default-400">客户端</p>
                            <p className="text-sm font-semibold">{inst.clientCount || 0}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-default-500">
                          <span>User: {inst.username} / Synced: {formatDate(inst.lastSyncAt)}</span>
                          <span className="text-primary">查看详情 &rarr;</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Protocol Directory */}
          <Card className="border border-divider/80">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">协议目录</h2>
            </CardHeader>
            <CardBody>
              {!detail || detail.protocolSummaries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">暂无协议数据</div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {detail.protocolSummaries.map((item) => (
                    <div key={item.protocol} className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold uppercase">{item.protocol}</p>
                        <Chip size="sm" color="primary" variant="flat">{item.inboundCount} 入站</Chip>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-content1 p-2">
                          <p className="text-[10px] text-default-400">客户端</p>
                          <p className="text-sm font-semibold">{item.clientCount || 0} <span className="text-xs text-default-500">({item.onlineClientCount || 0} 在线)</span></p>
                        </div>
                        <div className="rounded-xl bg-content1 p-2">
                          <p className="text-[10px] text-default-400">流量</p>
                          <p className="text-sm font-semibold">{formatFlow(item.allTime)}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-default-500">端口: {item.portSummary || '-'}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Forward Links */}
          <Card className="border border-divider/80">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">转发链接</h2>
              <Button size="sm" variant="flat" color="primary" onPress={() => navigate('/forward')}>
                管理转发
              </Button>
            </CardHeader>
            <CardBody>
              {!detail || detail.forwards.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  暂无关联转发
                  <Button size="sm" variant="light" color="primary" className="ml-2" onPress={() => navigate('/forward')}>
                    前往转发管理
                  </Button>
                </div>
              ) : (
                <>
                  {/* Mobile: card layout */}
                  <div className="space-y-3 md:hidden">
                    {detail.forwards.map((item) => (
                      <button type="button" key={item.id} onClick={() => navigate('/forward')}
                        className="w-full rounded-2xl border border-divider/80 bg-default-50/80 p-3 text-left transition-all hover:border-primary/40">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-medium">{item.name}</p>
                          <Chip size="sm" color={item.status === 1 ? 'success' : item.status === 0 ? 'warning' : 'danger'} variant="flat">
                            {item.status === 1 ? '运行中' : item.status === 0 ? '已暂停' : '异常'}
                          </Chip>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-default-500">
                          <span>Tunnel: {item.tunnelName || '-'}</span>
                          <span>Addr: {item.remoteAddr}</span>
                        </div>
                        {item.remoteSourceLabel && (
                          <Chip size="sm" variant="flat" color="secondary" className="mt-2">{item.remoteSourceLabel}</Chip>
                        )}
                      </button>
                    ))}
                  </div>
                  {/* Desktop: table layout */}
                  <div className="hidden md:block">
                    <Table removeWrapper aria-label="转发列表">
                      <TableHeader>
                        <TableColumn>转发</TableColumn>
                        <TableColumn>隧道</TableColumn>
                        <TableColumn>来源</TableColumn>
                        <TableColumn>地址</TableColumn>
                        <TableColumn>状态</TableColumn>
                      </TableHeader>
                      <TableBody items={detail.forwards}>
                        {(item) => (
                          <TableRow key={item.id} className="cursor-pointer" onClick={() => navigate('/forward')}>
                            <TableCell><p className="font-medium">{item.name}</p></TableCell>
                            <TableCell>{item.tunnelName || '-'}</TableCell>
                            <TableCell>{item.remoteSourceLabel || '-'}</TableCell>
                            <TableCell className="text-xs">{item.remoteAddr}</TableCell>
                            <TableCell>
                              <Chip size="sm" color={item.status === 1 ? 'success' : item.status === 0 ? 'warning' : 'danger'} variant="flat">
                                {item.status === 1 ? '运行中' : item.status === 0 ? '已暂停' : '异常'}
                              </Chip>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal isOpen={isFormOpen} onOpenChange={(open) => !open && onFormClose()} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{isEdit ? '编辑资产' : '新建资产'}</ModalHeader>
          <ModalBody>
            {/* Import from probe - only show for new assets */}
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

            {/* Essential fields */}
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
              <Input label="到期日期" type="date" value={form.expireDate}
                onValueChange={(v) => setForm(p => ({ ...p, expireDate: v }))} />
            </div>

            <Textarea label="备注" value={form.remark}
              onValueChange={(v) => setForm(p => ({ ...p, remark: v }))} minRows={2} />

            {/* Advanced fields in collapsible section */}
            <Accordion variant="light" className="-mx-1">
              <AccordionItem key="advanced" title="更多配置" classNames={{ title: "text-xs text-default-400" }}>
                <div className="space-y-4">
                  <p className="text-xs font-medium text-default-400">网络</p>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Input label="标签" placeholder="可选标识" value={form.label}
                      onValueChange={(v) => setForm(p => ({ ...p, label: v }))} />
                    <Input label="IPv6" value={form.ipv6}
                      onValueChange={(v) => setForm(p => ({ ...p, ipv6: v }))} />
                    <Input label="SSH 端口" type="number" value={form.sshPort}
                      onValueChange={(v) => setForm(p => ({ ...p, sshPort: v }))} />
                  </div>

                  <p className="text-xs font-medium text-default-400">配置</p>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                    <Input label="操作系统" placeholder="Ubuntu 22" value={form.os}
                      onValueChange={(v) => setForm(p => ({ ...p, os: v }))} />
                    <Input label="CPU 核心" type="number" value={form.cpuCores}
                      onValueChange={(v) => setForm(p => ({ ...p, cpuCores: v }))} />
                    <Input label="内存 (MB)" type="number" value={form.memTotalMb}
                      onValueChange={(v) => setForm(p => ({ ...p, memTotalMb: v }))} />
                    <Input label="硬盘 (GB)" type="number" value={form.diskTotalGb}
                      onValueChange={(v) => setForm(p => ({ ...p, diskTotalGb: v }))} />
                    <Input label="带宽 (Mbps)" type="number" value={form.bandwidthMbps}
                      onValueChange={(v) => setForm(p => ({ ...p, bandwidthMbps: v }))} />
                  </div>

                  <p className="text-xs font-medium text-default-400">费用</p>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Input label="环境" placeholder="生产 / 测试" value={form.environment}
                      onValueChange={(v) => setForm(p => ({ ...p, environment: v }))} />
                    <Input label="月流量 (GB)" type="number" value={form.monthlyTrafficGb}
                      onValueChange={(v) => setForm(p => ({ ...p, monthlyTrafficGb: v }))} />
                    <Input label="月费" value={form.monthlyCost}
                      onValueChange={(v) => setForm(p => ({ ...p, monthlyCost: v }))} />
                    <Select label="币种" selectedKeys={form.currency ? [form.currency] : ['CNY']}
                      onSelectionChange={(keys) => setForm(p => ({ ...p, currency: Array.from(keys)[0]?.toString() || 'CNY' }))}>
                      {CURRENCIES.map(c => <SelectItem key={c.key}>{c.label}</SelectItem>)}
                    </Select>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input label="购买日期" type="date" value={form.purchaseDate}
                      onValueChange={(v) => setForm(p => ({ ...p, purchaseDate: v }))} />
                  </div>

                  <p className="text-xs font-medium text-default-400">关联</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input label="探针节点 UUID" placeholder="Komari 节点 UUID" value={form.monitorNodeUuid}
                      onValueChange={(v) => setForm(p => ({ ...p, monitorNodeUuid: v }))} />
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
    </div>
  );
}
