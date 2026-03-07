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
  { key: 'entry', label: 'Entry (入口)' },
  { key: 'relay', label: 'Relay (中转)' },
  { key: 'landing', label: 'Landing (落地)' },
  { key: 'standalone', label: 'Standalone (独立)' },
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
    case 'success': return { color: 'success' as const, text: 'OK' };
    case 'failed': return { color: 'danger' as const, text: 'Fail' };
    default: return { color: 'default' as const, text: '-' };
  }
};

const getRoleChip = (role?: string | null) => {
  switch (role) {
    case 'entry': return { color: 'primary' as const, text: 'Entry' };
    case 'relay': return { color: 'warning' as const, text: 'Relay' };
    case 'landing': return { color: 'success' as const, text: 'Landing' };
    case 'standalone': return { color: 'secondary' as const, text: 'Standalone' };
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
      if (response.code !== 0) { toast.error(response.msg || 'Failed'); return; }
      const list = response.data || [];
      setAssets(list);
      setSelectedAssetId((cur) => (cur && list.some((i) => i.id === cur)) ? cur : (list[0]?.id ?? null));
    } catch { toast.error('Failed to load assets'); }
    finally { setLoading(false); }
  };

  const loadAssetDetail = async (assetId: number) => {
    setDetailLoading(true);
    try {
      const response = await getAssetDetail(assetId);
      if (response.code !== 0) { toast.error(response.msg || 'Failed'); return; }
      setDetail(response.data || null);
    } catch { toast.error('Failed to load detail'); }
    finally { setDetailLoading(false); }
  };

  const openCreateModal = () => { setIsEdit(false); setErrors({}); setForm(emptyForm()); onFormOpen(); };

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
    if (!form.name.trim()) e.name = 'Required';
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
      if (response.code !== 0) { toast.error(response.msg || 'Failed'); return; }
      toast.success(isEdit ? 'Updated' : 'Created');
      onFormClose();
      await loadAssets();
      const targetId = response.data?.id || form.id;
      if (targetId) setSelectedAssetId(targetId);
    } catch { toast.error('Failed'); }
    finally { setSubmitLoading(false); }
  };

  const openDeleteModal = (asset: AssetHost) => { setAssetToDelete(asset); onDeleteOpen(); };
  const handleDelete = async () => {
    if (!assetToDelete) return;
    setActionLoadingId(assetToDelete.id);
    try {
      const response = await deleteAsset(assetToDelete.id);
      if (response.code !== 0) { toast.error(response.msg || 'Failed'); return; }
      toast.success('Deleted');
      onDeleteClose(); setAssetToDelete(null);
      if (selectedAssetId === assetToDelete.id) setSelectedAssetId(null);
      await loadAssets();
    } catch { toast.error('Failed'); }
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
          <h1 className="text-2xl font-bold">Server Assets</h1>
          <p className="mt-1 max-w-3xl text-sm text-default-500">
            VPS asset management. Each server is an asset with linked X-UI instances, protocol nodes, monitor probes, and forwarding rules.
          </p>
        </div>
        <Button color="primary" onPress={openCreateModal}>New Asset</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <Card className="border border-divider/80"><CardBody className="gap-1 p-5">
          <p className="text-xs uppercase tracking-widest text-default-400">Assets</p>
          <p className="text-3xl font-semibold">{summary.totalAssets}</p>
        </CardBody></Card>
        <Card className="border border-divider/80"><CardBody className="gap-1 p-5">
          <p className="text-xs uppercase tracking-widest text-default-400">Online</p>
          <p className="text-3xl font-semibold text-success">{summary.onlineAssets}</p>
        </CardBody></Card>
        <Card className="border border-divider/80"><CardBody className="gap-1 p-5">
          <p className="text-xs uppercase tracking-widest text-default-400">X-UI</p>
          <p className="text-3xl font-semibold">{summary.totalXuiInstances}</p>
        </CardBody></Card>
        <Card className="border border-divider/80"><CardBody className="gap-1 p-5">
          <p className="text-xs uppercase tracking-widest text-default-400">Forwards</p>
          <p className="text-3xl font-semibold">{summary.totalForwards}</p>
        </CardBody></Card>
        <Card className="border border-divider/80"><CardBody className="gap-1 p-5">
          <p className="text-xs uppercase tracking-widest text-default-400">Clients</p>
          <p className="text-3xl font-semibold">{summary.totalClients}</p>
        </CardBody></Card>
      </div>

      {/* Expiry Warnings */}
      {expiringSoon.length > 0 && (
        <Card className="border border-warning/30 bg-warning-50/60">
          <CardBody className="p-4">
            <p className="text-sm font-medium text-warning-700">
              {expiringSoon.length} asset(s) expiring within 30 days:
              {' '}{expiringSoon.map(a => a.name).join(', ')}
            </p>
          </CardBody>
        </Card>
      )}

      {/* Main 2-column layout */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        {/* Left: Asset List */}
        <Card className="border border-divider/80">
          <CardHeader className="flex flex-col items-start gap-3">
            <h2 className="text-lg font-semibold">Assets</h2>
            <Input value={searchKeyword} onValueChange={setSearchKeyword} placeholder="Filter by name, IP, role, region..." />
          </CardHeader>
          <CardBody className="space-y-3">
            {filteredAssets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                {assets.length === 0 ? 'No assets yet.' : 'No matches.'}
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
                          {asset.primaryIp || 'No IP'}{asset.environment ? ` / ${asset.environment}` : ''}
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
                        <p className="text-[10px] text-default-400">Proto</p>
                        <p className="text-xs font-semibold">{asset.totalProtocols || 0}</p>
                      </div>
                      <div className="rounded-lg bg-default-100/80 px-1.5 py-1">
                        <p className="text-[10px] text-default-400">Fwd</p>
                        <p className="text-xs font-semibold">{asset.totalForwards || 0}</p>
                      </div>
                      <div className="rounded-lg bg-default-100/80 px-1.5 py-1">
                        <p className="text-[10px] text-default-400">Online</p>
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
                  <h2 className="text-lg font-semibold">Overview</h2>
                  <p className="text-sm text-default-500">Select an asset from the list.</p>
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
                    <p className="mt-1 break-all text-sm text-default-500">{selectedAsset.primaryIp || 'No IP'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detailLoading && <Spinner size="sm" />}
                    <Button size="sm" variant="flat" onPress={() => openEditModal(selectedAsset)}>Edit</Button>
                    <Button size="sm" variant="flat" color="danger" onPress={() => openDeleteModal(selectedAsset)}>Delete</Button>
                  </div>
                </div>
              )}
            </CardHeader>
            <CardBody>
              {!selectedAsset ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  Select a server asset to view its integrated X-UI, protocols, monitors and forwarding.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    {/* Server Info */}
                    <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                      <p className="text-xs uppercase tracking-widest text-default-400">Server</p>
                      <div className="mt-3 space-y-1.5 text-sm">
                        <p><span className="text-default-500">IP:</span> {selectedAsset.primaryIp || '-'}{selectedAsset.ipv6 ? ` / ${selectedAsset.ipv6}` : ''}</p>
                        <p><span className="text-default-500">SSH:</span> {selectedAsset.sshPort || 22}</p>
                        <p><span className="text-default-500">OS:</span> {selectedAsset.os || '-'}</p>
                        <p><span className="text-default-500">Specs:</span> {selectedAsset.cpuCores || '?'}C / {selectedAsset.memTotalMb ? `${selectedAsset.memTotalMb}MB` : '?'} / {selectedAsset.diskTotalGb ? `${selectedAsset.diskTotalGb}GB` : '?'}</p>
                        <p><span className="text-default-500">BW:</span> {selectedAsset.bandwidthMbps ? `${selectedAsset.bandwidthMbps} Mbps` : '-'}{selectedAsset.monthlyTrafficGb ? ` / ${selectedAsset.monthlyTrafficGb} GB/mo` : ''}</p>
                      </div>
                    </div>

                    {/* Provider & Cost */}
                    <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                      <p className="text-xs uppercase tracking-widest text-default-400">Provider</p>
                      <div className="mt-3 space-y-1.5 text-sm">
                        <p><span className="text-default-500">Vendor:</span> {selectedAsset.provider || '-'}</p>
                        <p><span className="text-default-500">Region:</span> {selectedAsset.region || '-'}</p>
                        <p><span className="text-default-500">Cost:</span> {selectedAsset.monthlyCost ? `${selectedAsset.monthlyCost} ${selectedAsset.currency || ''}` : '-'}/mo</p>
                        <p><span className="text-default-500">Purchased:</span> {formatDateShort(selectedAsset.purchaseDate)}</p>
                        <p>
                          <span className="text-default-500">Expires:</span>{' '}
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
                      <p className="text-xs uppercase tracking-widest text-default-400">Integration</p>
                      <div className="mt-3 space-y-1.5 text-sm">
                        <p><span className="text-default-500">X-UI:</span> {selectedAsset.totalXuiInstances || 0} instances</p>
                        <p><span className="text-default-500">Protocols:</span> {selectedAsset.totalProtocols || 0} types</p>
                        <p><span className="text-default-500">Forwards:</span> {selectedAsset.totalForwards || 0}</p>
                        <p><span className="text-default-500">GOST Node:</span> {selectedAsset.gostNodeName || '-'}</p>
                        <p><span className="text-default-500">Probe UUID:</span> {selectedAsset.monitorNodeUuid || '-'}</p>
                      </div>
                    </div>
                  </div>

                  {selectedAsset.remark && (
                    <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4 text-sm text-default-700">
                      <p className="font-medium">Remark</p>
                      <p className="mt-1">{selectedAsset.remark}</p>
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Monitor Section */}
          <Card className="border border-divider/80">
            <CardHeader className="flex flex-col items-start gap-2">
              <h2 className="text-lg font-semibold">Monitor (Komari)</h2>
              <p className="text-sm text-default-500">Real-time metrics from linked probe node.</p>
            </CardHeader>
            <CardBody>
              {!detail || !detail.monitorNodes || detail.monitorNodes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  No probe linked. Set the Monitor Node UUID in asset settings, or wait for the next sync cycle.
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
                            {node.online === 1 ? 'Online' : 'Offline'}
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
              <h2 className="text-lg font-semibold">X-UI Instances</h2>
              <Button size="sm" variant="flat" color="primary" onPress={() => navigate('/xui')}>
                Manage X-UI
              </Button>
            </CardHeader>
            <CardBody>
              {!detail || detail.xuiInstances.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  No X-UI instances linked.
                  <Button size="sm" variant="light" color="primary" className="ml-2" onPress={() => navigate('/xui')}>
                    Go to X-UI to add one
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
                            <p className="text-[10px] text-default-400">Inbounds</p>
                            <p className="text-sm font-semibold">{inst.inboundCount || 0}</p>
                          </div>
                          <div className="rounded-xl bg-content1 p-2">
                            <p className="text-[10px] text-default-400">Clients</p>
                            <p className="text-sm font-semibold">{inst.clientCount || 0}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-default-500">
                          <span>User: {inst.username} / Synced: {formatDate(inst.lastSyncAt)}</span>
                          <span className="text-primary">View Details &rarr;</span>
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
              <h2 className="text-lg font-semibold">Protocol Directory</h2>
            </CardHeader>
            <CardBody>
              {!detail || detail.protocolSummaries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">No protocol data.</div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {detail.protocolSummaries.map((item) => (
                    <div key={item.protocol} className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold uppercase">{item.protocol}</p>
                        <Chip size="sm" color="primary" variant="flat">{item.inboundCount} inbound</Chip>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-content1 p-2">
                          <p className="text-[10px] text-default-400">Clients</p>
                          <p className="text-sm font-semibold">{item.clientCount || 0} <span className="text-xs text-default-500">({item.onlineClientCount || 0} on)</span></p>
                        </div>
                        <div className="rounded-xl bg-content1 p-2">
                          <p className="text-[10px] text-default-400">Traffic</p>
                          <p className="text-sm font-semibold">{formatFlow(item.allTime)}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-default-500">Ports: {item.portSummary || '-'}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Forward Links */}
          <Card className="border border-divider/80">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Forward Links</h2>
              <Button size="sm" variant="flat" color="primary" onPress={() => navigate('/forward')}>
                Manage Forwards
              </Button>
            </CardHeader>
            <CardBody>
              {!detail || detail.forwards.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  No forwards linked.
                  <Button size="sm" variant="light" color="primary" className="ml-2" onPress={() => navigate('/forward')}>
                    Go to Forwards
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
                            {item.status === 1 ? 'Running' : item.status === 0 ? 'Paused' : 'Error'}
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
                    <Table removeWrapper aria-label="forwards">
                      <TableHeader>
                        <TableColumn>Forward</TableColumn>
                        <TableColumn>Tunnel</TableColumn>
                        <TableColumn>Source</TableColumn>
                        <TableColumn>Address</TableColumn>
                        <TableColumn>Status</TableColumn>
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
                                {item.status === 1 ? 'Running' : item.status === 0 ? 'Paused' : 'Error'}
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
      <Modal isOpen={isFormOpen} onOpenChange={(open) => !open && onFormClose()} size="4xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{isEdit ? 'Edit Asset' : 'New Asset'}</ModalHeader>
          <ModalBody>
            <p className="text-xs font-medium uppercase tracking-widest text-default-400">Basic</p>
            <div className="grid gap-4 md:grid-cols-3">
              <Input label="Name" placeholder="HK-VPS-01" value={form.name}
                onValueChange={(v) => setForm(p => ({ ...p, name: v }))} isInvalid={!!errors.name} errorMessage={errors.name} isRequired />
              <Input label="Label" placeholder="Optional identifier" value={form.label}
                onValueChange={(v) => setForm(p => ({ ...p, label: v }))} />
              <Select label="Role" selectedKeys={form.role ? [form.role] : []}
                onSelectionChange={(keys) => setForm(p => ({ ...p, role: Array.from(keys)[0]?.toString() || '' }))}>
                {ROLES.map(r => <SelectItem key={r.key}>{r.label}</SelectItem>)}
              </Select>
            </div>

            <p className="mt-4 text-xs font-medium uppercase tracking-widest text-default-400">Network</p>
            <div className="grid gap-4 md:grid-cols-3">
              <Input label="Primary IP / Domain" value={form.primaryIp}
                onValueChange={(v) => setForm(p => ({ ...p, primaryIp: v }))} />
              <Input label="IPv6" value={form.ipv6}
                onValueChange={(v) => setForm(p => ({ ...p, ipv6: v }))} />
              <Input label="SSH Port" type="number" value={form.sshPort}
                onValueChange={(v) => setForm(p => ({ ...p, sshPort: v }))} />
            </div>

            <p className="mt-4 text-xs font-medium uppercase tracking-widest text-default-400">Specs</p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Input label="OS" placeholder="Ubuntu 22" value={form.os}
                onValueChange={(v) => setForm(p => ({ ...p, os: v }))} />
              <Input label="CPU Cores" type="number" value={form.cpuCores}
                onValueChange={(v) => setForm(p => ({ ...p, cpuCores: v }))} />
              <Input label="RAM (MB)" type="number" value={form.memTotalMb}
                onValueChange={(v) => setForm(p => ({ ...p, memTotalMb: v }))} />
              <Input label="Disk (GB)" type="number" value={form.diskTotalGb}
                onValueChange={(v) => setForm(p => ({ ...p, diskTotalGb: v }))} />
              <Input label="BW (Mbps)" type="number" value={form.bandwidthMbps}
                onValueChange={(v) => setForm(p => ({ ...p, bandwidthMbps: v }))} />
            </div>

            <p className="mt-4 text-xs font-medium uppercase tracking-widest text-default-400">Provider & Cost</p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Input label="Provider" placeholder="DMIT / Vultr" value={form.provider}
                onValueChange={(v) => setForm(p => ({ ...p, provider: v }))} />
              <Input label="Region" placeholder="Hong Kong" value={form.region}
                onValueChange={(v) => setForm(p => ({ ...p, region: v }))} />
              <Input label="Environment" placeholder="PROD / DEV" value={form.environment}
                onValueChange={(v) => setForm(p => ({ ...p, environment: v }))} />
              <Input label="Monthly Traffic (GB)" type="number" value={form.monthlyTrafficGb}
                onValueChange={(v) => setForm(p => ({ ...p, monthlyTrafficGb: v }))} />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Input label="Monthly Cost" value={form.monthlyCost}
                onValueChange={(v) => setForm(p => ({ ...p, monthlyCost: v }))} />
              <Select label="Currency" selectedKeys={form.currency ? [form.currency] : ['CNY']}
                onSelectionChange={(keys) => setForm(p => ({ ...p, currency: Array.from(keys)[0]?.toString() || 'CNY' }))}>
                {CURRENCIES.map(c => <SelectItem key={c.key}>{c.label}</SelectItem>)}
              </Select>
              <Input label="Purchase Date" type="date" value={form.purchaseDate}
                onValueChange={(v) => setForm(p => ({ ...p, purchaseDate: v }))} />
              <Input label="Expire Date" type="date" value={form.expireDate}
                onValueChange={(v) => setForm(p => ({ ...p, expireDate: v }))} />
            </div>

            <p className="mt-4 text-xs font-medium uppercase tracking-widest text-default-400">Integration</p>
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Monitor Node UUID" placeholder="Komari node UUID" value={form.monitorNodeUuid}
                onValueChange={(v) => setForm(p => ({ ...p, monitorNodeUuid: v }))} />
              <Input label="Tags (JSON)" placeholder='["tag1","tag2"]' value={form.tags}
                onValueChange={(v) => setForm(p => ({ ...p, tags: v }))} />
            </div>

            <Textarea label="Remark" value={form.remark}
              onValueChange={(v) => setForm(p => ({ ...p, remark: v }))} minRows={2} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onFormClose}>Cancel</Button>
            <Button color="primary" isLoading={submitLoading} onPress={handleSubmit}>
              {isEdit ? 'Save' : 'Create'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={isDeleteOpen} onOpenChange={(open) => !open && onDeleteClose()}>
        <ModalContent>
          <ModalHeader>Delete Asset</ModalHeader>
          <ModalBody>
            <p className="text-sm">Delete <span className="font-semibold">{assetToDelete?.name}</span>? Assets with linked X-UI instances or forwards cannot be deleted.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onDeleteClose}>Cancel</Button>
            <Button color="danger" isLoading={actionLoadingId === assetToDelete?.id} onPress={handleDelete}>Delete</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
