import { useEffect, useState, useCallback } from 'react';
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Divider } from "@heroui/divider";
import { Switch } from "@heroui/switch";
import { Select, SelectItem } from "@heroui/select";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure
} from "@heroui/modal";
import toast from 'react-hot-toast';

import {
  AlertRule, AlertLog,
  getAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, toggleAlertRule,
  getAlertLogs, clearAlertLogs,
} from '@/api';
import { isAdmin } from '@/utils/auth';

const METRICS = [
  { value: 'cpu', label: 'CPU 使用率 (%)' },
  { value: 'mem', label: '内存使用率 (%)' },
  { value: 'disk', label: '磁盘使用率 (%)' },
  { value: 'net_in', label: '入站流量 (B/s)' },
  { value: 'net_out', label: '出站流量 (B/s)' },
  { value: 'load', label: '系统负载 (1min)' },
  { value: 'temperature', label: '温度 (°C)' },
  { value: 'connections', label: 'TCP 连接数' },
  { value: 'offline', label: '节点离线' },
];

const OPERATORS = [
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'eq', label: '=' },
];

const SCOPE_TYPES = [
  { value: 'all', label: '全部节点' },
  { value: 'tag', label: '按标签' },
  { value: 'node', label: '按节点 ID' },
];

const NOTIFY_TYPES = [
  { value: 'log', label: '仅记录日志' },
  { value: 'webhook', label: 'Webhook' },
];

