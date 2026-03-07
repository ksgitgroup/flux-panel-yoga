import { useEffect, useMemo, useState } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Switch } from "@heroui/switch";
import { Spinner } from "@heroui/spinner";
import { Progress } from "@heroui/progress";
import { Divider } from "@heroui/divider";
import { Tooltip } from "@heroui/tooltip";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure
} from "@heroui/modal";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell
} from "@heroui/table";
import toast from 'react-hot-toast';

import {
  MonitorInstance,
  MonitorNodeSnapshot,
  getMonitorList,
  getMonitorDetail,
  createMonitorInstance,
  updateMonitorInstance,
  deleteMonitorInstance,
  testMonitorInstance,
  syncMonitorInstance,
} from '@/api';
import { isAdmin } from '@/utils/auth';
import { useNavigate } from 'react-router-dom';

// ===================== Types =====================

interface InstanceForm {
  id?: number;
  name: string;
  type: string;
  baseUrl: string;
  apiKey: string;
  syncEnabled: number;
  syncIntervalMinutes: number;
  allowInsecureTls: number;
  remark: string;
}

interface DetailData {
  instance: MonitorInstance;
  nodes: MonitorNodeSnapshot[];
}

const defaultForm: InstanceForm = {
  name: '', type: 'komari', baseUrl: '', apiKey: '',
  syncEnabled: 1, syncIntervalMinutes: 5, allowInsecureTls: 0, remark: '',
};

// ===================== Helpers =====================

function formatBytes(bytes?: number | null): string {
  if (bytes == null || bytes === 0) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatSpeed(bytesPerSec?: number | null): string {
  if (bytesPerSec == null || bytesPerSec === 0) return '-';
  const bits = bytesPerSec * 8;
  if (bits < 1000) return bits.toFixed(0) + ' bps';
  if (bits < 1_000_000) return (bits / 1000).toFixed(1) + ' Kbps';
  if (bits < 1_000_000_000) return (bits / 1_000_000).toFixed(1) + ' Mbps';
  return (bits / 1_000_000_000).toFixed(2) + ' Gbps';
}

function formatUptime(seconds?: number | null): string {
  if (seconds == null || seconds === 0) return '-';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d} 天 ${h} 时`;
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} 时 ${m} 分` : `${m} 分`;
}

