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

import {
  XuiInboundSnapshot,
  XuiInstance,
  XuiInstanceDetail,
  createXuiInstance,
  deleteXuiInstance,
  getXuiDetail,
  getXuiList,
  syncXuiInstance,
  testXuiInstance,
  updateXuiInstance
} from '@/api';
import { isAdmin } from '@/utils/auth';

interface XuiInstanceForm {
  id?: number;
  name: string;
  baseUrl: string;
  webBasePath: string;
  username: string;
  password: string;
  hostLabel: string;
  managementMode: string;
  syncEnabled: boolean;
  syncIntervalMinutes: string;
  allowInsecureTls: boolean;
  remark: string;
}

const MANAGEMENT_MODES = [
  { key: 'observe', label: 'Observe', description: '只读观察，远端改动通过轮询同步进 Flux。' },
  { key: 'flux_managed', label: 'Flux Managed', description: '后续用于以 Flux 作为主控写回远端。' },
];

const emptyForm = (): XuiInstanceForm => ({
  name: '',
  baseUrl: '',
  webBasePath: '/',
  username: '',
  password: '',
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

export default function XuiPage() {
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [instances, setInstances] = useState<XuiInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(null);
  const [detail, setDetail] = useState<XuiInstanceDetail | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [isEdit, setIsEdit] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<XuiInstance | null>(null);
  const [form, setForm] = useState<XuiInstanceForm>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const admin = isAdmin();

  useEffect(() => {
    void loadInstances();
  }, []);

  useEffect(() => {
    if (!selectedInstanceId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedInstanceId);
  }, [selectedInstanceId]);

  const inboundMap = useMemo(() => {
    const map = new Map<number, XuiInboundSnapshot>();
    detail?.inbounds.forEach((inbound) => map.set(inbound.remoteInboundId, inbound));
    return map;
  }, [detail]);

  const summary = useMemo(() => {
    return {
      totalInstances: instances.length,
      autoSyncInstances: instances.filter((item) => item.syncEnabled === 1).length,
      totalInbounds: instances.reduce((sum, item) => sum + (item.inboundCount || 0), 0),
      totalClients: instances.reduce((sum, item) => sum + (item.clientCount || 0), 0),
    };
  }, [instances]);

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
    setIsEdit(false);
    setErrors({});
    setForm(emptyForm());
    onFormOpen();
  };

  const openEditModal = (instance: XuiInstance) => {
    setIsEdit(true);
    setErrors({});
    setForm({
      id: instance.id,
      name: instance.name,
      baseUrl: instance.baseUrl,
      webBasePath: instance.webBasePath || '/',
      username: instance.username,
      password: '',
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
    if (!validateForm()) return;
    setSubmitLoading(true);
    try {
      const payload = {
        ...form,
        syncEnabled: form.syncEnabled ? 1 : 0,
        syncIntervalMinutes: Number(form.syncIntervalMinutes),
        allowInsecureTls: form.allowInsecureTls ? 1 : 0,
      };
      const response = isEdit
        ? await updateXuiInstance(payload)
        : await createXuiInstance(payload);

      if (response.code !== 0) {
        toast.error(response.msg || (isEdit ? '更新失败' : '创建失败'));
        return;
      }
      toast.success(isEdit ? 'x-ui 实例已更新' : 'x-ui 实例已创建');
      onFormClose();
      await loadInstances();
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
      await loadInstances();
    } catch (error) {
      toast.error('删除 x-ui 实例失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleTest = async (instance: XuiInstance) => {
    setActionLoadingId(instance.id);
    try {
      const response = await testXuiInstance(instance.id);
      if (response.code !== 0) {
        toast.error(response.msg || '连接测试失败');
        return;
      }
      toast.success(`${instance.name} 连接成功，读取到 ${response.data.remoteInboundCount} 个入站`);
      await loadInstances();
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
    setActionLoadingId(instance.id);
    try {
      const response = await syncXuiInstance(instance.id);
      if (response.code !== 0) {
        toast.error(response.msg || '同步失败');
        return;
      }
      toast.success(response.data?.message || '同步完成');
      await loadInstances();
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
    setInstanceToDelete(instance);
    onDeleteOpen();
  };

  if (!admin) {
    return (
      <Card className="border border-danger/20 bg-danger-50/60">
        <CardBody className="p-6">
          <h1 className="text-xl font-semibold text-danger">仅管理员可访问 X-UI 管理</h1>
          <p className="mt-2 text-sm text-danger-700">
            该模块会保存外部面板的接入凭据与同步状态，仅允许管理员操作。
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
          <p className="mt-1 text-sm text-default-500">
            在 Flux 中登记 x-ui / 3x-ui 实例，执行连接测试、只读同步和后续统一纳管。当前版本只保存脱敏快照，不向前端暴露明文密码。
          </p>
        </div>
        <Button color="primary" onPress={openCreateModal}>
          新增 X-UI 实例
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border border-divider/80">
          <CardBody className="gap-2 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-default-400">Instances</p>
            <p className="text-3xl font-semibold">{summary.totalInstances}</p>
            <p className="text-sm text-default-500">已登记的 x-ui 面板实例数</p>
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-4">
          {instances.length === 0 ? (
            <Card className="border border-dashed border-divider/80">
              <CardBody className="p-6 text-sm text-default-500">
                还没有登记任何 x-ui 实例。先新增一个测试实例，再执行连接测试和同步。
              </CardBody>
            </Card>
          ) : (
            instances.map((instance) => {
              const syncChip = getStatusChip(instance.lastSyncStatus);
              const testChip = getStatusChip(instance.lastTestStatus);
              const selected = instance.id === selectedInstanceId;
              const callbackUrl = `${window.location.origin}${instance.trafficCallbackPath}`;

              return (
                <Card
                  key={instance.id}
                  className={`border transition-all ${selected ? 'border-primary shadow-lg shadow-primary/10' : 'border-divider/80'}`}
                >
                  <CardHeader className="flex flex-col items-start gap-3">
                    <div className="flex w-full items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setSelectedInstanceId(instance.id)}
                          className="text-left"
                        >
                          <h2 className="truncate text-lg font-semibold">{instance.name}</h2>
                        </button>
                        <p className="truncate text-sm text-default-500">{instance.baseUrl}{instance.webBasePath}</p>
                      </div>
                      <Chip color={instance.syncEnabled === 1 ? 'success' : 'default'} variant="flat">
                        {instance.syncEnabled === 1 ? '自动同步' : '手动同步'}
                      </Chip>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Chip size="sm" variant="flat">{instance.managementMode}</Chip>
                      <Chip size="sm" variant="flat">{instance.username}</Chip>
                      {instance.hostLabel ? <Chip size="sm" variant="flat">{instance.hostLabel}</Chip> : null}
                    </div>
                  </CardHeader>
                  <CardBody className="space-y-4 pt-0">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl bg-default-100/70 p-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-default-400">入站</p>
                        <p className="mt-1 text-xl font-semibold">{instance.inboundCount}</p>
                      </div>
                      <div className="rounded-2xl bg-default-100/70 p-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-default-400">客户端</p>
                        <p className="mt-1 text-xl font-semibold">{instance.clientCount}</p>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-default-500">测试状态</span>
                        <Chip size="sm" color={testChip.color} variant="flat">{testChip.text}</Chip>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-default-500">同步状态</span>
                        <Chip size="sm" color={syncChip.color} variant="flat">{syncChip.text}</Chip>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-default-500">凭据状态</span>
                        <Chip size="sm" color={instance.passwordConfigured ? 'success' : 'danger'} variant="flat">
                          {instance.passwordConfigured ? '已配置' : '缺失'}
                        </Chip>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs text-default-500">
                      <p>同步间隔：{instance.syncIntervalMinutes} 分钟</p>
                      <p>最近测试：{formatDate(instance.lastTestAt)}</p>
                      <p>最近同步：{formatDate(instance.lastSyncAt)}</p>
                      <p>最近流量上报：{formatDate(instance.lastTrafficPushAt)}</p>
                      <p className="break-all">上报地址：{callbackUrl}</p>
                    </div>

                    {(instance.lastSyncError || instance.lastTestError) ? (
                      <div className="rounded-2xl border border-warning/20 bg-warning-50/60 p-3 text-xs text-warning-700">
                        {instance.lastSyncError || instance.lastTestError}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="flat"
                        color="primary"
                        onPress={() => setSelectedInstanceId(instance.id)}
                      >
                        查看快照
                      </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        color="secondary"
                        isLoading={actionLoadingId === instance.id}
                        onPress={() => handleTest(instance)}
                      >
                        测试连接
                      </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        color="success"
                        isLoading={actionLoadingId === instance.id}
                        onPress={() => handleSync(instance)}
                      >
                        立即同步
                      </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => openEditModal(instance)}
                      >
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        color="danger"
                        onPress={() => openDeleteModal(instance)}
                      >
                        删除
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              );
            })
          )}
        </div>

        <div className="space-y-6">
          <Card className="border border-divider/80">
            <CardHeader className="flex flex-col items-start gap-2">
              <div className="flex w-full items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">已同步入站节点</h2>
                  <p className="text-sm text-default-500">
                    当前展示 Flux 已保存的远端快照。后续写回和分类管理都将基于这层数据。
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
                  <TableBody items={detail.inbounds}>
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
              )}
            </CardBody>
          </Card>

          <Card className="border border-divider/80">
            <CardHeader className="flex flex-col items-start gap-2">
              <h2 className="text-lg font-semibold">已同步客户端</h2>
              <p className="text-sm text-default-500">
                第一阶段只保存管理所需的脱敏元数据和流量统计，不保存远端客户端的 UUID / 密码等业务凭据。
              </p>
            </CardHeader>
            <CardBody>
              {!detail || detail.clients.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-divider/80 p-6 text-sm text-default-500">
                  当前没有已同步的客户端数据。
                </div>
              ) : (
                <Table removeWrapper aria-label="x-ui client snapshots">
                  <TableHeader>
                    <TableColumn>客户端</TableColumn>
                    <TableColumn>所属入站</TableColumn>
                    <TableColumn>在线</TableColumn>
                    <TableColumn>累计流量</TableColumn>
                    <TableColumn>到期</TableColumn>
                    <TableColumn>状态</TableColumn>
                  </TableHeader>
                  <TableBody items={detail.clients}>
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
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal isOpen={isFormOpen} onOpenChange={(open) => !open && onFormClose()} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{isEdit ? '编辑 X-UI 实例' : '新增 X-UI 实例'}</ModalHeader>
          <ModalBody>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="实例名称"
                placeholder="例如 HK-3X-01"
                value={form.name}
                onValueChange={(value) => setForm((prev) => ({ ...prev, name: value }))}
                isInvalid={!!errors.name}
                errorMessage={errors.name}
                isRequired
              />
              <Input
                label="实例地址"
                placeholder="https://panel.example.com"
                value={form.baseUrl}
                onValueChange={(value) => setForm((prev) => ({ ...prev, baseUrl: value }))}
                isInvalid={!!errors.baseUrl}
                errorMessage={errors.baseUrl}
                isRequired
              />
              <Input
                label="Web Base Path"
                placeholder="/"
                value={form.webBasePath}
                onValueChange={(value) => setForm((prev) => ({ ...prev, webBasePath: value }))}
              />
              <Input
                label="登录用户名"
                placeholder="建议专门给 Flux 的服务账号"
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
                label="主机标识"
                placeholder="例如 HK-VPS-01"
                value={form.hostLabel}
                onValueChange={(value) => setForm((prev) => ({ ...prev, hostLabel: value }))}
              />
              <Select
                label="管理模式"
                selectedKeys={[form.managementMode]}
                onSelectionChange={(keys) => setForm((prev) => ({ ...prev, managementMode: Array.from(keys)[0] as string }))}
              >
                {MANAGEMENT_MODES.map((item) => (
                  <SelectItem key={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </Select>
              <Input
                label="同步间隔（分钟）"
                type="number"
                value={form.syncIntervalMinutes}
                onValueChange={(value) => setForm((prev) => ({ ...prev, syncIntervalMinutes: value }))}
                isInvalid={!!errors.syncIntervalMinutes}
                errorMessage={errors.syncIntervalMinutes}
              />
            </div>

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
              placeholder="记录该实例的用途、部署区域或接入说明"
              value={form.remark}
              onValueChange={(value) => setForm((prev) => ({ ...prev, remark: value }))}
              minRows={3}
            />

            <div className="rounded-2xl border border-primary/20 bg-primary-50/60 p-4 text-sm text-primary-700">
              <p className="font-medium">安全提示</p>
              <p className="mt-1">
                Flux 只在服务端保存加密后的 x-ui 登录密码，实例列表和详情接口不会返回明文密码。建议为每台 x-ui 使用专门的同步账号，并关闭该账号的交互式 2FA。
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onFormClose}>取消</Button>
            <Button color="primary" isLoading={submitLoading} onPress={handleSubmit}>
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
            >
              确认删除
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
