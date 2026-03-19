import { useEffect, useMemo, useState } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input, Textarea } from "@heroui/input";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell
} from "@heroui/table";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure
} from "@heroui/modal";
import { Select, SelectItem } from "@heroui/select";
import { Switch } from "@heroui/switch";
import { Spinner } from "@heroui/spinner";
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  AssetHost,
  XuiInboundSnapshot,
  XuiInstance,
  XuiInstanceDetail,
  XuiProtocolSummary,
  XuiServerStatus,
  createXuiInstance,
  deleteXuiInstance,
  getAssetList,
  getXuiDetail,
  getXuiList,
  syncXuiInstance,
  testXuiInstance,
  updateXuiInstance
} from '@/api';
import { hasPermission } from '@/utils/auth';

interface XuiInstanceForm {
  id?: number;
  name: string;
  provider: string;
  baseUrl: string;
  webBasePath: string;
  username: string;
  password: string;
  loginSecret: string;
  assetId: number | null;
  hostLabel: string;
  managementMode: string;
  syncEnabled: boolean;
  syncIntervalMinutes: string;
  allowInsecureTls: boolean;
  remark: string;
}

const MANAGEMENT_MODES = [
  { key: 'observe', label: 'Observe', description: '只读观察，远端改动通过轮询自动回流到 Flux。' },
  { key: 'flux_managed', label: 'Flux Managed', description: '后续可由 Flux 作为主控，向远端 x-ui 下发修改。' },
];

const PROVIDER_OPTIONS = [
  { key: 'x-ui', label: 'x-ui', description: '经典 x-ui 面板' },
  { key: '3x-ui', label: '3x-ui', description: '3x-ui 面板，后端会继续自动探测具体 API 风格' },
];

const emptyForm = (): XuiInstanceForm => ({
  name: '',
  provider: 'x-ui',
  baseUrl: '',
  webBasePath: '',
  username: '',
  password: '',
  loginSecret: '',
  assetId: null,
  hostLabel: '',
  managementMode: 'observe',
  syncEnabled: true,
  syncIntervalMinutes: '10',
  allowInsecureTls: false,
  remark: '',
});

const formatDate = (timestamp?: number | null) => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
};

const formatFlow = (value?: number | null) => {
  const bytes = value || 0;
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatPercent = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return `${value.toFixed(2)}%`;
};

const formatUsage = (used?: number | null, total?: number | null) => {
  if (!total) {
    return used ? formatFlow(used) : '-';
  }
  return `${formatFlow(used)} / ${formatFlow(total)}`;
};

