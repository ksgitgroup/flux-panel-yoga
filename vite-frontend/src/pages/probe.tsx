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
  MonitorInstance,
  getMonitorList,
  createMonitorInstance,
  updateMonitorInstance,
  deleteMonitorInstance,
  testMonitorInstance,
  syncMonitorInstance,
} from '@/api';
import { isAdmin } from '@/utils/auth';

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

const defaultForm: InstanceForm = {
  name: '', type: 'komari', baseUrl: '', apiKey: '',
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

// ===================== Component =====================

export default function ProbePage() {
  const admin = isAdmin();

  const [instances, setInstances] = useState<MonitorInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

  useEffect(() => { loadInstances(); }, []);

  // ===================== Actions =====================

  const handleTest = async (id: number) => {
    setActionLoading('test-' + id);
    try {
      const res = await testMonitorInstance(id);
      res.code === 0 ? toast.success('连接成功') : toast.error(res.msg || '连接失败');
      loadInstances();
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

  const summary = useMemo(() => ({
    total: instances.length,
    totalNodes: instances.reduce((s, i) => s + (i.nodeCount || 0), 0),
    onlineNodes: instances.reduce((s, i) => s + (i.onlineNodeCount || 0), 0),
    syncOk: instances.filter(i => i.lastSyncStatus === 'success').length,
    syncFail: instances.filter(i => i.lastSyncStatus === 'failed').length,
  }), [instances]);

  // ===================== Render =====================

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
          {admin && (
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
            {admin && (
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
                  {admin && (
                    <div className="flex gap-1.5 pt-1 border-t border-divider">
                      <Button size="sm" variant="light" color="primary" isLoading={actionLoading === 'test-' + inst.id} onPress={() => handleTest(inst.id)}>测试</Button>
                      <Button size="sm" variant="light" color="success" isLoading={actionLoading === 'sync-' + inst.id} onPress={() => handleSync(inst.id)}>同步</Button>
                      <Button size="sm" variant="light" onPress={() => openEditModal(inst)}>编辑</Button>
                      <Button size="sm" variant="light" color="danger" className="ml-auto" onPress={() => confirmDelete(inst)}>删除</Button>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

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