function formatTime(ts?: number | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

export default function AlertPage() {
  const admin = isAdmin();
  const [tab, setTab] = useState<'rules' | 'logs'>('rules');

  // Rules state
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);

  // Logs state
  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);

  // Edit modal
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editRule, setEditRule] = useState<Partial<AlertRule> | null>(null);

  const fetchRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const res = await getAlertRules();
      if (res.code === 0 && res.data) setRules(res.data as AlertRule[]);
    } catch { /* ignore */ }
    finally { setRulesLoading(false); }
  }, []);

  const fetchLogs = useCallback(async (page = 1) => {
    setLogsLoading(true);
    try {
      const res = await getAlertLogs(page, 20);
      if (res.code === 0 && res.data) {
        const d = res.data as any;
        setLogs(d.records || []);
        setLogsTotal(d.total || 0);
        setLogsPage(page);
      }
    } catch { /* ignore */ }
    finally { setLogsLoading(false); }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchLogs(1);
  }, [fetchRules, fetchLogs]);

  const handleSave = async () => {
    if (!editRule?.name || !editRule?.metric) {
      toast.error('请填写必要字段');
      return;
    }
    try {
      const res = editRule.id
        ? await updateAlertRule(editRule)
        : await createAlertRule(editRule);
      if (res.code === 0) {
        toast.success(editRule.id ? '已更新' : '已创建');
        onClose();
        fetchRules();
      } else {
        toast.error(res.msg || '操作失败');
      }
    } catch { toast.error('操作失败'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此告警规则？')) return;
    try {
      const res = await deleteAlertRule(id);
      if (res.code === 0) { toast.success('已删除'); fetchRules(); }
      else toast.error(res.msg || '删除失败');
    } catch { toast.error('删除失败'); }
  };

  const handleToggle = async (id: number) => {
    try {
      const res = await toggleAlertRule(id);
      if (res.code === 0) fetchRules();
    } catch { /* ignore */ }
  };

  const openCreate = () => {
    setEditRule({
      name: '', metric: 'cpu', operator: 'gt', threshold: 90,
      durationSeconds: 0, scopeType: 'all', notifyType: 'log',
      cooldownMinutes: 5, enabled: 1,
    });
    onOpen();
  };

  const openEdit = (rule: AlertRule) => {
    setEditRule({ ...rule });
    onOpen();
  };

  if (!admin) {
    return (
      <Card className="border border-danger/20 bg-danger-50/60">
        <CardBody className="p-6"><h1 className="text-xl font-semibold text-danger">仅管理员可访问</h1></CardBody>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">告警管理</h1>
          <p className="mt-0.5 text-sm text-default-500">配置监控告警规则，查看告警日志</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={tab === 'rules' ? 'solid' : 'flat'} color="primary" onPress={() => setTab('rules')}>规则</Button>
          <Button size="sm" variant={tab === 'logs' ? 'solid' : 'flat'} color="primary" onPress={() => setTab('logs')}>日志</Button>
        </div>
      </div>

      {tab === 'rules' && (
        <>
          <div className="flex justify-end">
            <Button size="sm" color="primary" onPress={openCreate}>新建规则</Button>
          </div>

          {rulesLoading ? (
            <div className="flex h-40 items-center justify-center"><Spinner size="lg" /></div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider/60 p-12 text-center">
              <h3 className="text-base font-semibold text-default-600">暂无告警规则</h3>
              <p className="mt-2 text-sm text-default-400">点击「新建规则」开始配置监控告警。</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map(rule => (
                <div key={rule.id} className={`rounded-xl border p-3 flex items-center gap-3 ${rule.enabled ? 'border-divider/60 bg-content1' : 'border-divider/40 bg-default-50 opacity-60'}`}>
                  <Switch size="sm" isSelected={rule.enabled === 1} onValueChange={() => handleToggle(rule.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{rule.name}</span>
                      <Chip size="sm" variant="flat" color={rule.metric === 'offline' ? 'danger' : 'primary'} className="h-5 text-[10px]">
                        {METRICS.find(m => m.value === rule.metric)?.label || rule.metric}
                      </Chip>
                      {rule.metric !== 'offline' && (
                        <span className="text-xs font-mono text-default-500">
                          {OPERATORS.find(o => o.value === rule.operator)?.label || rule.operator} {rule.threshold}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-default-400 mt-0.5">
                      范围: {SCOPE_TYPES.find(s => s.value === rule.scopeType)?.label || rule.scopeType}
                      {rule.scopeValue ? ` (${rule.scopeValue})` : ''}
                      {' · '}通知: {NOTIFY_TYPES.find(n => n.value === rule.notifyType)?.label || rule.notifyType}
                      {' · '}冷却: {rule.cooldownMinutes}分钟
                      {rule.lastTriggeredAt ? ` · 上次触发: ${formatTime(rule.lastTriggeredAt)}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="flat" onPress={() => openEdit(rule)}>编辑</Button>
                    <Button size="sm" variant="flat" color="danger" onPress={() => handleDelete(rule.id)}>删除</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'logs' && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-default-500">共 {logsTotal} 条告警记录</p>
            <div className="flex gap-2">
              <Button size="sm" variant="flat" onPress={() => fetchLogs(logsPage)}>刷新</Button>
              <Button size="sm" variant="flat" color="danger" onPress={async () => {
                if (!confirm('确定清除所有告警日志？')) return;
                await clearAlertLogs();
                toast.success('已清除');
                fetchLogs(1);
              }}>清除全部</Button>
            </div>
          </div>

          {logsLoading ? (
            <div className="flex h-40 items-center justify-center"><Spinner size="lg" /></div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider/60 p-12 text-center">
              <h3 className="text-base font-semibold text-default-600">暂无告警日志</h3>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                {logs.map(log => (
                  <div key={log.id} className="rounded-lg border border-divider/60 bg-content1 p-2.5 flex items-start gap-2">
                    <Chip size="sm" variant="flat"
                      color={log.notifyStatus === 'sent' ? 'success' : log.notifyStatus === 'failed' ? 'danger' : 'warning'}
                      className="h-5 text-[9px] flex-shrink-0 mt-0.5">
                      {log.notifyStatus === 'sent' ? '已发送' : log.notifyStatus === 'failed' ? '发送失败' : '记录'}
                    </Chip>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{log.message}</p>
                      <p className="text-[10px] text-default-400 font-mono mt-0.5">
                        规则: {log.ruleName} · 节点: {log.nodeName || '-'} · {formatTime(log.createdTime)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {logsTotal > 20 && (
                <div className="flex justify-center gap-2 pt-2">
                  <Button size="sm" variant="flat" isDisabled={logsPage <= 1} onPress={() => fetchLogs(logsPage - 1)}>上一页</Button>
                  <span className="text-xs text-default-400 self-center">{logsPage} / {Math.ceil(logsTotal / 20)}</span>
                  <Button size="sm" variant="flat" isDisabled={logsPage >= Math.ceil(logsTotal / 20)} onPress={() => fetchLogs(logsPage + 1)}>下一页</Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Edit/Create Rule Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalContent>
          {editRule && (
            <>
              <ModalHeader>{editRule.id ? '编辑告警规则' : '新建告警规则'}</ModalHeader>
              <ModalBody className="space-y-3">
                <Input label="规则名称" size="sm" value={editRule.name || ''} onValueChange={v => setEditRule({ ...editRule, name: v })} />

                <Select label="监控指标" size="sm" selectedKeys={editRule.metric ? [editRule.metric] : []}
                  onSelectionChange={keys => { const v = Array.from(keys)[0] as string; setEditRule({ ...editRule, metric: v }); }}>
                  {METRICS.map(m => <SelectItem key={m.value}>{m.label}</SelectItem>)}
                </Select>

                {editRule.metric !== 'offline' && (
                  <div className="flex gap-2">
                    <Select label="操作符" size="sm" className="w-28" selectedKeys={editRule.operator ? [editRule.operator] : ['gt']}
                      onSelectionChange={keys => { const v = Array.from(keys)[0] as string; setEditRule({ ...editRule, operator: v }); }}>
                      {OPERATORS.map(o => <SelectItem key={o.value}>{o.label}</SelectItem>)}
                    </Select>
                    <Input label="阈值" size="sm" type="number" className="flex-1"
                      value={String(editRule.threshold ?? '')}
                      onValueChange={v => setEditRule({ ...editRule, threshold: parseFloat(v) || 0 })} />
                  </div>
                )}

                <Divider />

                <Select label="监控范围" size="sm" selectedKeys={editRule.scopeType ? [editRule.scopeType] : ['all']}
                  onSelectionChange={keys => { const v = Array.from(keys)[0] as string; setEditRule({ ...editRule, scopeType: v }); }}>
                  {SCOPE_TYPES.map(s => <SelectItem key={s.value}>{s.label}</SelectItem>)}
                </Select>

                {editRule.scopeType && editRule.scopeType !== 'all' && (
                  <Input label={editRule.scopeType === 'tag' ? '标签名' : '节点 ID'} size="sm"
                    value={editRule.scopeValue || ''}
                    onValueChange={v => setEditRule({ ...editRule, scopeValue: v })} />
                )}

                <Divider />

                <Select label="通知方式" size="sm" selectedKeys={editRule.notifyType ? [editRule.notifyType] : ['log']}
                  onSelectionChange={keys => { const v = Array.from(keys)[0] as string; setEditRule({ ...editRule, notifyType: v }); }}>
                  {NOTIFY_TYPES.map(n => <SelectItem key={n.value}>{n.label}</SelectItem>)}
                </Select>

                {editRule.notifyType === 'webhook' && (
                  <Input label="Webhook URL" size="sm" placeholder="https://..."
                    value={editRule.notifyTarget || ''}
                    onValueChange={v => setEditRule({ ...editRule, notifyTarget: v })} />
                )}

                <Input label="冷却时间 (分钟)" size="sm" type="number"
                  value={String(editRule.cooldownMinutes ?? 5)}
                  onValueChange={v => setEditRule({ ...editRule, cooldownMinutes: parseInt(v) || 5 })} />
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>取消</Button>
                <Button color="primary" onPress={handleSave}>{editRule.id ? '保存' : '创建'}</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