const formatUptime = (value?: number | null) => {
  if (!value) return '-';
  const seconds = Math.max(0, Math.floor(value));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const formatLoadAverage = (loads?: number[] | null) => {
  if (!loads || loads.length === 0) return '-';
  return loads.map((value) => value.toFixed(2)).join(' / ');
};

const getStatusChip = (status?: string | null) => {
  switch (status) {
    case 'success':
      return { color: 'success' as const, text: '成功' };
    case 'failed':
      return { color: 'danger' as const, text: '失败' };
    case 'never':
    default:
      return { color: 'default' as const, text: '未执行' };
  }
};

const getSnapshotStatusChip = (status: number, enabled?: number) => {
  if (status === 1) {
    return { color: 'danger' as const, text: '远端已删除' };
  }
  if (enabled === 0) {
    return { color: 'warning' as const, text: '已停用' };
  }
  return { color: 'success' as const, text: '正常' };
};

const getManagementModeMeta = (mode?: string | null) =>
  MANAGEMENT_MODES.find((item) => item.key === mode) || MANAGEMENT_MODES[0];

const buildInstanceAddress = (instance: Pick<XuiInstance, 'baseUrl' | 'webBasePath'>) =>
  `${instance.baseUrl}${instance.webBasePath || '/'}`;

const normalizeKeyword = (value?: string | null) => (value || '').trim().toLowerCase();

const buildProtocolSummaryFallback = (inbounds: XuiInboundSnapshot[]): XuiProtocolSummary[] => {
  if (!inbounds.length) {
    return [];
  }
  const summaryMap = new Map<string, XuiProtocolSummary>();
  const portMap = new Map<string, Set<string>>();
  const transportMap = new Map<string, Set<string>>();

  inbounds.forEach((inbound) => {
    const protocol = normalizeKeyword(inbound.protocol) || 'unknown';
    if (!summaryMap.has(protocol)) {
      summaryMap.set(protocol, {
        protocol,
        inboundCount: 0,
        activeInboundCount: 0,
        enabledInboundCount: 0,
        disabledInboundCount: 0,
        deletedInboundCount: 0,
        clientCount: 0,
        onlineClientCount: 0,
        up: 0,
        down: 0,
        allTime: 0,
        portSummary: '-',
        transportSummary: '-',
      });
    }

    const summary = summaryMap.get(protocol)!;
    summary.inboundCount += 1;
    if (inbound.status === 1) {
      summary.deletedInboundCount += 1;
    } else {
      summary.activeInboundCount += 1;
      if (inbound.enable === 0) {
        summary.disabledInboundCount += 1;
      } else {
        summary.enabledInboundCount += 1;
      }
    }
    summary.clientCount += inbound.clientCount || 0;
    summary.onlineClientCount += inbound.onlineClientCount || 0;
    summary.up = (summary.up || 0) + (inbound.up || 0);
    summary.down = (summary.down || 0) + (inbound.down || 0);
    summary.allTime = (summary.allTime || 0) + (inbound.allTime || 0);

    if (inbound.port) {
      const value = inbound.listen ? `${inbound.listen}:${inbound.port}` : String(inbound.port);
      if (!portMap.has(protocol)) {
        portMap.set(protocol, new Set<string>());
      }
      portMap.get(protocol)!.add(value);
    }
    if (inbound.transportSummary && inbound.transportSummary !== '-') {
      if (!transportMap.has(protocol)) {
        transportMap.set(protocol, new Set<string>());
      }
      transportMap.get(protocol)!.add(inbound.transportSummary);
    }
  });

  return Array.from(summaryMap.values())
    .map((summary) => {
      const ports = Array.from(portMap.get(summary.protocol) || []);
      const transports = Array.from(transportMap.get(summary.protocol) || []);
      return {
        ...summary,
        portSummary: ports.length ? ports.slice(0, 4).join(', ') + (ports.length > 4 ? ` +${ports.length - 4}` : '') : '-',
        transportSummary: transports.length ? transports.slice(0, 3).join(', ') + (transports.length > 3 ? ` +${transports.length - 3}` : '') : '-',
      };
    })
    .sort((a, b) => (b.allTime || 0) - (a.allTime || 0));
};

export default function XuiPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canViewXui = hasPermission('xui.read');
  const canCreateXui = hasPermission('xui.create');
  const canUpdateXui = hasPermission('xui.update');
  const canDeleteXui = hasPermission('xui.delete');
  const canSyncXui = hasPermission('xui.sync');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [instances, setInstances] = useState<XuiInstance[]>([]);
  const [assets, setAssets] = useState<AssetHost[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(null);
  const [detail, setDetail] = useState<XuiInstanceDetail | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [isEdit, setIsEdit] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<XuiInstance | null>(null);
  const [form, setForm] = useState<XuiInstanceForm>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchKeyword, setSearchKeyword] = useState('');
  const [nameAutoFilled, setNameAutoFilled] = useState(false);

  const {
    isOpen: isFormOpen,
    onOpen: onFormOpen,
    onClose: onFormClose
  } = useDisclosure();

  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose
  } = useDisclosure();

  useEffect(() => {
    void Promise.all([loadInstances(), loadAssets()]);
  }, []);

  useEffect(() => {
    const rawId = searchParams.get('instanceId');
    if (!rawId) return;
    const parsedId = Number(rawId);
    if (!Number.isFinite(parsedId) || parsedId <= 0) return;
    setSelectedInstanceId(parsedId);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedInstanceId) {
      setDetail(null);
      return;
    }
    setDetail(null);
    void loadDetail(selectedInstanceId);
  }, [selectedInstanceId]);

  const inboundMap = useMemo(() => {
    const map = new Map<number, XuiInboundSnapshot>();
    detail?.inbounds.forEach((inbound) => map.set(inbound.remoteInboundId, inbound));
    return map;
  }, [detail]);

  const protocolSummaries = useMemo(
    () => detail?.protocolSummaries?.length ? detail.protocolSummaries : buildProtocolSummaryFallback(detail?.inbounds || []),
    [detail]
  );

  const liveServerStatus: XuiServerStatus | null = detail?.serverStatus || null;

  const summary = useMemo(() => ({
    totalAssets: new Set(instances.map((item) => item.assetId).filter(Boolean)).size,
    totalInstances: instances.length,
    autoSyncInstances: instances.filter((item) => item.syncEnabled === 1).length,
    totalInbounds: instances.reduce((sum, item) => sum + (item.inboundCount || 0), 0),
    totalClients: instances.reduce((sum, item) => sum + (item.clientCount || 0), 0),
  }), [instances]);

  const providerBreakdown = useMemo(() => ({
    xui: instances.filter((item) => (item.provider || 'x-ui') !== '3x-ui').length,
    threeXui: instances.filter((item) => item.provider === '3x-ui').length,
  }), [instances]);

  const filteredInstances = useMemo(() => {
    const keyword = normalizeKeyword(searchKeyword);
    if (!keyword) {
      return instances;
    }
    return instances.filter((instance) => {
      const haystacks = [
        instance.name,
        instance.assetName,
        instance.hostLabel,
        instance.provider,
        instance.baseUrl,
        instance.webBasePath,
        instance.username,
        instance.remark,
      ];
      return haystacks.some((value) => normalizeKeyword(value).includes(keyword));
    });
  }, [instances, searchKeyword]);

  const selectedInstance = useMemo(
    () => instances.find((instance) => instance.id === selectedInstanceId) || null,
    [instances, selectedInstanceId]
  );

  const selectedLayerSummary = useMemo(() => {
    if (!selectedInstance) {
      return null;
    }
    return {
      serverIdentity: liveServerStatus?.publicIpv4 || selectedInstance.assetName || selectedInstance.hostLabel || '-',
      protocolCount: protocolSummaries.length,
      onlineClients: protocolSummaries.reduce((sum, item) => sum + (item.onlineClientCount || 0), 0),
      dominantProtocol: protocolSummaries[0]?.protocol || '-',
    };
  }, [selectedInstance, liveServerStatus, protocolSummaries]);

  const selectedCallbackUrl = useMemo(() => {
    if (!selectedInstance) {
      return '';
    }
    return `${window.location.origin}${selectedInstance.trafficCallbackPath}`;
  }, [selectedInstance]);

  // Auto-fill instance name from selected asset (only in create mode)
  useEffect(() => {
    if (isEdit || !form.assetId) return;
    const asset = assets.find(a => a.id === form.assetId);
    if (!asset) return;
    if (!form.name.trim() || nameAutoFilled) {
      setForm(prev => ({ ...prev, name: asset.name }));
      setNameAutoFilled(true);
    }
  }, [form.assetId]);

  const assetOptions = useMemo(
    () => [
      {
        key: '__none__',
        label: '暂不绑定资产',
        description: '保留旧 hostLabel 兼容，暂不纳入资产层聚合'
      },
      ...assets.map((asset) => ({
        key: String(asset.id),
        label: asset.name,
        description: `${asset.primaryIp || '未记录主 IP'}${asset.environment ? ` · ${asset.environment}` : ''}`
      }))
    ],
    [assets]
  );

  const loadInstances = async () => {
    setLoading(true);
    try {
      const response = await getXuiList();
      if (response.code !== 0) {
        toast.error(response.msg || '加载 x-ui 实例失败');
        return;
      }
      const list = response.data || [];
      setInstances(list);
      setSelectedInstanceId((current) => {
        if (current && list.some((item) => item.id === current)) {
          return current;
        }
        return list.length > 0 ? list[0].id : null;
      });
    } catch (error) {
      toast.error('加载 x-ui 实例失败');
    } finally {
      setLoading(false);
    }
  };

  const loadAssets = async () => {
    try {
      const response = await getAssetList();
      if (response.code === 0) {
        setAssets(response.data || []);
      }
    } catch (error) {
      console.warn('加载资产选项失败:', error);
    }
  };

  const loadDetail = async (instanceId: number) => {
    setDetailLoading(true);
    try {
      const response = await getXuiDetail(instanceId);
      if (response.code !== 0) {
        toast.error(response.msg || '加载 x-ui 快照失败');
        return;
      }
      setDetail(response.data || null);
    } catch (error) {
      toast.error('加载 x-ui 快照失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const openCreateModal = () => {
    if (!canCreateXui) {
      toast.error('权限不足，无法新增 X-UI 实例');
      return;
    }
    setIsEdit(false);
    setErrors({});
    setForm(emptyForm());
    setNameAutoFilled(false);
    onFormOpen();
  };

  const openEditModal = (instance: XuiInstance) => {
    if (!canUpdateXui) {
      toast.error('权限不足，无法编辑 X-UI 实例');
      return;
    }
    setIsEdit(true);
    setErrors({});
    setForm({
      id: instance.id,
      name: instance.name,
      provider: instance.provider || 'x-ui',
      baseUrl: instance.baseUrl,
      webBasePath: instance.webBasePath || '/',
      username: instance.username,
      password: '',
      loginSecret: '',
      assetId: instance.assetId || null,
      hostLabel: instance.hostLabel || '',
      managementMode: instance.managementMode || 'observe',
      syncEnabled: instance.syncEnabled === 1,
      syncIntervalMinutes: String(instance.syncIntervalMinutes || 10),
      allowInsecureTls: instance.allowInsecureTls === 1,
      remark: instance.remark || '',
    });
    onFormOpen();
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = '实例名称不能为空';
    if (!form.baseUrl.trim()) nextErrors.baseUrl = '实例地址不能为空';
    if (!form.username.trim()) nextErrors.username = '登录用户名不能为空';
    if (!isEdit && !form.password.trim()) nextErrors.password = '首次创建时必须填写密码';
    const interval = Number(form.syncIntervalMinutes);
    if (!Number.isFinite(interval) || interval < 1 || interval > 1440) {
      nextErrors.syncIntervalMinutes = '同步间隔必须在 1 到 1440 分钟之间';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!(canCreateXui || canUpdateXui)) {
      toast.error('权限不足，无法保存 X-UI 实例');
      return;
    }
    if (!validateForm()) return;
    setSubmitLoading(true);
    try {
      const payload: Record<string, unknown> = {
        ...(isEdit ? { id: form.id } : {}),
        name: form.name.trim(),
        provider: form.provider,
        baseUrl: form.baseUrl.trim(),
        webBasePath: form.webBasePath.trim(),
        username: form.username.trim(),
        assetId: form.assetId,
        hostLabel: form.hostLabel.trim(),
        managementMode: form.managementMode,
        syncEnabled: form.syncEnabled ? 1 : 0,
        syncIntervalMinutes: Number(form.syncIntervalMinutes),
        allowInsecureTls: form.allowInsecureTls ? 1 : 0,
        remark: form.remark.trim(),
      };

      if (isEdit) {
        if (form.password.trim()) {
          payload.password = form.password.trim();
        }
        if (form.loginSecret.trim()) {
          payload.loginSecret = form.loginSecret.trim();
        }
      } else {
        payload.password = form.password.trim();
        if (form.loginSecret.trim()) {
          payload.loginSecret = form.loginSecret.trim();
        }
      }

      const response = isEdit
        ? await updateXuiInstance(payload)
        : await createXuiInstance(payload);

      if (response.code !== 0) {
        toast.error(response.msg || (isEdit ? '更新失败' : '创建失败'));
        return;
      }
      toast.success(isEdit ? 'x-ui 实例已更新' : 'x-ui 实例已创建');
      onFormClose();
      await Promise.all([loadInstances(), loadAssets()]);
      const targetId = response.data?.id || form.id;
      if (targetId) {
        setSelectedInstanceId(targetId);
      }
    } catch (error) {
      toast.error('保存 x-ui 实例失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!canDeleteXui) {
      toast.error('权限不足，无法删除 X-UI 实例');
      return;
    }
    if (!instanceToDelete) return;
    setActionLoadingId(instanceToDelete.id);
    try {
      const response = await deleteXuiInstance(instanceToDelete.id);
      if (response.code !== 0) {
        toast.error(response.msg || '删除失败');
        return;
      }
      toast.success('x-ui 实例已删除');
      onDeleteClose();
      if (selectedInstanceId === instanceToDelete.id) {
        setSelectedInstanceId(null);
      }
      setInstanceToDelete(null);
      await Promise.all([loadInstances(), loadAssets()]);
    } catch (error) {
      toast.error('删除 x-ui 实例失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleTest = async (instance: XuiInstance) => {
    if (!canUpdateXui) {
      toast.error('权限不足，无法测试 X-UI 连接');
      return;
    }
    setActionLoadingId(instance.id);
    try {
      const response = await testXuiInstance(instance.id);
      if (response.code !== 0) {
        toast.error(response.msg || '连接测试失败');
        return;
      }
      const flavor = response.data?.apiFlavor || 'auto';
      const basePath = response.data?.resolvedBasePath || instance.webBasePath || '/';
      toast.success(`${instance.name} 连接成功，识别为 ${flavor}，Base Path ${basePath}`);
      await Promise.all([loadInstances(), loadAssets()]);
      if (selectedInstanceId === instance.id) {
        await loadDetail(instance.id);
      }
    } catch (error) {
      toast.error('连接测试失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSync = async (instance: XuiInstance) => {
    if (!canSyncXui) {
      toast.error('权限不足，无法同步 X-UI 实例');
      return;
    }
    setActionLoadingId(instance.id);
    try {
      const response = await syncXuiInstance(instance.id);
      if (response.code !== 0) {
        toast.error(response.msg || '同步失败');
        return;
      }
      const flavor = response.data?.apiFlavor ? ` · ${response.data.apiFlavor}` : '';
      toast.success(`${response.data?.message || '同步完成'}${flavor}`);
      await Promise.all([loadInstances(), loadAssets()]);
      if (selectedInstanceId === instance.id) {
        await loadDetail(instance.id);
      }
    } catch (error) {
      toast.error('同步失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  const openDeleteModal = (instance: XuiInstance) => {
    if (!canDeleteXui) {
      toast.error('权限不足，无法删除 X-UI 实例');
      return;
    }
    setInstanceToDelete(instance);
    onDeleteOpen();
  };

  const copyCallbackUrl = async () => {
    if (!selectedCallbackUrl) return;
    try {
      await navigator.clipboard.writeText(selectedCallbackUrl);
      toast.success('上报地址已复制');
    } catch (error) {
      toast.error('复制失败，请手动复制');
    }
  };

  if (!canViewXui) {
    return (
      <Card className="border border-danger/20 bg-danger-50/60">
        <CardBody className="p-6">
          <h1 className="text-xl font-semibold text-danger">缺少 X-UI 查看权限</h1>
          <p className="mt-2 text-sm text-danger-700">
            该模块会保存外部面板的接入凭据与同步状态，请联系管理员分配对应权限。
          </p>
        </CardBody>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">X-UI 管理</h1>
          <p className="mt-1 max-w-3xl text-sm text-default-500">
            在 Flux 中登记 x-ui / 3x-ui 实例，统一执行连接测试、快照同步、流量上报接入和后续集中纳管。实例列表只返回脱敏状态，不向前端暴露明文凭据。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="flat" onPress={() => navigate('/xui-protocols')}>
            协议看板
          </Button>
          {(canCreateXui || canUpdateXui) && (
            <Button color="primary" onPress={openCreateModal}>
              新增 X-UI 实例
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <Card className="border border-divider/80">
          <CardBody className="gap-2 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-default-400">Assets</p>
            <p className="text-3xl font-semibold">{summary.totalAssets}</p>
            <p className="text-sm text-default-500">当前已绑定资产的服务器数</p>
          </CardBody>
        </Card>
        <Card className="border border-divider/80">
          <CardBody className="gap-2 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-default-400">Instances</p>
            <p className="text-3xl font-semibold">{summary.totalInstances}</p>
            <p className="text-sm text-default-500">x-ui {providerBreakdown.xui} / 3x-ui {providerBreakdown.threeXui}</p>
          </CardBody>
        </Card>
        <Card className="border border-divider/80">
          <CardBody className="gap-2 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-default-400">Auto Sync</p>
            <p className="text-3xl font-semibold">{summary.autoSyncInstances}</p>
            <p className="text-sm text-default-500">开启自动轮询同步的实例</p>
          </CardBody>
        </Card>
        <Card className="border border-divider/80">
          <CardBody className="gap-2 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-default-400">Inbounds</p>
            <p className="text-3xl font-semibold">{summary.totalInbounds}</p>
            <p className="text-sm text-default-500">当前已导入的远端入站节点总数</p>
          </CardBody>
        </Card>
        <Card className="border border-divider/80">
          <CardBody className="gap-2 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-default-400">Clients</p>
            <p className="text-3xl font-semibold">{summary.totalClients}</p>
            <p className="text-sm text-default-500">当前已导入的远端客户端总数</p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <Card className="border border-divider/80">
          <CardHeader className="flex flex-col items-start gap-3">
            <div className="w-full">
              <h2 className="text-lg font-semibold">实例目录</h2>
              <p className="text-sm text-default-500">
                左侧统一登记与筛选实例，右侧只操作当前选中的环境，避免多环境并排混乱。
              </p>
            </div>
            <Input
              value={searchKeyword}
              onValueChange={setSearchKeyword}
              placeholder="按名称、资产、主机标识、域名或账号筛选"
            />
          </CardHeader>
          <CardBody className="space-y-3">
            {filteredInstances.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                {instances.length === 0 ? '还没有登记任何 x-ui 实例。先新增一个测试实例。' : '没有匹配的实例。'}
              </div>
            ) : (
              filteredInstances.map((instance) => {
                const selected = instance.id === selectedInstanceId;
                const syncChip = getStatusChip(instance.lastSyncStatus);
                const testChip = getStatusChip(instance.lastTestStatus);
                const modeMeta = getManagementModeMeta(instance.managementMode);

                return (
                  <button
                    type="button"
                    key={instance.id}
                    onClick={() => setSelectedInstanceId(instance.id)}
                    className={`w-full rounded-3xl border p-4 text-left transition-all ${
                      selected
                        ? 'border-primary bg-primary-50/70 shadow-lg shadow-primary/10'
                        : 'border-divider/80 bg-content1 hover:border-primary/40 hover:bg-default-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-base font-semibold">{instance.name}</p>
                          <Chip size="sm" color={instance.provider === '3x-ui' ? 'secondary' : 'default'} variant="flat">
                            {instance.provider === '3x-ui' ? '3x-ui' : 'x-ui'}
                          </Chip>
                          {instance.assetName ? (
                            <Chip size="sm" color="primary" variant="flat">{instance.assetName}</Chip>
                          ) : null}
                          {!instance.assetName && instance.hostLabel ? (
                            <Chip size="sm" variant="flat">{instance.hostLabel}</Chip>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-xs text-default-500">{buildInstanceAddress(instance)}</p>
                      </div>
                      <Chip size="sm" color={selected ? 'primary' : 'default'} variant="flat">
                        {selected ? '当前实例' : '查看'}
                      </Chip>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Chip size="sm" color={instance.syncEnabled === 1 ? 'success' : 'default'} variant="flat">
                        {instance.syncEnabled === 1 ? '自动同步' : '手动同步'}
                      </Chip>
                      <Chip size="sm" variant="flat">{modeMeta.label}</Chip>
                      {instance.lastApiFlavor ? (
                        <Chip size="sm" color="secondary" variant="flat">{instance.lastApiFlavor}</Chip>
                      ) : null}
                      <Chip size="sm" color={instance.passwordConfigured ? 'success' : 'danger'} variant="flat">
                        {instance.passwordConfigured ? '密码已配置' : '缺少密码'}
                      </Chip>
                      {instance.loginSecretConfigured ? (
                        <Chip size="sm" color="secondary" variant="flat">Secret Token 已配置</Chip>
                      ) : null}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-default-100/80 p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-default-400">入站</p>
                        <p className="mt-1 text-lg font-semibold">{instance.inboundCount}</p>
                      </div>
                      <div className="rounded-2xl bg-default-100/80 p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-default-400">客户端</p>
                        <p className="mt-1 text-lg font-semibold">{instance.clientCount}</p>
                      </div>
                      <div className="rounded-2xl bg-default-100/80 p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-default-400">测试</p>
                        <Chip size="sm" color={testChip.color} variant="flat" className="mt-1">{testChip.text}</Chip>
                      </div>
                      <div className="rounded-2xl bg-default-100/80 p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-default-400">同步</p>
                        <Chip size="sm" color={syncChip.color} variant="flat" className="mt-1">{syncChip.text}</Chip>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card className="border border-divider/80">
            <CardHeader className="flex flex-col items-start gap-3">
              {!selectedInstance ? (
                <div>
                  <h2 className="text-lg font-semibold">实例概览</h2>
                  <p className="text-sm text-default-500">请选择一个 x-ui 实例查看详细状态。</p>
                </div>
              ) : (
                <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold">{selectedInstance.name}</h2>
                      {selectedInstance.assetName ? (
                        <Chip size="sm" color="primary" variant="flat">{selectedInstance.assetName}</Chip>
                      ) : null}
                      <Chip size="sm" color={selectedInstance.provider === '3x-ui' ? 'secondary' : 'default'} variant="flat">
                        {selectedInstance.provider === '3x-ui' ? '3x-ui' : 'x-ui'}
                      </Chip>
                      <Chip size="sm" variant="flat">{getManagementModeMeta(selectedInstance.managementMode).label}</Chip>
                      <Chip size="sm" color={selectedInstance.syncEnabled === 1 ? 'success' : 'default'} variant="flat">
                        {selectedInstance.syncEnabled === 1 ? '自动同步' : '手动同步'}
                      </Chip>
                    </div>
                    <p className="mt-1 break-all text-sm text-default-500">{buildInstanceAddress(selectedInstance)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(canCreateXui || canUpdateXui) && (
                      <Button
                        size="sm"
                        variant="flat"
                        color="secondary"
                        isLoading={actionLoadingId === selectedInstance.id}
                        onPress={() => handleTest(selectedInstance)}
                      >
                        测试连接
                      </Button>
                    )}
                    {canSyncXui && (
                      <Button
                        size="sm"
                        variant="flat"
                        color="success"
                        isLoading={actionLoadingId === selectedInstance.id}
                        onPress={() => handleSync(selectedInstance)}
                      >
                        立即同步
                      </Button>
                    )}
                    {(canCreateXui || canUpdateXui) && (
                      <>
                        <Button size="sm" variant="flat" onPress={() => openEditModal(selectedInstance)}>
                          编辑
                        </Button>
                        <Button size="sm" variant="flat" color="danger" onPress={() => openDeleteModal(selectedInstance)}>
                          删除
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </CardHeader>
            <CardBody>
              {!selectedInstance ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  从左侧实例目录选择一个环境后，这里会显示连接方式、凭据状态、上报地址和错误信息。
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Chip size="sm" color={getStatusChip(selectedInstance.lastTestStatus).color} variant="flat">
                      测试：{getStatusChip(selectedInstance.lastTestStatus).text}
                    </Chip>
                    <Chip size="sm" color={getStatusChip(selectedInstance.lastSyncStatus).color} variant="flat">
                      同步：{getStatusChip(selectedInstance.lastSyncStatus).text}
                    </Chip>
                    <Chip size="sm" color={selectedInstance.passwordConfigured ? 'success' : 'danger'} variant="flat">
                      {selectedInstance.passwordConfigured ? '登录密码已配置' : '登录密码缺失'}
                    </Chip>
                    <Chip size="sm" color={selectedInstance.loginSecretConfigured ? 'secondary' : 'default'} variant="flat">
                      {selectedInstance.loginSecretConfigured ? 'Secret Token 已配置' : '未配置 Secret Token'}
                    </Chip>
                    <Chip size="sm" color={selectedInstance.allowInsecureTls === 1 ? 'warning' : 'success'} variant="flat">
                      {selectedInstance.allowInsecureTls === 1 ? '跳过 TLS 校验' : '严格 TLS 校验'}
                    </Chip>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-default-400">连接信息</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <p><span className="text-default-500">面板入口：</span><span className="break-all">{buildInstanceAddress(selectedInstance)}</span></p>
                        <p><span className="text-default-500">登录账号：</span>{selectedInstance.username}</p>
                        <p><span className="text-default-500">绑定资产：</span>{selectedInstance.assetName || '-'}</p>
                        <p><span className="text-default-500">兼容主机标签：</span>{selectedInstance.hostLabel || '-'}</p>
                        <p><span className="text-default-500">同步策略：</span>{selectedInstance.syncIntervalMinutes} 分钟 / {selectedInstance.syncEnabled === 1 ? '自动' : '手动'}</p>
                      </div>
                    </div>
                    <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-default-400">流量上报地址</p>
                        <Button size="sm" variant="flat" onPress={copyCallbackUrl}>复制</Button>
                      </div>
                      <p className="mt-3 break-all text-sm">{selectedCallbackUrl}</p>
                      <p className="mt-2 text-xs text-default-500">
                        仅在管理员界面展示，日志中已做脱敏。把它填到远端 x-ui 的 External Traffic Inform URI 即可接收增量流量上报。
                      </p>
                    </div>
                    <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-default-400">最近活动</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <p><span className="text-default-500">最近测试：</span>{formatDate(selectedInstance.lastTestAt)}</p>
                        <p><span className="text-default-500">最近同步：</span>{formatDate(selectedInstance.lastSyncAt)}</p>
                        <p><span className="text-default-500">最近流量上报：</span>{formatDate(selectedInstance.lastTrafficPushAt)}</p>
                        <p><span className="text-default-500">识别 API：</span>{selectedInstance.lastApiFlavor || '-'}</p>
                        <p><span className="text-default-500">识别 Base Path：</span><span className="font-mono">{selectedInstance.lastResolvedBasePath || selectedInstance.webBasePath || '/'}</span></p>
                      </div>
                    </div>
                    <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-default-400">接入备注</p>
                      <p className="mt-3 text-sm text-default-700">{selectedInstance.remark || '未填写备注'}</p>
                      <p className="mt-2 text-xs text-default-500">{getManagementModeMeta(selectedInstance.managementMode).description}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-3">
                    <div className="rounded-3xl border border-divider/80 bg-content1 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-default-400">服务器层</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <p><span className="text-default-500">资产：</span>{selectedInstance.assetName || '-'}</p>
                        <p><span className="text-default-500">兼容主机标签：</span>{selectedInstance.hostLabel || '-'}</p>
                        <p><span className="text-default-500">公网 IPv4：</span>{liveServerStatus?.publicIpv4 || '-'}</p>
                        <p><span className="text-default-500">Xray：</span>{liveServerStatus?.xrayState || '-'}{liveServerStatus?.xrayVersion ? ` · ${liveServerStatus.xrayVersion}` : ''}</p>
                        <p><span className="text-default-500">运行时长：</span>{formatUptime(liveServerStatus?.uptime)}</p>
                      </div>
                      <p className="mt-3 text-xs text-default-500">
                        这一层后续用于绑定 VPS、探针、转发服务和 x-ui 实例，形成统一资产面。
                      </p>
                    </div>

                    <div className="rounded-3xl border border-divider/80 bg-content1 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-default-400">面板层</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <p><span className="text-default-500">实例类型：</span>{selectedInstance.provider === '3x-ui' ? '3x-ui' : 'x-ui'}</p>
                        <p><span className="text-default-500">实例地址：</span><span className="break-all">{buildInstanceAddress(selectedInstance)}</span></p>
                        <p><span className="text-default-500">同步模式：</span>{selectedInstance.syncEnabled === 1 ? '自动轮询' : '手动同步'}</p>
                        <p><span className="text-default-500">最近同步：</span>{formatDate(selectedInstance.lastSyncAt)}</p>
                        <p><span className="text-default-500">最近测试：</span>{formatDate(selectedInstance.lastTestAt)}</p>
                      </div>
                      <p className="mt-3 text-xs text-default-500">
                        这一层保存接入凭据、同步策略、上报地址和写回模式，是统一纳管的控制面。
                      </p>
                    </div>

                    <div className="rounded-3xl border border-divider/80 bg-content1 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-default-400">协议层</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <p><span className="text-default-500">协议数量：</span>{selectedLayerSummary?.protocolCount || 0}</p>
                        <p><span className="text-default-500">主协议：</span>{selectedLayerSummary?.dominantProtocol || '-'}</p>
                        <p><span className="text-default-500">入站总数：</span>{selectedInstance.inboundCount || 0}</p>
                        <p><span className="text-default-500">在线客户端：</span>{selectedLayerSummary?.onlineClients || 0}</p>
                      </div>
                      <p className="mt-3 text-xs text-default-500">
                        这一层按协议收敛端口、流量、在线数和传输方式，方便后续和套餐、分类、探针告警联动。
                      </p>
                    </div>
                  </div>

                  {(selectedInstance.lastSyncError || selectedInstance.lastTestError) ? (
                    <div className="rounded-3xl border border-warning/20 bg-warning-50/70 p-4 text-sm text-warning-700">
                      <p className="font-medium">最近错误</p>
                      <p className="mt-2 break-all">{selectedInstance.lastSyncError || selectedInstance.lastTestError}</p>
                    </div>
                  ) : null}
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="border border-divider/80">
            <CardHeader className="flex flex-col items-start gap-2">
              <h2 className="text-lg font-semibold">节点监控</h2>
              <p className="text-sm text-default-500">
                直接读取远端 x-ui 面板的 server/status，展示 VPS 与 Xray 运行态。这里是后续和探针层合并的起点。
              </p>
            </CardHeader>
            <CardBody>
              {!selectedInstance ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  请选择一个 x-ui 实例查看节点监控。
                </div>
              ) : detail?.serverStatus ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-default-400">网络身份</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <p><span className="text-default-500">IPv4：</span>{detail.serverStatus.publicIpv4 || '-'}</p>
                      <p><span className="text-default-500">IPv6：</span>{detail.serverStatus.publicIpv6 || '-'}</p>
                      <p><span className="text-default-500">TCP / UDP：</span>{detail.serverStatus.tcpCount ?? '-'} / {detail.serverStatus.udpCount ?? '-'}</p>
                      <p><span className="text-default-500">Xray：</span>{detail.serverStatus.xrayState || '-'}{detail.serverStatus.xrayVersion ? ` · ${detail.serverStatus.xrayVersion}` : ''}</p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-default-400">CPU 与负载</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <p><span className="text-default-500">CPU 占用：</span>{formatPercent(detail.serverStatus.cpuUsage)}</p>
                      <p><span className="text-default-500">核心 / 线程：</span>{detail.serverStatus.cpuCores ?? '-'} / {detail.serverStatus.logicalProcessors ?? '-'}</p>
                      <p><span className="text-default-500">主频：</span>{detail.serverStatus.cpuSpeedMhz ? `${detail.serverStatus.cpuSpeedMhz} MHz` : '-'}</p>
                      <p><span className="text-default-500">负载：</span>{formatLoadAverage(detail.serverStatus.loads)}</p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-default-400">内存与磁盘</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <p><span className="text-default-500">内存：</span>{formatUsage(detail.serverStatus.memoryUsed, detail.serverStatus.memoryTotal)}</p>
                      <p><span className="text-default-500">Swap：</span>{formatUsage(detail.serverStatus.swapUsed, detail.serverStatus.swapTotal)}</p>
                      <p><span className="text-default-500">磁盘：</span>{formatUsage(detail.serverStatus.diskUsed, detail.serverStatus.diskTotal)}</p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-default-400">网络速率与累计</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <p><span className="text-default-500">实时上 / 下：</span>{formatFlow(detail.serverStatus.netIoUp)} / {formatFlow(detail.serverStatus.netIoDown)}</p>
                      <p><span className="text-default-500">累计发 / 收：</span>{formatFlow(detail.serverStatus.netTrafficSent)} / {formatFlow(detail.serverStatus.netTrafficReceived)}</p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-default-400">运行时长</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <p><span className="text-default-500">系统：</span>{formatUptime(detail.serverStatus.uptime)}</p>
                      <p><span className="text-default-500">面板进程：</span>{formatUptime(detail.serverStatus.appUptime)}</p>
                      <p><span className="text-default-500">线程：</span>{detail.serverStatus.appThreads ?? '-'}</p>
                      <p><span className="text-default-500">面板内存：</span>{formatFlow(detail.serverStatus.appMemory)}</p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-default-400">关联视角</p>
                      <div className="mt-3 space-y-2 text-sm">
                      <p><span className="text-default-500">资产：</span>{selectedInstance.assetName || '-'}</p>
                      <p><span className="text-default-500">服务器标识：</span>{selectedInstance.hostLabel || '-'}</p>
                      <p><span className="text-default-500">当前协议数：</span>{selectedLayerSummary?.protocolCount || 0}</p>
                      <p><span className="text-default-500">在线客户端：</span>{selectedLayerSummary?.onlineClients || 0}</p>
                      <p><span className="text-default-500">主协议：</span>{selectedLayerSummary?.dominantProtocol || '-'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  {detail?.serverStatusError ? `远端节点监控暂时不可用：${detail.serverStatusError}` : '当前还没有可用的节点监控数据。'}
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="border border-divider/80">
            <CardHeader className="flex flex-col items-start gap-2">
              <h2 className="text-lg font-semibold">协议汇总</h2>
              <p className="text-sm text-default-500">
                按协议聚合入站数、在线数、流量与端口。后续你要做"服务器 / 面板 / 协议"的整体管理，这一层就是协议目录。
              </p>
            </CardHeader>
            <CardBody>
              {!selectedInstance ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  请选择一个 x-ui 实例查看协议汇总。
                </div>
              ) : protocolSummaries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  当前实例还没有同步到协议级快照。
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {protocolSummaries.map((item) => (
                    <div key={item.protocol} className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold uppercase">{item.protocol}</p>
                          <p className="mt-1 text-xs text-default-500">{item.transportSummary || '-'}</p>
                        </div>
                        <Chip size="sm" color="primary" variant="flat">
                          {item.inboundCount} 入站
                        </Chip>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-content1 p-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-default-400">客户端</p>
                          <p className="mt-1 text-lg font-semibold">{item.clientCount || 0}</p>
                          <p className="text-xs text-default-500">在线 {item.onlineClientCount || 0}</p>
                        </div>
                        <div className="rounded-2xl bg-content1 p-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-default-400">累计流量</p>
                          <p className="mt-1 text-lg font-semibold">{formatFlow(item.allTime)}</p>
                          <p className="text-xs text-default-500">{formatFlow(item.up)} / {formatFlow(item.down)}</p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2 text-sm">
                        <p><span className="text-default-500">启用 / 停用：</span>{item.enabledInboundCount || 0} / {item.disabledInboundCount || 0}</p>
                        <p><span className="text-default-500">远端已删：</span>{item.deletedInboundCount || 0}</p>
                        <p><span className="text-default-500">端口摘要：</span>{item.portSummary || '-'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="border border-divider/80">
            <CardHeader className="flex flex-col items-start gap-2">
              <div className="flex w-full items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">已同步入站节点</h2>
                  <p className="text-sm text-default-500">
                    当前展示 Flux 保存的远端入站快照。节点新增、修改、删除会在同步时做 diff 并更新这里的数据。
                  </p>
                </div>
                {detailLoading ? <Spinner size="sm" /> : null}
              </div>
            </CardHeader>
            <CardBody>
              {!detail || detail.inbounds.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  {selectedInstanceId ? '当前实例还没有同步到任何入站节点。' : '请选择一个 x-ui 实例查看快照。'}
                </div>
              ) : (
                <div className="overflow-x-auto -mx-3 px-3">
                <Table removeWrapper aria-label="x-ui inbound snapshots">
                  <TableHeader>
                    <TableColumn>入站</TableColumn>
                    <TableColumn>协议</TableColumn>
                    <TableColumn>端口</TableColumn>
                    <TableColumn>客户端</TableColumn>
                    <TableColumn>累计流量</TableColumn>
                    <TableColumn>状态</TableColumn>
                    <TableColumn>最近同步</TableColumn>
                  </TableHeader>
                  <TableBody items={detail.inbounds} emptyContent="暂无入站协议">
                    {(item) => {
                      const statusChip = getSnapshotStatusChip(item.status, item.enable);
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="min-w-[180px]">
                              <p className="font-medium">{item.remark || item.tag || `Inbound #${item.remoteInboundId}`}</p>
                              <p className="text-xs text-default-500">{item.tag || '-'} · {item.transportSummary || '-'}</p>
                            </div>
                          </TableCell>
                          <TableCell>{item.protocol || '-'}</TableCell>
                          <TableCell>
                            <div>
                              <p>{item.listen || '0.0.0.0'}:{item.port || '-'}</p>
                              <p className="text-xs text-default-500">ID {item.remoteInboundId}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p>{item.clientCount || 0}</p>
                              <p className="text-xs text-default-500">在线 {item.onlineClientCount || 0}</p>
                            </div>
                          </TableCell>
                          <TableCell>{formatFlow(item.allTime)}</TableCell>
                          <TableCell>
                            <Chip size="sm" color={statusChip.color} variant="flat">{statusChip.text}</Chip>
                          </TableCell>
                          <TableCell>{formatDate(item.lastSyncAt)}</TableCell>
                        </TableRow>
                      );
                    }}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="border border-divider/80">
            <CardHeader className="flex flex-col items-start gap-2">
              <h2 className="text-lg font-semibold">已同步客户端</h2>
              <p className="text-sm text-default-500">
                第一阶段只保存纳管所需的脱敏元数据和流量统计，不向前端返回远端客户端的 UUID、密码等业务凭据。
              </p>
            </CardHeader>
            <CardBody>
              {!detail || detail.clients.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  当前没有已同步的客户端数据。
                </div>
              ) : (
                <div className="overflow-x-auto -mx-3 px-3">
                <Table removeWrapper aria-label="x-ui client snapshots">
                  <TableHeader>
                    <TableColumn>客户端</TableColumn>
                    <TableColumn>所属入站</TableColumn>
                    <TableColumn>在线</TableColumn>
                    <TableColumn>累计流量</TableColumn>
                    <TableColumn>到期</TableColumn>
                    <TableColumn>状态</TableColumn>
                  </TableHeader>
                  <TableBody items={detail.clients} emptyContent="暂无客户端">
                    {(item) => {
                      const inbound = inboundMap.get(item.remoteInboundId);
                      const statusChip = getSnapshotStatusChip(item.status, item.enable);
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="min-w-[200px]">
                              <p className="font-medium">{item.email || item.remoteClientKey}</p>
                              <p className="text-xs text-default-500">
                                {item.comment || '无备注'}{item.subId ? ` · ${item.subId}` : ''}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>{inbound?.remark || inbound?.tag || `Inbound #${item.remoteInboundId}`}</TableCell>
                          <TableCell>
                            <Chip size="sm" color={item.online === 1 ? 'success' : 'default'} variant="flat">
                              {item.online === 1 ? '在线' : '离线'}
                            </Chip>
                            <p className="mt-1 text-xs text-default-500">{formatDate(item.lastOnlineAt)}</p>
                          </TableCell>
                          <TableCell>{formatFlow(item.allTime)}</TableCell>
                          <TableCell>{formatDate(item.expiryTime)}</TableCell>
                          <TableCell>
                            <Chip size="sm" color={statusChip.color} variant="flat">{statusChip.text}</Chip>
                          </TableCell>
                        </TableRow>
                      );
                    }}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal isOpen={isFormOpen} onOpenChange={(open) => !open && onFormClose()} size="4xl" scrollBehavior="inside" isDismissable={!submitLoading}>
        <ModalContent>
          <ModalHeader>{isEdit ? '编辑 X-UI 实例' : '新增 X-UI 实例'}</ModalHeader>
          <ModalBody>
            <div className="rounded-3xl border border-primary/20 bg-primary-50/60 p-4 text-sm text-primary-700">
              <p className="font-medium">接入说明</p>
              <p className="mt-2">
                可以直接粘贴完整登录地址，例如 <code>http://host/random/panel/</code>。后端会优先从完整地址里解析真实 Base Path，不再要求手工把 <code>/panel/</code> 改写成根路径。
              </p>
              <p className="mt-2">
                如果远端是旧版 x-ui 且启用了 Secret Token，请把 Secret Token 一并录入。Flux 只在服务端保存加密后的凭据，列表与详情接口不会回传明文。
              </p>
            </div>

            <p className="text-xs font-medium uppercase tracking-widest text-default-400">绑定资产</p>
            <Select
              label="绑定服务器资产"
              items={assetOptions}
              selectedKeys={[form.assetId ? form.assetId.toString() : '__none__']}
              onSelectionChange={(keys) => {
                const selectedKey = Array.from(keys)[0] as string;
                setForm((prev) => ({
                  ...prev,
                  assetId: selectedKey && selectedKey !== '__none__' ? Number(selectedKey) : null
                }));
              }}
              description="选择资产后实例名称将自动填充。资产页可统一汇总该 VPS 的 X-UI、协议和转发。"
            >
              {(item) => (
                <SelectItem key={item.key} description={item.description}>
                  {item.label}
                </SelectItem>
              )}
            </Select>

            <p className="mt-2 text-xs font-medium uppercase tracking-widest text-default-400">实例信息</p>
            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="面板类型"
                selectedKeys={[form.provider]}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;
                  if (value) setForm((prev) => ({ ...prev, provider: value }));
                }}
              >
                {PROVIDER_OPTIONS.map((item) => (
                  <SelectItem key={item.key} description={item.description}>
                    {item.label}
                  </SelectItem>
                ))}
              </Select>
              <Input
                label="实例名称"
                placeholder={form.assetId ? '已从资产自动填充' : '例如 HK-3X-01'}
                value={form.name}
                onValueChange={(value) => { setForm((prev) => ({ ...prev, name: value })); setNameAutoFilled(false); }}
                isInvalid={!!errors.name}
                errorMessage={errors.name}
                isRequired
                description={nameAutoFilled ? '已从绑定资产自动填充，可手动修改' : undefined}
              />
              <Input
                label="实例地址"
                placeholder="可直接粘贴完整登录地址，例如 http://host/random/panel/"
                value={form.baseUrl}
                onValueChange={(value) => setForm((prev) => ({ ...prev, baseUrl: value }))}
                isInvalid={!!errors.baseUrl}
                errorMessage={errors.baseUrl}
                isRequired
              />
            </div>

            <p className="mt-2 text-xs font-medium uppercase tracking-widest text-default-400">登录凭据</p>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="登录用户名"
                placeholder="建议专门给 Flux 的同步账号"
                value={form.username}
                onValueChange={(value) => setForm((prev) => ({ ...prev, username: value }))}
                isInvalid={!!errors.username}
                errorMessage={errors.username}
                isRequired
              />
              <Input
                label={isEdit ? '登录密码（留空则保持不变）' : '登录密码'}
                placeholder={isEdit ? '不改密码可留空' : '请输入登录密码'}
                type="password"
                value={form.password}
                onValueChange={(value) => setForm((prev) => ({ ...prev, password: value }))}
                isInvalid={!!errors.password}
                errorMessage={errors.password}
                isRequired={!isEdit}
              />
              <Input
                label={isEdit ? 'Secret Token（留空则保持不变）' : 'Secret Token（可选）'}
                placeholder="仅旧版 x-ui 启用了 Secret Token 时填写"
                type="password"
                value={form.loginSecret}
                onValueChange={(value) => setForm((prev) => ({ ...prev, loginSecret: value }))}
              />
              <Input
                label="Web Base Path"
                placeholder="可留空；若手填，示例为 / 或 /random/"
                value={form.webBasePath}
                onValueChange={(value) => setForm((prev) => ({ ...prev, webBasePath: value }))}
              />
            </div>

            <p className="mt-2 text-xs font-medium uppercase tracking-widest text-default-400">同步设置</p>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="同步间隔（分钟）"
                type="number"
                value={form.syncIntervalMinutes}
                onValueChange={(value) => setForm((prev) => ({ ...prev, syncIntervalMinutes: value }))}
                isInvalid={!!errors.syncIntervalMinutes}
                errorMessage={errors.syncIntervalMinutes}
              />
            </div>

            <Select
              label="管理模式"
              selectedKeys={[form.managementMode]}
              onSelectionChange={(keys) => setForm((prev) => ({ ...prev, managementMode: Array.from(keys)[0] as string }))}
            >
              {MANAGEMENT_MODES.map((item) => (
                <SelectItem key={item.key} description={item.description}>
                  {item.label}
                </SelectItem>
              ))}
            </Select>

            <div className="grid gap-4 md:grid-cols-2">
              <Switch
                isSelected={form.syncEnabled}
                onValueChange={(value) => setForm((prev) => ({ ...prev, syncEnabled: value }))}
              >
                开启自动同步
              </Switch>
              <Switch
                isSelected={form.allowInsecureTls}
                onValueChange={(value) => setForm((prev) => ({ ...prev, allowInsecureTls: value }))}
              >
                允许跳过 TLS 证书校验
              </Switch>
            </div>

            <Textarea
              label="备注"
              placeholder="记录该实例用途、部署区域、纳管范围或与 VPS / 探针的绑定说明"
              value={form.remark}
              onValueChange={(value) => setForm((prev) => ({ ...prev, remark: value }))}
              minRows={3}
            />

            <div className="rounded-3xl border border-default-200 bg-default-50/80 p-4 text-sm text-default-600">
              <p className="font-medium text-default-700">安全提示</p>
              <p className="mt-2">
                建议为每台 x-ui 使用专门的同步账号，不要复用日常管理账号。若远端登录启用了 2FA，Flux 会拒绝使用该账号做程序化同步。
              </p>
              <p className="mt-2">
                路径兼容说明：<code>/panel/api/inbounds/list</code>、<code>/panel/api/inbounds/</code> 与旧版 <code>/xui/API/inbounds/</code> 都会由后端自动探测，不再要求你手工切换兼容模式。
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onFormClose}>取消</Button>
            <Button color="primary" isLoading={submitLoading} onPress={handleSubmit} isDisabled={!(canCreateXui || canUpdateXui)}>
              {isEdit ? '保存修改' : '创建实例'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isDeleteOpen} onOpenChange={(open) => !open && onDeleteClose()}>
        <ModalContent>
          <ModalHeader>删除 X-UI 实例</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-600">
              确认删除 <span className="font-semibold">{instanceToDelete?.name}</span> 吗？该实例的同步快照、同步日志和流量事件记录也会一并删除。
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onDeleteClose}>取消</Button>
            <Button
              color="danger"
              isLoading={actionLoadingId === instanceToDelete?.id}
              onPress={handleDelete}
              isDisabled={!canDeleteXui}
            >
              确认删除
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
