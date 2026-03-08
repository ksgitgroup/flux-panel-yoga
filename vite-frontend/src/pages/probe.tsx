import { useEffect, useMemo, useState } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Switch } from "@heroui/switch";
import { Spinner } from "@heroui/spinner";
import { Divider } from "@heroui/divider";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure
} from "@heroui/modal";
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

import {
  MonitorInstanceDetail,
  MonitorProviderHighlight,
  MonitorInstance,
  getMonitorDetail,
  getMonitorList,
  createMonitorInstance,
  updateMonitorInstance,
  deleteMonitorInstance,
  testMonitorInstance,
  syncMonitorInstance,
} from '@/api';
import { hasPermission } from '@/utils/auth';

// ===================== Types =====================

interface InstanceForm {
  id?: number;
  name: string;
  type: string;
  baseUrl: string;
  apiKey: string;
  username: string;
  syncEnabled: number;
  syncIntervalMinutes: number;
  allowInsecureTls: number;
  remark: string;
}

const defaultForm: InstanceForm = {
  name: '', type: 'komari', baseUrl: '', apiKey: '', username: '',
  syncEnabled: 1, syncIntervalMinutes: 5, allowInsecureTls: 0, remark: '',
};

// ===================== Helpers =====================

function formatTime(ts?: number | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const SYNC_STATUS_MAP: Record<string, { label: string; color: "success" | "danger" | "default" }> = {
  success: { label: '正常', color: 'success' },
  failed: { label: '失败', color: 'danger' },
  never: { label: '未同步', color: 'default' },
};

const highlightColor = (severity?: string | null): "default" | "primary" | "success" | "warning" | "danger" | "secondary" => {
  switch ((severity || '').toLowerCase()) {
    case 'success':
      return 'success';
    case 'danger':
    case 'error':
    case 'critical':
    case 'high':
      return 'danger';
    case 'warning':
    case 'warn':
    case 'medium':
      return 'warning';
    case 'secondary':
      return 'secondary';
    case 'primary':
    case 'info':
      return 'primary';
    default:
      return 'default';
  }
};

// ===================== Component =====================

export default function ProbePage() {
  const canViewProbe = hasPermission('probe.read');
  const canManageProbe = hasPermission('probe.write');

  const [instances, setInstances] = useState<MonitorInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<MonitorInstanceDetail | null>(null);
  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure();

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [form, setForm] = useState<InstanceForm>({ ...defaultForm });
  const [isEdit, setIsEdit] = useState(false);

  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
  const [deleteTarget, setDeleteTarget] = useState<MonitorInstance | null>(null);

  // ===================== Data Loading =====================

  const loadInstances = async () => {
    setLoading(true);
    try {
      const res = await getMonitorList();
      if (res.code === 0) setInstances(res.data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const loadDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await getMonitorDetail(id);
      if (res.code === 0) {
        setDetail(res.data || null);
      } else {
        toast.error(res.msg || '加载实例详情失败');
      }
    } catch {
      toast.error('加载实例详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => { loadInstances(); }, []);

  // ===================== Actions =====================

  const handleTest = async (id: number) => {
    if (!canManageProbe) {
      toast.error('权限不足，无法测试探针实例');
      return;
    }
    setActionLoading('test-' + id);
    try {
      const res = await testMonitorInstance(id);
      res.code === 0 ? toast.success('连接成功') : toast.error(res.msg || '连接失败');
      loadInstances();
    } catch { toast.error('连接失败'); } finally { setActionLoading(null); }
  };

  const handleSync = async (id: number) => {
    if (!canManageProbe) {
      toast.error('权限不足，无法同步探针实例');
      return;
    }
    setActionLoading('sync-' + id);
    try {
      const res = await syncMonitorInstance(id);
      if (res.code === 0) {
        const s = res.data as any;
        if (s && typeof s.total === 'number') {
          toast.success(
            `同步完成: ${s.total} 节点 (${s.online} 在线, ${s.offline} 离线)` +
            (s.newNodes > 0 ? ` / 新增 ${s.newNodes}` : '') +
            (s.removedNodes > 0 ? ` / 移除 ${s.removedNodes}` : '') +
            (s.newAssets > 0 ? ` / 自动创建 ${s.newAssets} 资产` : ''),
            { duration: 5000 }
          );
        } else {
          toast.success('同步完成');
        }
      } else {
        toast.error(res.msg || '同步失败');
      }
      loadInstances();
    } catch { toast.error('同步失败'); } finally { setActionLoading(null); }
  };

  const handleSave = async () => {
    if (!canManageProbe) {
      toast.error('权限不足，无法保存探针实例');
      return;
    }
    if (!form.name.trim() || !form.baseUrl.trim()) {
      toast.error('请填写实例名称和地址');
      return;
    }
    setActionLoading('save');
    try {
      const payload = { ...form, name: form.name.trim(), baseUrl: form.baseUrl.trim(), apiKey: form.apiKey.trim(), username: form.username.trim(), remark: form.remark.trim() };
      const res = isEdit ? await updateMonitorInstance(payload) : await createMonitorInstance(payload);
      if (res.code === 0) {
        toast.success(isEdit ? '已更新' : '已创建');
        onClose();
        loadInstances();
      } else {
        toast.error(res.msg || '保存失败');
      }
    } catch { toast.error('保存失败'); } finally { setActionLoading(null); }
  };

  const handleDelete = async () => {
    if (!canManageProbe) {
      toast.error('权限不足，无法删除探针实例');
      return;
    }
    if (!deleteTarget) return;
    setActionLoading('delete');
    try {
      const res = await deleteMonitorInstance(deleteTarget.id);
      if (res.code === 0) {
        toast.success('已删除');
        onDeleteClose();
        loadInstances();
      } else { toast.error(res.msg || '删除失败'); }
    } catch { toast.error('删除失败'); } finally { setActionLoading(null); }
  };

  const openCreateModal = () => {
    if (!canManageProbe) {
      toast.error('权限不足，无法新增探针实例');
      return;
    }
    setForm({ ...defaultForm });
    setIsEdit(false);
    onOpen();
  };
  const openEditModal = (inst: MonitorInstance) => {
    if (!canManageProbe) {
      toast.error('权限不足，无法编辑探针实例');
      return;
    }
    setForm({
      id: inst.id, name: inst.name || '', type: inst.type || 'komari', baseUrl: inst.baseUrl || '',
      apiKey: '', username: inst.username || '', syncEnabled: inst.syncEnabled ?? 1, syncIntervalMinutes: inst.syncIntervalMinutes ?? 5,
      allowInsecureTls: inst.allowInsecureTls ?? 0, remark: inst.remark || '',
    });
    setIsEdit(true); onOpen();
  };
  const confirmDelete = (inst: MonitorInstance) => {
    if (!canManageProbe) {
      toast.error('权限不足，无法删除探针实例');
      return;
    }
    setDeleteTarget(inst);
    onDeleteOpen();
  };

  const openDetailModal = (inst: MonitorInstance) => {
    setDetail(null);
    onDetailOpen();
    void loadDetail(inst.id);
  };

  // ===================== Computed =====================

  const summary = useMemo(() => ({
    total: instances.length,
    totalNodes: instances.reduce((s, i) => s + (i.nodeCount || 0), 0),
    onlineNodes: instances.reduce((s, i) => s + (i.onlineNodeCount || 0), 0),
    syncOk: instances.filter(i => i.lastSyncStatus === 'success').length,
    syncFail: instances.filter(i => i.lastSyncStatus === 'failed').length,
  }), [instances]);

  // ===================== Render =====================

  if (!canViewProbe) {
    return (
      <Card shadow="sm">
        <CardBody className="py-10 text-center">
          <p className="text-danger font-semibold">缺少探针查看权限</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header with summary */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Chip size="sm" variant="flat" color="primary">{summary.total} 个实例</Chip>
          <Chip size="sm" variant="flat" color="success">{summary.onlineNodes}/{summary.totalNodes} 节点在线</Chip>
          {summary.syncFail > 0 && <Chip size="sm" variant="flat" color="danger">{summary.syncFail} 同步异常</Chip>}
        </div>
        <div className="flex items-center gap-2">
          <Button as={Link} to="/server-dashboard" size="sm" variant="flat" color="secondary" startContent={
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }>
            服务器看板
          </Button>
          {canManageProbe && (
            <Button color="primary" size="sm" onPress={openCreateModal} startContent={
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }>
              添加探针
            </Button>
          )}
        </div>
      </div>

      {/* Instance cards grid */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : instances.length === 0 ? (
        <Card shadow="sm">
          <CardBody className="py-12 text-center">
            <div className="text-default-300 mb-3">
              <svg className="h-12 w-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6l4 2" />
              </svg>
            </div>
            <p className="text-default-500 text-sm">暂无探针实例</p>
            <p className="text-default-400 text-xs mt-1">添加 Komari 或 Pika 探针服务器，自动同步服务器节点和监控数据</p>
            {canManageProbe && (
              <Button color="primary" size="sm" className="mt-4" onPress={openCreateModal}>添加第一个探针</Button>
            )}
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {instances.map(inst => {
            const syncInfo = SYNC_STATUS_MAP[inst.lastSyncStatus || 'never'] || SYNC_STATUS_MAP.never;
            return (
              <Card key={inst.id} shadow="sm" className="transition-shadow hover:shadow-md">
                <CardBody className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-base truncate">{inst.name}</span>
                        <Chip size="sm" variant="flat" color="secondary">{(inst.type || 'komari').toUpperCase()}</Chip>
                      </div>
                      <p className="text-xs text-default-400 mt-0.5 truncate font-mono">{inst.baseUrl}</p>
                    </div>
                    <Chip size="sm" variant="flat" color={syncInfo.color}>{syncInfo.label}</Chip>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-default-50 dark:bg-default-100/5 rounded-xl p-2.5 text-center">
                      <p className="text-[10px] text-default-400 uppercase tracking-wide">节点</p>
                      <p className="text-lg font-bold mt-0.5">
                        <span className="text-success">{inst.onlineNodeCount || 0}</span>
                        <span className="text-default-300 text-sm font-normal">/{inst.nodeCount || 0}</span>
                      </p>
                    </div>
                    <div className="bg-default-50 dark:bg-default-100/5 rounded-xl p-2.5 text-center">
                      <p className="text-[10px] text-default-400 uppercase tracking-wide">同步间隔</p>
                      <p className="text-lg font-bold mt-0.5">
                        {inst.syncEnabled === 1 ? `${inst.syncIntervalMinutes || 5}m` : <span className="text-default-300 text-sm">禁用</span>}
                      </p>
                    </div>
                    <div className="bg-default-50 dark:bg-default-100/5 rounded-xl p-2.5 text-center">
                      <p className="text-[10px] text-default-400 uppercase tracking-wide">上次同步</p>
                      <p className="text-xs font-medium mt-1.5">{formatTime(inst.lastSyncAt)}</p>
                    </div>
                  </div>

                  {/* Error message if any */}
                  {inst.lastSyncError && (
                    <div className="bg-danger-50 dark:bg-danger-50/10 text-danger text-xs p-2 rounded-lg truncate">
                      {inst.lastSyncError}
                    </div>
                  )}

                  {/* Remark */}
                  {inst.remark && (
                    <p className="text-xs text-default-400 truncate">{inst.remark}</p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-1.5 pt-1 border-t border-divider">
                    <Button size="sm" variant="light" onPress={() => openDetailModal(inst)}>
                      详情
                    </Button>
                    {canManageProbe && (
                      <>
                        <Button size="sm" variant="light" color="primary" isLoading={actionLoading === 'test-' + inst.id} onPress={() => handleTest(inst.id)}>测试</Button>
                        <Button size="sm" variant="light" color="success" isLoading={actionLoading === 'sync-' + inst.id} onPress={() => handleSync(inst.id)}>同步</Button>
                        <Button size="sm" variant="light" onPress={() => openEditModal(inst)}>编辑</Button>
                        <Button size="sm" variant="light" color="danger" className="ml-auto" onPress={() => confirmDelete(inst)}>删除</Button>
                      </>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={isDetailOpen} onClose={() => { setDetail(null); onDetailClose(); }} size="5xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            {detail?.instance?.name || '探针实例详情'}
            {detail?.instance && (
              <p className="text-xs font-normal text-default-500">
                {(detail.instance.type || 'komari').toUpperCase()} · {detail.instance.baseUrl}
              </p>
            )}
          </ModalHeader>
          <ModalBody className="space-y-5">
            {detailLoading && !detail ? (
              <div className="flex justify-center py-10"><Spinner size="lg" /></div>
            ) : detail ? (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  <Card shadow="none" className="border border-divider">
                    <CardBody className="gap-2 p-4">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-default-400">节点总数</p>
                      <p className="text-2xl font-semibold">{detail.providerSummary?.totalNodes ?? detail.nodes?.length ?? 0}</p>
                    </CardBody>
                  </Card>
                  <Card shadow="none" className="border border-divider">
                    <CardBody className="gap-2 p-4">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-default-400">在线节点</p>
                      <p className="text-2xl font-semibold">{detail.providerSummary?.onlineNodes ?? detail.instance.onlineNodeCount ?? 0}</p>
                    </CardBody>
                  </Card>
                  <Card shadow="none" className="border border-divider">
                    <CardBody className="gap-2 p-4">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-default-400">同步状态</p>
                      <Chip size="sm" variant="flat" color={(SYNC_STATUS_MAP[detail.instance.lastSyncStatus || 'never'] || SYNC_STATUS_MAP.never).color}>
                        {(SYNC_STATUS_MAP[detail.instance.lastSyncStatus || 'never'] || SYNC_STATUS_MAP.never).label}
                      </Chip>
                    </CardBody>
                  </Card>
                  <Card shadow="none" className="border border-divider">
                    <CardBody className="gap-2 p-4">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-default-400">最近同步</p>
                      <p className="text-sm font-medium">{formatTime(detail.instance.lastSyncAt)}</p>
                    </CardBody>
                  </Card>
                </div>

                {detail.providerSummaryError && (
                  <div className="rounded-2xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">
                    远端深度摘要获取失败：{detail.providerSummaryError}
                  </div>
                )}

                {detail.providerSummary?.type === 'pika' && detail.providerSummary.pikaSecurity && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Pika 安全中心摘要</p>
                      <p className="text-xs text-default-500">这里聚合服务监控、告警记录、防篡改配置和最近一次安全审计的可见结果。</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                      <Card shadow="none" className="border border-divider">
                        <CardBody className="gap-2 p-4">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-default-400">服务监控</p>
                          <p className="text-2xl font-semibold">{detail.providerSummary.pikaSecurity.totalMonitors ?? 0}</p>
                          <p className="text-xs text-default-500">启用 {detail.providerSummary.pikaSecurity.enabledMonitors ?? 0} / 公开 {detail.providerSummary.pikaSecurity.publicMonitors ?? 0}</p>
                        </CardBody>
                      </Card>
                      <Card shadow="none" className="border border-divider">
                        <CardBody className="gap-2 p-4">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-default-400">告警记录</p>
                          <p className="text-2xl font-semibold">{detail.providerSummary.pikaSecurity.alertRecordCount ?? 0}</p>
                          <p className="text-xs text-default-500">最近一轮聚合告警总量</p>
                        </CardBody>
                      </Card>
                      <Card shadow="none" className="border border-divider">
                        <CardBody className="gap-2 p-4">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-default-400">防篡改</p>
                          <p className="text-2xl font-semibold">{detail.providerSummary.pikaSecurity.tamperProtectedNodes ?? 0}</p>
                          <p className="text-xs text-default-500">事件 {detail.providerSummary.pikaSecurity.tamperEventCount ?? 0} / 告警 {detail.providerSummary.pikaSecurity.tamperAlertCount ?? 0}</p>
                        </CardBody>
                      </Card>
                      <Card shadow="none" className="border border-divider">
                        <CardBody className="gap-2 p-4">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-default-400">安全审计</p>
                          <p className="text-2xl font-semibold">{detail.providerSummary.pikaSecurity.auditCoverageNodes ?? 0}</p>
                          <p className="text-xs text-default-500">公开端口 {detail.providerSummary.pikaSecurity.publicListeningPortCount ?? 0} / 可疑进程 {detail.providerSummary.pikaSecurity.suspiciousProcessCount ?? 0}</p>
                        </CardBody>
                      </Card>
                    </div>

                    <div className="rounded-2xl border border-divider bg-default-50/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">重点事件</p>
                        <Chip size="sm" variant="flat" color="secondary">Pika</Chip>
                      </div>
                      <div className="mt-3 space-y-2">
                        {(detail.providerSummary.pikaSecurity.highlights || []).length > 0 ? (
                          (detail.providerSummary.pikaSecurity.highlights || []).map((item: MonitorProviderHighlight, idx: number) => (
                            <div key={`${item.category}-${idx}`} className="rounded-xl border border-divider bg-content1 px-3 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-foreground">{item.title}</p>
                                <Chip size="sm" variant="flat" color={highlightColor(item.severity)}>{item.category || 'event'}</Chip>
                                {item.count !== undefined && item.count !== null ? <Chip size="sm" variant="flat">{item.count}</Chip> : null}
                              </div>
                              {item.detail && <p className="mt-2 text-xs text-default-600">{item.detail}</p>}
                              {item.timestamp ? <p className="mt-1 text-[11px] text-default-400">{formatTime(item.timestamp)}</p> : null}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-divider px-3 py-5 text-sm text-default-500">
                            当前没有可展示的安全摘要项。
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {detail.providerSummary?.type === 'komari' && detail.providerSummary.komariOperations && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Komari 任务与通知摘要</p>
                      <p className="text-xs text-default-500">这里聚合公开节点、Ping 任务、负载通知和离线通知，便于从 Flux 看到 Komari 的运维侧配置。</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                      <Card shadow="none" className="border border-divider">
                        <CardBody className="gap-2 p-4">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-default-400">公开节点</p>
                          <p className="text-2xl font-semibold">{detail.providerSummary.komariOperations.publicNodeCount ?? 0}</p>
                          <p className="text-xs text-default-500">已关联 {detail.providerSummary.komariOperations.publicBoundNodeCount ?? 0} / 隐藏 {detail.providerSummary.komariOperations.hiddenBoundNodeCount ?? 0}</p>
                        </CardBody>
                      </Card>
                      <Card shadow="none" className="border border-divider">
                        <CardBody className="gap-2 p-4">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-default-400">Ping 任务</p>
                          <p className="text-2xl font-semibold">{detail.providerSummary.komariOperations.pingTaskCount ?? 0}</p>
                          <p className="text-xs text-default-500">仅统计命中本实例节点的任务</p>
                        </CardBody>
                      </Card>
                      <Card shadow="none" className="border border-divider">
                        <CardBody className="gap-2 p-4">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-default-400">负载通知</p>
                          <p className="text-2xl font-semibold">{detail.providerSummary.komariOperations.loadNotificationCount ?? 0}</p>
                          <p className="text-xs text-default-500">CPU / RAM / Load 规则</p>
                        </CardBody>
                      </Card>
                      <Card shadow="none" className="border border-divider">
                        <CardBody className="gap-2 p-4">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-default-400">离线通知</p>
                          <p className="text-2xl font-semibold">{detail.providerSummary.komariOperations.offlineNotificationCount ?? 0}</p>
                          <p className="text-xs text-default-500">与当前节点绑定的离线监控</p>
                        </CardBody>
                      </Card>
                    </div>

                    <div className="rounded-2xl border border-divider bg-default-50/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">公开节点与任务摘录</p>
                        <Chip size="sm" variant="flat" color="primary">Komari</Chip>
                      </div>
                      <div className="mt-3 space-y-2">
                        {(detail.providerSummary.komariOperations.highlights || []).length > 0 ? (
                          (detail.providerSummary.komariOperations.highlights || []).map((item: MonitorProviderHighlight, idx: number) => (
                            <div key={`${item.category}-${idx}`} className="rounded-xl border border-divider bg-content1 px-3 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-foreground">{item.title}</p>
                                <Chip size="sm" variant="flat" color={highlightColor(item.severity)}>{item.category || 'item'}</Chip>
                                {item.count !== undefined && item.count !== null ? <Chip size="sm" variant="flat">{item.count}</Chip> : null}
                              </div>
                              {item.detail && <p className="mt-2 text-xs text-default-600">{item.detail}</p>}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-divider px-3 py-5 text-sm text-default-500">
                            当前没有可展示的公开节点或任务摘要。
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">节点快照</p>
                    <Chip size="sm" variant="flat">{detail.nodes?.length || 0} 个节点</Chip>
                  </div>
                  {(detail.nodes || []).length > 0 ? (
                    <div className="grid gap-2 md:grid-cols-2">
                      {(detail.nodes || []).slice(0, 12).map((node) => (
                        <div key={node.id} className="rounded-xl border border-divider bg-content1 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{node.name || node.remoteNodeUuid}</p>
                              <p className="mt-1 truncate text-xs text-default-500">{node.ip || node.ipv6 || node.remoteNodeUuid}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Chip size="sm" variant="flat" color={node.online === 1 ? 'success' : 'default'}>{node.online === 1 ? '在线' : '离线'}</Chip>
                              <Chip size="sm" variant="flat">{node.instanceType || detail.instance.type}</Chip>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-default-500">
                            {node.region ? <span>{node.region}</span> : null}
                            {node.os ? <span>{node.os}</span> : null}
                            {node.assetName ? <span>资产: {node.assetName}</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-divider px-3 py-5 text-sm text-default-500">
                      当前实例还没有同步到节点快照。
                    </div>
                  )}
                  {(detail.nodes || []).length > 12 && (
                    <p className="text-xs text-default-400">已截取前 12 个节点显示，完整节点列表仍以服务器看板和资产页为主。</p>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-divider px-4 py-8 text-center text-sm text-default-500">
                暂无实例详情。
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => { setDetail(null); onDetailClose(); }}>关闭</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Create/Edit Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{isEdit ? '编辑探针实例' : '添加探针实例'}</ModalHeader>
          <ModalBody className="space-y-4">
            <div className="text-xs text-default-500 font-medium tracking-wide">基本信息</div>
            <Input label="实例名称" placeholder="例如：我的 Komari" isRequired value={form.name} onValueChange={(v) => setForm(p => ({ ...p, name: v }))} />
            <Select label="探针类型" selectedKeys={[form.type]} onSelectionChange={(keys) => { const val = Array.from(keys)[0] as string; if (val) setForm(p => ({ ...p, type: val })); }}>
              <SelectItem key="komari">Komari</SelectItem>
              <SelectItem key="pika">Pika</SelectItem>
            </Select>

            <Divider />
            <div className="text-xs text-default-500 font-medium tracking-wide">连接配置</div>
            <Input label="服务器地址" placeholder={form.type === 'pika' ? 'https://your-pika.com:8080' : 'https://your-komari.com:25774'} isRequired value={form.baseUrl}
              onValueChange={(v) => setForm(p => ({ ...p, baseUrl: v }))} description={form.type === 'pika' ? 'Pika 服务端的完整地址（含端口）' : 'Komari 服务端的完整地址（含端口）'} />
            {form.type === 'pika' && (
              <Input label="用户名" placeholder="admin" value={form.username}
                onValueChange={(v) => setForm(p => ({ ...p, username: v }))} description="Pika 管理员用户名（默认 admin）" />
            )}
            <Input label={form.type === 'pika' ? '密码' : 'API Key'} placeholder={form.type === 'pika' ? 'Pika 管理员密码' : 'Komari 管理员 API 密钥'} type="password" value={form.apiKey}
              onValueChange={(v) => setForm(p => ({ ...p, apiKey: v }))} description={isEdit ? '留空则保持原有凭证' : (form.type === 'pika' ? '在 Pika 管理面板中设置的密码' : '在 Komari 后台「设置」中生成')} />
            <Switch isSelected={form.allowInsecureTls === 1} onValueChange={(v) => setForm(p => ({ ...p, allowInsecureTls: v ? 1 : 0 }))}>
              <span className="text-sm">跳过 TLS 证书验证（自签名证书）</span>
            </Switch>

            <Divider />
            <div className="text-xs text-default-500 font-medium tracking-wide">同步设置</div>
            <Switch isSelected={form.syncEnabled === 1} onValueChange={(v) => setForm(p => ({ ...p, syncEnabled: v ? 1 : 0 }))}>
              <span className="text-sm">启用自动同步</span>
            </Switch>
            {form.syncEnabled === 1 && (
              <Input label="同步间隔（分钟）" type="number" value={String(form.syncIntervalMinutes)}
                onValueChange={(v) => setForm(p => ({ ...p, syncIntervalMinutes: Math.max(1, parseInt(v) || 5) }))}
                description="自动从探针服务器拉取节点数据的频率" />
            )}
            <Textarea label="备注" placeholder="可选备注" value={form.remark} onValueChange={(v) => setForm(p => ({ ...p, remark: v }))} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>取消</Button>
            <Button color="primary" isLoading={actionLoading === 'save'} onPress={handleSave}>{isEdit ? '保存' : '创建'}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={isDeleteOpen} onClose={onDeleteClose} size="sm">
        <ModalContent>
          <ModalHeader>确认删除</ModalHeader>
          <ModalBody>
            <p className="text-sm">确定要删除探针实例 <strong>{deleteTarget?.name}</strong> 吗？该操作会同时移除所有已同步的节点数据和指标记录。</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onDeleteClose}>取消</Button>
            <Button color="danger" isLoading={actionLoading === 'delete'} onPress={handleDelete}>删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