function formatTime(ts?: number | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function cpuColor(usage?: number | null): "success" | "warning" | "danger" | "default" {
  if (usage == null) return "default";
  if (usage < 50) return "success";
  if (usage < 80) return "warning";
  return "danger";
}

function memPercent(used?: number | null, total?: number | null): number | null {
  if (used == null || total == null || total === 0) return null;
  return (used / total) * 100;
}

const SYNC_STATUS_MAP: Record<string, { label: string; color: "success" | "danger" | "default" }> = {
  success: { label: '正常', color: 'success' },
  failed: { label: '失败', color: 'danger' },
  never: { label: '未同步', color: 'default' },
};

// ===================== Component =====================

export default function ProbePage() {
  const navigate = useNavigate();
  const admin = isAdmin();

  const [instances, setInstances] = useState<MonitorInstance[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [form, setForm] = useState<InstanceForm>({ ...defaultForm });
  const [isEdit, setIsEdit] = useState(false);

  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
  const [deleteTarget, setDeleteTarget] = useState<MonitorInstance | null>(null);

  const [search, setSearch] = useState('');

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
      if (res.code === 0) setDetail(res.data as DetailData);
    } catch { /* ignore */ } finally { setDetailLoading(false); }
  };

  useEffect(() => { loadInstances(); }, []);
  useEffect(() => { selectedId != null ? loadDetail(selectedId) : setDetail(null); }, [selectedId]);
  useEffect(() => {
    if (selectedId == null) return;
    const timer = setInterval(() => loadDetail(selectedId), 30_000);
    return () => clearInterval(timer);
  }, [selectedId]);

  // ===================== Actions =====================

  const handleTest = async (id: number) => {
    setActionLoading('test-' + id);
    try {
      const res = await testMonitorInstance(id);
      res.code === 0 ? toast.success('连接成功') : toast.error(res.msg || '连接失败');
      loadInstances();
      if (selectedId === id) loadDetail(id);
    } catch { toast.error('连接失败'); } finally { setActionLoading(null); }
  };

  const handleSync = async (id: number) => {
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
      if (selectedId === id) loadDetail(id);
    } catch { toast.error('同步失败'); } finally { setActionLoading(null); }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.baseUrl.trim()) {
      toast.error('请填写实例名称和地址');
      return;
    }
    setActionLoading('save');
    try {
      const payload = { ...form, name: form.name.trim(), baseUrl: form.baseUrl.trim(), apiKey: form.apiKey.trim(), remark: form.remark.trim() };
      const res = isEdit ? await updateMonitorInstance(payload) : await createMonitorInstance(payload);
      if (res.code === 0) {
        toast.success(isEdit ? '已更新' : '已创建');
        onClose();
        loadInstances();
        if (isEdit && selectedId === form.id) loadDetail(form.id!);
      } else {
        toast.error(res.msg || '保存失败');
      }
    } catch { toast.error('保存失败'); } finally { setActionLoading(null); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading('delete');
    try {
      const res = await deleteMonitorInstance(deleteTarget.id);
      if (res.code === 0) {
        toast.success('已删除');
        onDeleteClose();
        if (selectedId === deleteTarget.id) { setSelectedId(null); setDetail(null); }
        loadInstances();
      } else { toast.error(res.msg || '删除失败'); }
    } catch { toast.error('删除失败'); } finally { setActionLoading(null); }
  };

  const openCreateModal = () => { setForm({ ...defaultForm }); setIsEdit(false); onOpen(); };
  const openEditModal = (inst: MonitorInstance) => {
    setForm({
      id: inst.id, name: inst.name || '', type: inst.type || 'komari', baseUrl: inst.baseUrl || '',
      apiKey: '', syncEnabled: inst.syncEnabled ?? 1, syncIntervalMinutes: inst.syncIntervalMinutes ?? 5,
      allowInsecureTls: inst.allowInsecureTls ?? 0, remark: inst.remark || '',
    });
    setIsEdit(true); onOpen();
  };
  const confirmDelete = (inst: MonitorInstance) => { setDeleteTarget(inst); onDeleteOpen(); };

  // ===================== Computed =====================

  const filteredInstances = useMemo(() => {
    if (!search.trim()) return instances;
    const q = search.toLowerCase();
    return instances.filter(i => (i.name || '').toLowerCase().includes(q) || (i.baseUrl || '').toLowerCase().includes(q));
  }, [instances, search]);

  const summary = useMemo(() => ({
    total: instances.length,
    totalNodes: instances.reduce((s, i) => s + (i.nodeCount || 0), 0),
    onlineNodes: instances.reduce((s, i) => s + (i.onlineNodeCount || 0), 0),
    syncOk: instances.filter(i => i.lastSyncStatus === 'success').length,
    syncFail: instances.filter(i => i.lastSyncStatus === 'failed').length,
  }), [instances]);

  // ===================== Render =====================

  return (
    <div className="w-full max-w-[1600px] mx-auto px-3 md:px-6 py-4 md:py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">探针管理</h1>
          <p className="text-sm text-default-500 mt-0.5">
            连接 Komari / Pika 探针服务器，自动同步节点状态和实时指标。添加探针后系统会定期拉取数据，无需手动维护。
          </p>
        </div>
        {admin && (
          <Button color="primary" size="sm" onPress={openCreateModal}>添加探针</Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
        <Card shadow="sm"><CardBody className="p-3 text-center">
          <p className="text-xs text-default-500">探针实例</p>
          <p className="text-xl font-bold">{summary.total}</p>
        </CardBody></Card>
        <Card shadow="sm"><CardBody className="p-3 text-center">
          <p className="text-xs text-default-500">节点总数</p>
          <p className="text-xl font-bold">{summary.totalNodes}</p>
        </CardBody></Card>
        <Card shadow="sm"><CardBody className="p-3 text-center">
          <p className="text-xs text-default-500">在线节点</p>
          <p className="text-xl font-bold text-success">{summary.onlineNodes}</p>
        </CardBody></Card>
        <Card shadow="sm"><CardBody className="p-3 text-center">
          <p className="text-xs text-default-500">同步正常</p>
          <p className="text-xl font-bold text-success">{summary.syncOk}</p>
        </CardBody></Card>
        <Card shadow="sm"><CardBody className="p-3 text-center">
          <p className="text-xs text-default-500">同步异常</p>
          <p className="text-xl font-bold text-danger">{summary.syncFail}</p>
        </CardBody></Card>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left: Instance list */}
        <div className="w-full lg:w-[340px] xl:w-[380px] flex-shrink-0 space-y-3">
          <Input size="sm" placeholder="搜索探针..." value={search} onValueChange={setSearch} isClearable onClear={() => setSearch('')} />

          {loading ? (
            <div className="flex justify-center py-8"><Spinner size="lg" /></div>
          ) : filteredInstances.length === 0 ? (
            <Card shadow="sm"><CardBody className="py-8 text-center text-default-400">
              {instances.length === 0 ? '暂无探针实例，点击「添加探针」开始接入' : '没有匹配的结果'}
            </CardBody></Card>
          ) : (
            filteredInstances.map(inst => {
              const syncInfo = SYNC_STATUS_MAP[inst.lastSyncStatus || 'never'] || SYNC_STATUS_MAP.never;
              return (
                <Card key={inst.id} shadow="sm" isPressable onPress={() => setSelectedId(inst.id)}
                  className={`transition-all ${selectedId === inst.id ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}>
                  <CardBody className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 bg-${syncInfo.color}`} />
                        <span className="font-semibold text-sm truncate">{inst.name}</span>
                      </div>
                      <Chip size="sm" variant="flat" color="secondary">{(inst.type || 'komari').toUpperCase()}</Chip>
                    </div>
                    <p className="text-xs text-default-400 truncate">{inst.baseUrl}</p>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-default-500">
                        节点: <span className="font-medium text-foreground">{inst.onlineNodeCount || 0}</span>
                        <span className="text-default-300">/{inst.nodeCount || 0}</span>
                      </span>
                      {inst.syncEnabled === 1 && <Chip size="sm" variant="dot" color="success">自动</Chip>}
                      {inst.lastSyncAt && <span className="text-default-400 ml-auto">{formatTime(inst.lastSyncAt)}</span>}
                    </div>
                    {admin && (
                      <div className="flex gap-1.5 pt-1">
                        <Button size="sm" variant="flat" color="primary" isLoading={actionLoading === 'test-' + inst.id} onPress={() => handleTest(inst.id)}>测试</Button>
                        <Button size="sm" variant="flat" color="success" isLoading={actionLoading === 'sync-' + inst.id} onPress={() => handleSync(inst.id)}>同步</Button>
                        <Button size="sm" variant="flat" onPress={() => openEditModal(inst)}>编辑</Button>
                        <Button size="sm" variant="flat" color="danger" onPress={() => confirmDelete(inst)}>删除</Button>
                      </div>
                    )}
                  </CardBody>
                </Card>
              );
            })
          )}
        </div>

        {/* Right: Detail panel */}
        <div className="flex-1 min-w-0">
          {selectedId == null ? (
            <Card shadow="sm" className="h-full min-h-[400px]">
              <CardBody className="flex items-center justify-center text-default-400">
                选择一个探针实例查看其节点和监控数据
              </CardBody>
            </Card>
          ) : detailLoading && !detail ? (
            <Card shadow="sm" className="h-full min-h-[400px]">
              <CardBody className="flex items-center justify-center"><Spinner size="lg" /></CardBody>
            </Card>
          ) : detail ? (
            <div className="space-y-4">
              {/* Instance overview */}
              <Card shadow="sm">
                <CardHeader className="pb-1 px-4 pt-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{detail.instance.name}</h2>
                    <p className="text-xs text-default-400">{(detail.instance as any).baseUrl || ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => { const s = SYNC_STATUS_MAP[detail.instance.lastSyncStatus || 'never'] || SYNC_STATUS_MAP.never; return <Chip size="sm" color={s.color} variant="flat">{s.label}</Chip>; })()}
                    {detail.instance.lastSyncAt && <span className="text-xs text-default-400">上次同步: {formatTime(detail.instance.lastSyncAt)}</span>}
                  </div>
                </CardHeader>
                <CardBody className="px-4 pb-3 pt-2">
                  {detail.instance.lastSyncError && (
                    <div className="bg-danger-50 dark:bg-danger-50/10 text-danger text-xs p-2 rounded-lg mb-3">{detail.instance.lastSyncError}</div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><p className="text-xs text-default-400">类型</p><p className="font-medium">{(detail.instance.type || 'komari').toUpperCase()}</p></div>
                    <div><p className="text-xs text-default-400">节点</p><p className="font-medium">{detail.instance.onlineNodeCount || 0} / {detail.instance.nodeCount || 0}</p></div>
                    <div><p className="text-xs text-default-400">自动同步</p><p className="font-medium">{detail.instance.syncEnabled === 1 ? `每 ${detail.instance.syncIntervalMinutes || 5} 分钟` : '已禁用'}</p></div>
                    <div><p className="text-xs text-default-400">TLS</p><p className="font-medium">{detail.instance.allowInsecureTls === 1 ? '跳过验证' : '验证证书'}</p></div>
                  </div>
                </CardBody>
              </Card>

              {/* Node list */}
              <Card shadow="sm">
                <CardHeader className="px-4 pt-3 pb-1 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">监控节点 ({detail.nodes?.length || 0})</h2>
                  <Button size="sm" variant="flat" color="success" isLoading={actionLoading === 'sync-' + selectedId} onPress={() => handleSync(selectedId!)}>立即同步</Button>
                </CardHeader>
                <CardBody className="px-4 pb-4 pt-2">
                  {!detail.nodes || detail.nodes.length === 0 ? (
                    <p className="text-default-400 text-sm py-4 text-center">暂无节点数据，点击「立即同步」或等待自动同步</p>
                  ) : (
                    <>
                      {/* Desktop table */}
                      <div className="hidden md:block overflow-x-auto -mx-4 px-4">
                        <Table aria-label="节点列表" removeWrapper isCompact>
                          <TableHeader>
                            <TableColumn>状态</TableColumn>
                            <TableColumn>名称</TableColumn>
                            <TableColumn>IP</TableColumn>
                            <TableColumn>CPU</TableColumn>
                            <TableColumn>内存</TableColumn>
                            <TableColumn>磁盘</TableColumn>
                            <TableColumn>网络</TableColumn>
                            <TableColumn>运行</TableColumn>
                            <TableColumn>关联资产</TableColumn>
                          </TableHeader>
                          <TableBody>
                            {detail.nodes.map(node => {
                              const m = node.latestMetric;
                              const mp = memPercent(m?.memUsed, m?.memTotal);
                              const dp = memPercent(m?.diskUsed, m?.diskTotal);
                              return (
                                <TableRow key={node.id}>
                                  <TableCell>
                                    <Chip size="sm" color={node.online === 1 ? 'success' : 'default'} variant="dot">
                                      {node.online === 1 ? '在线' : '离线'}
                                    </Chip>
                                  </TableCell>
                                  <TableCell>
                                    <div>
                                      <p className="font-medium text-sm">{node.name || node.remoteNodeUuid?.slice(0, 8)}</p>
                                      {node.os && <p className="text-xs text-default-400">{node.os}</p>}
                                    </div>
                                  </TableCell>
                                  <TableCell><p className="text-xs font-mono">{node.ip || '-'}</p></TableCell>
                                  <TableCell>
                                    {m?.cpuUsage != null ? (
                                      <div className="w-20">
                                        <p className="text-xs font-medium mb-0.5">{m.cpuUsage.toFixed(1)}%</p>
                                        <Progress size="sm" value={m.cpuUsage} color={cpuColor(m.cpuUsage)} aria-label="CPU" />
                                      </div>
                                    ) : <span className="text-default-300">-</span>}
                                  </TableCell>
                                  <TableCell>
                                    {mp != null ? (
                                      <div className="w-20">
                                        <p className="text-xs font-medium mb-0.5">{mp.toFixed(0)}%</p>
                                        <Progress size="sm" value={mp} color={cpuColor(mp)} aria-label="MEM" />
                                      </div>
                                    ) : <span className="text-default-300">-</span>}
                                  </TableCell>
                                  <TableCell>
                                    {dp != null ? (
                                      <Tooltip content={`${formatBytes(m?.diskUsed)} / ${formatBytes(m?.diskTotal)}`}>
                                        <div className="w-20">
                                          <p className="text-xs font-medium mb-0.5">{dp.toFixed(0)}%</p>
                                          <Progress size="sm" value={dp} color={cpuColor(dp)} aria-label="Disk" />
                                        </div>
                                      </Tooltip>
                                    ) : <span className="text-default-300">-</span>}
                                  </TableCell>
                                  <TableCell>
                                    <div className="text-xs">
                                      <p>上行: {formatSpeed(m?.netIn)}</p>
                                      <p>下行: {formatSpeed(m?.netOut)}</p>
                                    </div>
                                  </TableCell>
                                  <TableCell><span className="text-xs">{formatUptime(m?.uptime)}</span></TableCell>
                                  <TableCell>
                                    {node.assetName ? (
                                      <Chip size="sm" variant="flat" color="primary" className="cursor-pointer" onClick={() => navigate('/assets')}>{node.assetName}</Chip>
                                    ) : (
                                      <span className="text-xs text-default-300">未绑定</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile cards */}
                      <div className="md:hidden space-y-3">
                        {detail.nodes.map(node => {
                          const m = node.latestMetric;
                          const mp = memPercent(m?.memUsed, m?.memTotal);
                          return (
                            <Card key={node.id} shadow="none" className="border border-default-200">
                              <CardBody className="p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${node.online === 1 ? 'bg-success' : 'bg-default-300'}`} />
                                    <span className="font-medium text-sm">{node.name || node.remoteNodeUuid?.slice(0, 8)}</span>
                                  </div>
                                  {node.assetName ? (
                                    <Chip size="sm" variant="flat" color="primary">{node.assetName}</Chip>
                                  ) : (
                                    <span className="text-xs text-default-300">未绑定</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-default-400">
                                  <span className="font-mono">{node.ip || '-'}</span>
                                  {node.os && <><span>|</span><span>{node.os}</span></>}
                                </div>
                                {node.online === 1 && m && (
                                  <div className="grid grid-cols-3 gap-2">
                                    <div>
                                      <p className="text-[10px] text-default-400">CPU</p>
                                      <p className="text-sm font-semibold">{m.cpuUsage?.toFixed(1) || '-'}%</p>
                                      {m.cpuUsage != null && <Progress size="sm" value={m.cpuUsage} color={cpuColor(m.cpuUsage)} className="mt-0.5" aria-label="CPU" />}
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-default-400">内存</p>
                                      <p className="text-sm font-semibold">{mp != null ? mp.toFixed(0) + '%' : '-'}</p>
                                      {mp != null && <Progress size="sm" value={mp} color={cpuColor(mp)} className="mt-0.5" aria-label="MEM" />}
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-default-400">运行时间</p>
                                      <p className="text-sm font-semibold">{formatUptime(m.uptime)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-default-400">上行</p>
                                      <p className="text-xs font-medium">{formatSpeed(m.netIn)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-default-400">下行</p>
                                      <p className="text-xs font-medium">{formatSpeed(m.netOut)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-default-400">连接数</p>
                                      <p className="text-xs font-medium">{m.connections ?? '-'}</p>
                                    </div>
                                  </div>
                                )}
                              </CardBody>
                            </Card>
                          );
                        })}
                      </div>
                    </>
                  )}
                </CardBody>
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{isEdit ? '编辑探针实例' : '添加探针实例'}</ModalHeader>
          <ModalBody className="space-y-4">
            <div className="text-xs text-default-500 font-medium tracking-wide">基本信息</div>
            <Input label="实例名称" placeholder="例如：我的 Komari" isRequired value={form.name} onValueChange={(v) => setForm(p => ({ ...p, name: v }))} />
            <Select label="探针类型" selectedKeys={[form.type]} onSelectionChange={(keys) => { const val = Array.from(keys)[0] as string; if (val) setForm(p => ({ ...p, type: val })); }}>
              <SelectItem key="komari">Komari</SelectItem>
              <SelectItem key="pika">Pika (即将支持)</SelectItem>
            </Select>

            <Divider />
            <div className="text-xs text-default-500 font-medium tracking-wide">连接配置</div>
            <Input label="服务器地址" placeholder="https://your-komari.com:25774" isRequired value={form.baseUrl}
              onValueChange={(v) => setForm(p => ({ ...p, baseUrl: v }))} description="Komari 服务端的完整地址（含端口）" />
            <Input label="API Key" placeholder="Komari 管理员 API 密钥" type="password" value={form.apiKey}
              onValueChange={(v) => setForm(p => ({ ...p, apiKey: v }))} description={isEdit ? "留空则保持原有密钥" : "在 Komari 后台「设置」中生成"} />
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
