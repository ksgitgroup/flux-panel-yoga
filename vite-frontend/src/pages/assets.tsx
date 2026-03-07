import { useEffect, useMemo, useState } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input, Textarea } from "@heroui/input";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure
} from "@heroui/modal";
import { Spinner } from "@heroui/spinner";
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
  XuiInstance,
  createAsset,
  deleteAsset,
  getAssetDetail,
  getAssetList,
  updateAsset
} from '@/api';
import { isAdmin } from '@/utils/auth';

interface AssetForm {
  id?: number;
  name: string;
  label: string;
  primaryIp: string;
  environment: string;
  provider: string;
  region: string;
  remark: string;
}

const emptyForm = (): AssetForm => ({
  name: '',
  label: '',
  primaryIp: '',
  environment: '',
  provider: '',
  region: '',
  remark: '',
});

const normalizeKeyword = (value?: string | null) => (value || '').trim().toLowerCase();

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

const buildInstanceAddress = (instance: Pick<XuiInstance, 'baseUrl' | 'webBasePath'>) =>
  `${instance.baseUrl}${instance.webBasePath || '/'}`;

export default function AssetsPage() {
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
    void loadAssets();
  }, []);

  useEffect(() => {
    if (!selectedAssetId) {
      setDetail(null);
      return;
    }
    void loadAssetDetail(selectedAssetId);
  }, [selectedAssetId]);

  const summary = useMemo(() => ({
    totalAssets: assets.length,
    totalXuiInstances: assets.reduce((sum, item) => sum + (item.totalXuiInstances || 0), 0),
    totalProtocols: assets.reduce((sum, item) => sum + (item.totalProtocols || 0), 0),
    totalForwards: assets.reduce((sum, item) => sum + (item.totalForwards || 0), 0),
    totalClients: assets.reduce((sum, item) => sum + (item.totalClients || 0), 0),
  }), [assets]);

  const filteredAssets = useMemo(() => {
    const keyword = normalizeKeyword(searchKeyword);
    if (!keyword) {
      return assets;
    }
    return assets.filter((item) => {
      const haystacks = [
        item.name,
        item.label,
        item.primaryIp,
        item.environment,
        item.provider,
        item.region,
        item.remark,
      ];
      return haystacks.some((value) => normalizeKeyword(value).includes(keyword));
    });
  }, [assets, searchKeyword]);

  const selectedAsset = useMemo(
    () => assets.find((item) => item.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );

  const loadAssets = async () => {
    setLoading(true);
    try {
      const response = await getAssetList();
      if (response.code !== 0) {
        toast.error(response.msg || '加载资产列表失败');
        return;
      }
      const list = response.data || [];
      setAssets(list);
      setSelectedAssetId((current) => {
        if (current && list.some((item) => item.id === current)) {
          return current;
        }
        return list.length ? list[0].id : null;
      });
    } catch (error) {
      toast.error('加载资产列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadAssetDetail = async (assetId: number) => {
    setDetailLoading(true);
    try {
      const response = await getAssetDetail(assetId);
      if (response.code !== 0) {
        toast.error(response.msg || '加载资产详情失败');
        return;
      }
      setDetail(response.data || null);
    } catch (error) {
      toast.error('加载资产详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const openCreateModal = () => {
    setIsEdit(false);
    setErrors({});
    setForm(emptyForm());
    onFormOpen();
  };

  const openEditModal = (asset: AssetHost) => {
    setIsEdit(true);
    setErrors({});
    setForm({
      id: asset.id,
      name: asset.name,
      label: asset.label || '',
      primaryIp: asset.primaryIp || '',
      environment: asset.environment || '',
      provider: asset.provider || '',
      region: asset.region || '',
      remark: asset.remark || '',
    });
    onFormOpen();
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = '资产名称不能为空';
    if (form.label.trim().length > 120) nextErrors.label = '资产标识不能超过 120 个字符';
    if (form.primaryIp.trim().length > 128) nextErrors.primaryIp = '主 IP / 域名不能超过 128 个字符';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSubmitLoading(true);
    try {
      const payload = {
        ...(isEdit ? { id: form.id } : {}),
        name: form.name.trim(),
        label: form.label.trim(),
        primaryIp: form.primaryIp.trim(),
        environment: form.environment.trim(),
        provider: form.provider.trim(),
        region: form.region.trim(),
        remark: form.remark.trim(),
      };
      const response = isEdit
        ? await updateAsset(payload)
        : await createAsset(payload);
      if (response.code !== 0) {
        toast.error(response.msg || (isEdit ? '更新资产失败' : '创建资产失败'));
        return;
      }
      toast.success(isEdit ? '资产已更新' : '资产已创建');
      onFormClose();
      await loadAssets();
      const targetId = response.data?.id || form.id;
      if (targetId) {
        setSelectedAssetId(targetId);
      }
    } catch (error) {
      toast.error(isEdit ? '更新资产失败' : '创建资产失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const openDeleteModal = (asset: AssetHost) => {
    setAssetToDelete(asset);
    onDeleteOpen();
  };

  const handleDelete = async () => {
    if (!assetToDelete) return;
    setActionLoadingId(assetToDelete.id);
    try {
      const response = await deleteAsset(assetToDelete.id);
      if (response.code !== 0) {
        toast.error(response.msg || '删除资产失败');
        return;
      }
      toast.success('资产已删除');
      onDeleteClose();
      setAssetToDelete(null);
      if (selectedAssetId === assetToDelete.id) {
        setSelectedAssetId(null);
      }
      await loadAssets();
    } catch (error) {
      toast.error('删除资产失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  if (!admin) {
    return (
      <Card className="border border-danger/20 bg-danger-50/60">
        <CardBody className="p-6">
          <h1 className="text-xl font-semibold text-danger">仅管理员可访问服务器资产</h1>
          <p className="mt-2 text-sm text-danger-700">
            资产层会把 X-UI、转发、探针和节点监控逐步归一到同一台 VPS 记录下，仅允许管理员维护。
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
          <h1 className="text-2xl font-bold">服务器资产</h1>
          <p className="mt-1 max-w-3xl text-sm text-default-500">
            这里是新的资产主视角。每台 VPS 先落成一条资产记录，再把 X-UI 实例、协议目录、转发关系逐步挂载过来，后续再叠加探针与节点监控，形成真正的多层整合面。
          </p>
        </div>
        <Button color="primary" onPress={openCreateModal}>
          新增资产
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="border border-divider/80">
          <CardBody className="gap-2 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-default-400">Assets</p>
            <p className="text-3xl font-semibold">{summary.totalAssets}</p>
            <p className="text-sm text-default-500">已登记的服务器资产</p>
          </CardBody>
        </Card>
        <Card className="border border-divider/80">
          <CardBody className="gap-2 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-default-400">X-UI</p>
            <p className="text-3xl font-semibold">{summary.totalXuiInstances}</p>
            <p className="text-sm text-default-500">挂载到资产上的面板实例</p>
          </CardBody>
        </Card>
        <Card className="border border-divider/80">
          <CardBody className="gap-2 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-default-400">Protocols</p>
            <p className="text-3xl font-semibold">{summary.totalProtocols}</p>
            <p className="text-sm text-default-500">已识别到的协议种类总数</p>
          </CardBody>
        </Card>
        <Card className="border border-divider/80">
          <CardBody className="gap-2 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-default-400">Forwards</p>
            <p className="text-3xl font-semibold">{summary.totalForwards}</p>
            <p className="text-sm text-default-500">已绑定 X-UI 远端的转发数</p>
          </CardBody>
        </Card>
        <Card className="border border-divider/80">
          <CardBody className="gap-2 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-default-400">Clients</p>
            <p className="text-3xl font-semibold">{summary.totalClients}</p>
            <p className="text-sm text-default-500">当前已同步的客户端总量</p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card className="border border-divider/80">
          <CardHeader className="flex flex-col items-start gap-3">
            <div className="w-full">
              <h2 className="text-lg font-semibold">资产目录</h2>
              <p className="text-sm text-default-500">
                先在资产层看全局，再进入 X-UI 或转发的子模块做细节操作，避免数据视角被拆散。
              </p>
            </div>
            <Input
              value={searchKeyword}
              onValueChange={setSearchKeyword}
              placeholder="按名称、标识、IP、区域或供应商筛选"
            />
          </CardHeader>
          <CardBody className="space-y-3">
            {filteredAssets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                {assets.length === 0 ? '还没有任何服务器资产记录。先创建一个资产。' : '没有匹配的资产。'}
              </div>
            ) : (
              filteredAssets.map((asset) => {
                const selected = asset.id === selectedAssetId;
                return (
                  <button
                    type="button"
                    key={asset.id}
                    onClick={() => setSelectedAssetId(asset.id)}
                    className={`w-full rounded-3xl border p-4 text-left transition-all ${
                      selected
                        ? 'border-primary bg-primary-50/70 shadow-lg shadow-primary/10'
                        : 'border-divider/80 bg-content1 hover:border-primary/40 hover:bg-default-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-base font-semibold">{asset.name}</p>
                          {asset.label ? <Chip size="sm" variant="flat">{asset.label}</Chip> : null}
                        </div>
                        <p className="mt-1 truncate text-xs text-default-500">
                          {asset.primaryIp || '未记录主公网 IP'}{asset.environment ? ` · ${asset.environment}` : ''}
                        </p>
                      </div>
                      <Chip size="sm" color={selected ? 'primary' : 'default'} variant="flat">
                        {selected ? '当前资产' : '查看'}
                      </Chip>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {asset.provider ? <Chip size="sm" variant="flat">{asset.provider}</Chip> : null}
                      {asset.region ? <Chip size="sm" variant="flat">{asset.region}</Chip> : null}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-default-100/80 p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-default-400">X-UI</p>
                        <p className="mt-1 text-lg font-semibold">{asset.totalXuiInstances || 0}</p>
                      </div>
                      <div className="rounded-2xl bg-default-100/80 p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-default-400">协议</p>
                        <p className="mt-1 text-lg font-semibold">{asset.totalProtocols || 0}</p>
                      </div>
                      <div className="rounded-2xl bg-default-100/80 p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-default-400">转发</p>
                        <p className="mt-1 text-lg font-semibold">{asset.totalForwards || 0}</p>
                      </div>
                      <div className="rounded-2xl bg-default-100/80 p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-default-400">在线客户端</p>
                        <p className="mt-1 text-lg font-semibold">{asset.onlineClients || 0}</p>
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
              {!selectedAsset ? (
                <div>
                  <h2 className="text-lg font-semibold">资产总览</h2>
                  <p className="text-sm text-default-500">请选择一个资产查看整合后的 X-UI、协议和转发关系。</p>
                </div>
              ) : (
                <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold">{selectedAsset.name}</h2>
                      {selectedAsset.label ? <Chip size="sm" variant="flat">{selectedAsset.label}</Chip> : null}
                      {selectedAsset.environment ? <Chip size="sm" color="primary" variant="flat">{selectedAsset.environment}</Chip> : null}
                    </div>
                    <p className="mt-1 break-all text-sm text-default-500">{selectedAsset.primaryIp || '未记录主公网 IP'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="flat" onPress={() => openEditModal(selectedAsset)}>
                      编辑资产
                    </Button>
                    <Button size="sm" variant="flat" color="danger" onPress={() => openDeleteModal(selectedAsset)}>
                      删除资产
                    </Button>
                  </div>
                </div>
              )}
            </CardHeader>
            <CardBody>
              {!selectedAsset ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  资产层是后续整合探针、转发、X-UI 和节点监控的第一层。先从左侧选择一台服务器。
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-default-400">资产信息</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <p><span className="text-default-500">名称：</span>{selectedAsset.name}</p>
                        <p><span className="text-default-500">标识：</span>{selectedAsset.label || '-'}</p>
                        <p><span className="text-default-500">主公网 IP：</span>{selectedAsset.primaryIp || '-'}</p>
                        <p><span className="text-default-500">环境：</span>{selectedAsset.environment || '-'}</p>
                        <p><span className="text-default-500">供应商 / 区域：</span>{selectedAsset.provider || '-'} / {selectedAsset.region || '-'}</p>
                      </div>
                    </div>
                    <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-default-400">整合摘要</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <p><span className="text-default-500">X-UI 实例：</span>{selectedAsset.totalXuiInstances || 0}</p>
                        <p><span className="text-default-500">协议种类：</span>{selectedAsset.totalProtocols || 0}</p>
                        <p><span className="text-default-500">联动转发：</span>{selectedAsset.totalForwards || 0}</p>
                        <p><span className="text-default-500">最近观察到：</span>{formatDate(selectedAsset.lastObservedAt)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-divider/80 bg-content1 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-default-400">板块边界</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl bg-default-50/80 p-3">
                        <p className="text-sm font-medium">服务器层</p>
                        <p className="mt-1 text-xs text-default-500">资产基础属性、供应商、区域、环境、主 IP，以及未来的探针归属。</p>
                      </div>
                      <div className="rounded-2xl bg-default-50/80 p-3">
                        <p className="text-sm font-medium">X-UI 面板层</p>
                        <p className="mt-1 text-xs text-default-500">每台服务器下的面板实例、同步状态、面板接入方式、回调入口。</p>
                      </div>
                      <div className="rounded-2xl bg-default-50/80 p-3">
                        <p className="text-sm font-medium">协议与转发层</p>
                        <p className="mt-1 text-xs text-default-500">按协议聚合的入站目录，以及由这些入站直接驱动的转发目标关系。</p>
                      </div>
                    </div>
                  </div>

                  {selectedAsset.remark ? (
                    <div className="rounded-3xl border border-divider/80 bg-default-50/80 p-4 text-sm text-default-700">
                      <p className="font-medium">备注</p>
                      <p className="mt-2">{selectedAsset.remark}</p>
                    </div>
                  ) : null}
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="border border-divider/80">
            <CardHeader className="flex flex-col items-start gap-2">
              <div className="flex w-full items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">挂载的 X-UI 实例</h2>
                  <p className="text-sm text-default-500">
                    这部分把资产与 X-UI 面板真正绑定起来，不需要再进入单独实例页才知道这台服务器下面有哪些面板。
                  </p>
                </div>
                {detailLoading ? <Spinner size="sm" /> : null}
              </div>
            </CardHeader>
            <CardBody>
              {!detail || detail.xuiInstances.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  当前资产还没有绑定任何 X-UI 实例。
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {detail.xuiInstances.map((instance) => {
                    const syncChip = getStatusChip(instance.lastSyncStatus);
                    const testChip = getStatusChip(instance.lastTestStatus);
                    return (
                      <div key={instance.id} className="rounded-3xl border border-divider/80 bg-default-50/80 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold">{instance.name}</p>
                            <p className="mt-1 break-all text-xs text-default-500">{buildInstanceAddress(instance)}</p>
                          </div>
                          <Chip size="sm" color={instance.syncEnabled === 1 ? 'success' : 'default'} variant="flat">
                            {instance.syncEnabled === 1 ? '自动同步' : '手动同步'}
                          </Chip>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Chip size="sm" color={testChip.color} variant="flat">测试 {testChip.text}</Chip>
                          <Chip size="sm" color={syncChip.color} variant="flat">同步 {syncChip.text}</Chip>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div className="rounded-2xl bg-content1 p-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-default-400">入站</p>
                            <p className="mt-1 text-lg font-semibold">{instance.inboundCount || 0}</p>
                          </div>
                          <div className="rounded-2xl bg-content1 p-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-default-400">客户端</p>
                            <p className="mt-1 text-lg font-semibold">{instance.clientCount || 0}</p>
                          </div>
                        </div>
                        <div className="mt-4 space-y-2 text-sm">
                          <p><span className="text-default-500">账号：</span>{instance.username}</p>
                          <p><span className="text-default-500">最近同步：</span>{formatDate(instance.lastSyncAt)}</p>
                          <p><span className="text-default-500">最近上报：</span>{formatDate(instance.lastTrafficPushAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="border border-divider/80">
            <CardHeader className="flex flex-col items-start gap-2">
              <h2 className="text-lg font-semibold">协议目录</h2>
              <p className="text-sm text-default-500">
                资产层按协议收拢所有 X-UI 面板的入站总量、在线数和流量。这是后续联动套餐、分类、探针告警和节点策略的基础目录。
              </p>
            </CardHeader>
            <CardBody>
              {!detail || detail.protocolSummaries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  当前资产还没有协议级快照。
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {detail.protocolSummaries.map((item) => (
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
              <h2 className="text-lg font-semibold">联动转发</h2>
              <p className="text-sm text-default-500">
                这里展示当前资产下已经绑定到 X-UI 节点的转发规则。下一步在转发管理里就可以直接从这些协议节点挑选远端地址。
              </p>
            </CardHeader>
            <CardBody>
              {!detail || detail.forwards.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  当前资产还没有绑定 X-UI 节点的转发配置。
                </div>
              ) : (
                <Table removeWrapper aria-label="asset forward links">
                  <TableHeader>
                    <TableColumn>转发</TableColumn>
                    <TableColumn>隧道</TableColumn>
                    <TableColumn>远端来源</TableColumn>
                    <TableColumn>当前地址</TableColumn>
                    <TableColumn>状态</TableColumn>
                    <TableColumn>最近更新</TableColumn>
                  </TableHeader>
                  <TableBody items={detail.forwards}>
                    {(item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="min-w-[180px]">
                            <p className="font-medium">{item.name}</p>
                            <p className="text-xs text-default-500">{item.remoteSourceType === 'xui' ? 'X-UI 联动' : '手工地址'}</p>
                          </div>
                        </TableCell>
                        <TableCell>{item.tunnelName || '-'}</TableCell>
                        <TableCell>
                          <div className="min-w-[220px]">
                            <p>{item.remoteSourceLabel || '-'}</p>
                            <p className="text-xs text-default-500">{item.remoteSourceProtocol || '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell>{item.remoteAddr}</TableCell>
                        <TableCell>
                          <Chip size="sm" color={item.status === 1 ? 'success' : item.status === 0 ? 'warning' : 'danger'} variant="flat">
                            {item.status === 1 ? '运行中' : item.status === 0 ? '已暂停' : '异常'}
                          </Chip>
                        </TableCell>
                        <TableCell>{formatDate(item.updatedTime || item.createdTime)}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardBody>
          </Card>

          <Card className="border border-divider/80">
            <CardHeader className="flex flex-col items-start gap-2">
              <h2 className="text-lg font-semibold">后续整合位</h2>
              <p className="text-sm text-default-500">
                这块预留给探针与节点监控联动。当前先把资产、X-UI 和转发三层关系稳定下来，再把 Pika / Komari 的探针实例挂到同一资产。
              </p>
            </CardHeader>
            <CardBody>
              <div className="rounded-3xl border border-dashed border-divider/80 p-5 text-sm text-default-500">
                当前版本已经实现：
                资产记录、X-UI 资产绑定、协议汇总、X-UI 节点到转发的联动入口。
                下一阶段建议补：
                探针实例绑定、资产级节点监控聚合、转发与探针告警联动。
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal isOpen={isFormOpen} onOpenChange={(open) => !open && onFormClose()} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{isEdit ? '编辑服务器资产' : '新增服务器资产'}</ModalHeader>
          <ModalBody>
            <div className="rounded-3xl border border-primary/20 bg-primary-50/60 p-4 text-sm text-primary-700">
              <p className="font-medium">实施原则</p>
              <p className="mt-2">
                资产层不直接承接业务配置，它负责把同一台 VPS 上的 X-UI、探针、转发和节点监控都归并到一条记录下，后续各子模块再通过资产 ID 建立关系。
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="资产名称"
                placeholder="例如 HK-VPS-01"
                value={form.name}
                onValueChange={(value) => setForm((prev) => ({ ...prev, name: value }))}
                isInvalid={!!errors.name}
                errorMessage={errors.name}
                isRequired
              />
              <Input
                label="资产标识"
                placeholder="可选，便于跨模块快速识别"
                value={form.label}
                onValueChange={(value) => setForm((prev) => ({ ...prev, label: value }))}
                isInvalid={!!errors.label}
                errorMessage={errors.label}
              />
              <Input
                label="主公网 IP / 域名"
                placeholder="例如 1.2.3.4 或 host.example.com"
                value={form.primaryIp}
                onValueChange={(value) => setForm((prev) => ({ ...prev, primaryIp: value }))}
                isInvalid={!!errors.primaryIp}
                errorMessage={errors.primaryIp}
              />
              <Input
                label="环境"
                placeholder="例如 PROD / DEV / HK"
                value={form.environment}
                onValueChange={(value) => setForm((prev) => ({ ...prev, environment: value }))}
              />
              <Input
                label="供应商"
                placeholder="例如 DMIT / Vultr / Oracle"
                value={form.provider}
                onValueChange={(value) => setForm((prev) => ({ ...prev, provider: value }))}
              />
              <Input
                label="区域"
                placeholder="例如 Hong Kong / Tokyo"
                value={form.region}
                onValueChange={(value) => setForm((prev) => ({ ...prev, region: value }))}
              />
            </div>

            <Textarea
              label="备注"
              placeholder="记录用途、机房、探针部署计划、转发用途等"
              value={form.remark}
              onValueChange={(value) => setForm((prev) => ({ ...prev, remark: value }))}
              minRows={3}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onFormClose}>取消</Button>
            <Button color="primary" isLoading={submitLoading} onPress={handleSubmit}>
              {isEdit ? '保存修改' : '创建资产'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isDeleteOpen} onOpenChange={(open) => !open && onDeleteClose()}>
        <ModalContent>
          <ModalHeader>删除服务器资产</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-600">
              确认删除 <span className="font-semibold">{assetToDelete?.name}</span> 吗？如果该资产下仍挂有 X-UI 实例或被转发引用，后端会拒绝删除。
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onDeleteClose}>取消</Button>
            <Button
              color="danger"
              isLoading={actionLoadingId === assetToDelete?.id}
              onPress={handleDelete}
            >
              确认删除
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
