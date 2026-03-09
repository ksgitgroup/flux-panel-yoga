import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { hasPermission } from '@/utils/auth';

const METRICS = [
  { value: 'cpu', label: 'CPU 使用率 (%)', needsProbe: true },
  { value: 'mem', label: '内存使用率 (%)', needsProbe: true },
  { value: 'disk', label: '磁盘使用率 (%)', needsProbe: true },
  { value: 'net_in', label: '入站流量 (B/s)', needsProbe: true },
  { value: 'net_out', label: '出站流量 (B/s)', needsProbe: true },
  { value: 'load', label: '系统负载 (1min)', needsProbe: true },
  { value: 'temperature', label: '温度 (°C)', needsProbe: true },
  { value: 'connections', label: 'TCP 连接数', needsProbe: true },
  { value: 'offline', label: '节点离线', needsProbe: true },
  { value: 'expiry', label: '到期提醒 (剩余天数)', needsProbe: false },
  { value: 'traffic_quota', label: '流量配额 (已用%)', needsProbe: false },
  { value: 'forward_health', label: '转发健康度', needsProbe: false },
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
  { value: 'wechat', label: '企业微信机器人' },
];

const PROBE_CONDITIONS = [
  { value: 'any', label: '任意探针' },
  { value: 'komari', label: '仅 Komari' },
  { value: 'pika', label: '仅 Pika' },
  { value: 'both', label: '双探针节点' },
];

const SEVERITIES = [
  { value: 'info', label: '提示', color: 'primary' as const },
  { value: 'warning', label: '警告', color: 'warning' as const },
  { value: 'critical', label: '严重', color: 'danger' as const },
];

// Metrics that don't need threshold input
const NO_THRESHOLD_METRICS = ['offline'];
// Metrics that don't need duration
const NO_DURATION_METRICS = ['offline', 'expiry', 'traffic_quota', 'forward_health'];
// Metrics with fixed operator (auto-set)
const FIXED_OPERATOR_METRICS: Record<string, { operator: string; label: string; defaultThreshold: number; description: string }> = {
  expiry: { operator: 'lte', label: '提前提醒天数', defaultThreshold: 7, description: '剩余天数 <= 此值时触发（已过期也触发）' },
  traffic_quota: { operator: 'gte', label: '流量使用率 (%)', defaultThreshold: 80, description: '已用百分比 >= 此值时触发' },
  forward_health: { operator: 'lt', label: '健康度阈值 (%)', defaultThreshold: 60, description: '健康度低于此值时触发（100=完美）' },
};

function formatTime(ts?: number | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

/** Parse numeric input, allowing empty/partial typing */
function parseNum(v: string, fallback?: number): number | undefined {
  if (v === '' || v === '-') return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

export default function AlertPage() {
  const navigate = useNavigate();
  const canViewAlerts = hasPermission('alert.read');
  const canCreateAlerts = hasPermission('alert.create');
  const canUpdateAlerts = hasPermission('alert.update');
  const canDeleteAlerts = hasPermission('alert.delete');
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
    if (editRule?.id ? !canUpdateAlerts : !canCreateAlerts) {
      toast.error('权限不足');
      return;
    }
    if (!editRule?.name?.trim()) {
      toast.error('请填写规则名称');
      return;
    }
    if (!editRule?.metric) {
      toast.error('请选择监控指标');
      return;
    }
    if (!NO_THRESHOLD_METRICS.includes(editRule.metric) && (editRule.threshold == null || isNaN(editRule.threshold))) {
      toast.error('请填写阈值');
      return;
    }
    try {
      const payload = { ...editRule, name: editRule.name.trim() };
      const res = payload.id
        ? await updateAlertRule(payload)
        : await createAlertRule(payload);
      if (res.code === 0) {
        toast.success(payload.id ? '已更新' : '已创建');
        onClose();
        fetchRules();
      } else {
        toast.error(res.msg || '操作失败');
      }
    } catch { toast.error('操作失败'); }
  };

  const handleDelete = async (id: number) => {
    if (!canDeleteAlerts) {
      toast.error('权限不足');
      return;
    }
    if (!confirm('确定删除此告警规则？')) return;
    try {
      const res = await deleteAlertRule(id);
      if (res.code === 0) { toast.success('已删除'); fetchRules(); }
      else toast.error(res.msg || '删除失败');
    } catch { toast.error('删除失败'); }
  };

  const handleToggle = async (id: number) => {
    if (!canUpdateAlerts) return;
    try {
      const res = await toggleAlertRule(id);
      if (res.code === 0) fetchRules();
    } catch { /* ignore */ }
  };

  const openCreate = () => {
    if (!canCreateAlerts) {
      toast.error('权限不足');
      return;
    }
    setEditRule({
      name: '', metric: 'cpu', operator: 'gt', threshold: 90,
      durationSeconds: 0, scopeType: 'all', notifyType: 'log',
      cooldownMinutes: 5, enabled: 1, severity: 'warning',
      probeCondition: 'any',
    });
    onOpen();
  };

  const openEdit = (rule: AlertRule) => {
    if (!canUpdateAlerts) {
      toast.error('权限不足');
      return;
    }
    setEditRule({ ...rule });
    onOpen();
  };

  const updateField = (fields: Partial<AlertRule>) => {
    setEditRule(prev => prev ? { ...prev, ...fields } : prev);
  };

  // When metric changes, auto-set operator/threshold for fixed-operator metrics
  const handleMetricChange = (metric: string) => {
    const fixed = FIXED_OPERATOR_METRICS[metric];
    if (fixed) {
      updateField({ metric, operator: fixed.operator, threshold: fixed.defaultThreshold });
    } else if (metric === 'offline') {
      updateField({ metric, operator: 'gt', threshold: 0 });
    } else {
      updateField({ metric });
    }
  };

  // Helper to check if current metric needs probe condition
  const metricNeedsProbe = editRule?.metric
    ? (METRICS.find(m => m.value === editRule.metric)?.needsProbe ?? true)
    : true;

  if (!canViewAlerts) {
    return (
      <Card className="border border-danger/20 bg-danger-50/60">
        <CardBody className="p-6"><h1 className="text-xl font-semibold text-danger">缺少告警查看权限</h1></CardBody>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">告警管理</h1>
          <p className="mt-0.5 text-sm text-default-500">配置监控告警规则，查看告警日志</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={tab === 'rules' ? 'solid' : 'flat'} color="primary" onPress={() => setTab('rules')}>规则</Button>
          <Button size="sm" variant={tab === 'logs' ? 'solid' : 'flat'} color="primary" onPress={() => setTab('logs')}>日志</Button>
          <Button size="sm" variant="flat" onPress={() => navigate('/notification')}>通知中心</Button>
          <Button size="sm" variant="flat" onPress={() => navigate('/monitor')}>诊断看板</Button>
        </div>
      </div>

      {tab === 'rules' && (
        <>
          <div className="flex justify-end">
            {canCreateAlerts && (
            <Button size="sm" color="primary" onPress={openCreate}>新建规则</Button>
            )}
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
                <div key={rule.id} className={`rounded-xl border p-3 flex flex-wrap sm:flex-nowrap items-center gap-3 ${rule.enabled ? 'border-divider/60 bg-content1' : 'border-divider/40 bg-default-50 opacity-60'}`}>
                  <Switch size="sm" isSelected={rule.enabled === 1} isDisabled={!canUpdateAlerts} onValueChange={() => handleToggle(rule.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="font-semibold text-sm">{rule.name}</span>
                      <Chip size="sm" variant="flat" color={SEVERITIES.find(s => s.value === rule.severity)?.color || 'warning'} className="h-5 text-[10px]">
                        {SEVERITIES.find(s => s.value === rule.severity)?.label || '警告'}
                      </Chip>
                      <Chip size="sm" variant="flat" color={rule.metric === 'offline' ? 'danger' : rule.metric === 'expiry' ? 'warning' : rule.metric === 'traffic_quota' ? 'secondary' : rule.metric === 'forward_health' ? 'danger' : 'primary'} className="h-5 text-[10px]">
                        {METRICS.find(m => m.value === rule.metric)?.label || rule.metric}
                      </Chip>
                      {rule.metric === 'expiry' ? (
                        <span className="text-xs font-mono text-default-500">&le; {rule.threshold} 天</span>
                      ) : rule.metric === 'traffic_quota' ? (
                        <span className="text-xs font-mono text-default-500">&ge; {rule.threshold}%</span>
                      ) : rule.metric === 'forward_health' ? (
                        <span className="text-xs font-mono text-default-500">&lt; {rule.threshold}%</span>
                      ) : rule.metric !== 'offline' ? (
                        <span className="text-xs font-mono text-default-500">
                          {OPERATORS.find(o => o.value === rule.operator)?.label || rule.operator} {rule.threshold}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-default-400 mt-0.5">
                      范围: {SCOPE_TYPES.find(s => s.value === rule.scopeType)?.label || rule.scopeType}
                      {rule.scopeValue ? ` (${rule.scopeValue})` : ''}
                      {' · '}通知: {NOTIFY_TYPES.find(n => n.value === rule.notifyType)?.label || rule.notifyType}
                      {rule.probeCondition && rule.probeCondition !== 'any' ? ` · 探针: ${PROBE_CONDITIONS.find(p => p.value === rule.probeCondition)?.label || rule.probeCondition}` : ''}
                      {rule.durationSeconds && rule.durationSeconds > 0 ? ` · 持续: ${rule.durationSeconds}秒` : ''}
                      {' · '}冷却: {rule.cooldownMinutes}分钟
                      {rule.escalateAfterMinutes ? ` · 升级: ${rule.escalateAfterMinutes}分钟后` : ''}
                      {rule.lastTriggeredAt ? ` · 上次触发: ${formatTime(rule.lastTriggeredAt)}` : ''}
                    </p>
                  </div>
                  {(canUpdateAlerts || canDeleteAlerts) && (
                    <div className="flex gap-1 ml-auto sm:ml-0">
                      {canUpdateAlerts && <Button size="sm" variant="flat" onPress={() => openEdit(rule)}>编辑</Button>}
                      {canDeleteAlerts && <Button size="sm" variant="flat" color="danger" onPress={() => handleDelete(rule.id)}>删除</Button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'logs' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-default-500">共 {logsTotal} 条告警记录</p>
            <div className="flex gap-2">
              <Button size="sm" variant="flat" onPress={() => fetchLogs(logsPage)}>刷新</Button>
              {canDeleteAlerts && (
                <Button size="sm" variant="flat" color="danger" onPress={async () => {
                  if (!confirm('确定清除所有告警日志？')) return;
                  await clearAlertLogs();
                  toast.success('已清除');
                  fetchLogs(1);
                }}>清除全部</Button>
              )}
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
      <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
        <ModalContent>
          {editRule && (
            <>
              <ModalHeader className="pb-2">{editRule.id ? '编辑告警规则' : '新建告警规则'}</ModalHeader>
              <ModalBody className="space-y-4">

                {/* === Section 1: 触发条件 === */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-default-400">触发条件</p>

                  <div className="flex gap-2">
                    <Input label="规则名称" size="sm" className="flex-1"
                      isRequired
                      value={editRule.name || ''}
                      onValueChange={v => updateField({ name: v })} />
                    <Select label="严重等级" size="sm" className="w-32"
                      disallowEmptySelection
                      selectedKeys={[editRule.severity || 'warning']}
                      onSelectionChange={keys => updateField({ severity: Array.from(keys)[0] as string })}>
                      {SEVERITIES.map(s => <SelectItem key={s.value}>{s.label}</SelectItem>)}
                    </Select>
                  </div>

                  <Select label="监控指标" size="sm"
                    isRequired
                    disallowEmptySelection
                    selectedKeys={editRule.metric ? [editRule.metric] : []}
                    onSelectionChange={keys => handleMetricChange(Array.from(keys)[0] as string)}>
                    {METRICS.map(m => <SelectItem key={m.value}>{m.label}</SelectItem>)}
                  </Select>

                  {/* Threshold row — varies by metric */}
                  {editRule.metric && FIXED_OPERATOR_METRICS[editRule.metric] ? (
                    <Input label={FIXED_OPERATOR_METRICS[editRule.metric].label} size="sm"
                      inputMode="decimal"
                      description={FIXED_OPERATOR_METRICS[editRule.metric].description}
                      value={editRule.threshold != null ? String(editRule.threshold) : ''}
                      onValueChange={v => updateField({ threshold: parseNum(v), operator: FIXED_OPERATOR_METRICS[editRule.metric!].operator })} />
                  ) : !NO_THRESHOLD_METRICS.includes(editRule.metric || '') ? (
                    <div className="flex gap-2">
                      <Select label="操作符" size="sm" className="w-24"
                        disallowEmptySelection
                        selectedKeys={[editRule.operator || 'gt']}
                        onSelectionChange={keys => updateField({ operator: Array.from(keys)[0] as string })}>
                        {OPERATORS.map(o => <SelectItem key={o.value}>{o.label}</SelectItem>)}
                      </Select>
                      <Input label="阈值" size="sm" className="flex-1"
                        inputMode="decimal"
                        value={editRule.threshold != null ? String(editRule.threshold) : ''}
                        onValueChange={v => updateField({ threshold: parseNum(v) })} />
                      {!NO_DURATION_METRICS.includes(editRule.metric || '') && (
                        <Input label="持续 (秒)" size="sm" className="w-28"
                          inputMode="numeric"
                          description="0=立即"
                          value={String(editRule.durationSeconds ?? 0)}
                          onValueChange={v => updateField({ durationSeconds: parseNum(v, 0) ?? 0 })} />
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-default-400 bg-default-50 rounded-lg p-2">
                      节点离线时自动触发告警，无需配置阈值。
                    </p>
                  )}
                </div>

                <Divider />

                {/* === Section 2: 监控范围 === */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-default-400">监控范围</p>
                  <div className="flex gap-2">
                    <Select label="范围" size="sm" className="flex-1"
                      disallowEmptySelection
                      selectedKeys={[editRule.scopeType || 'all']}
                      onSelectionChange={keys => updateField({ scopeType: Array.from(keys)[0] as string })}>
                      {SCOPE_TYPES.map(s => <SelectItem key={s.value}>{s.label}</SelectItem>)}
                    </Select>

                    {editRule.scopeType && editRule.scopeType !== 'all' && (
                      <Input label={editRule.scopeType === 'tag' ? '标签名' : '节点 ID'} size="sm" className="flex-1"
                        value={editRule.scopeValue || ''}
                        onValueChange={v => updateField({ scopeValue: v })} />
                    )}

                    {metricNeedsProbe && (
                      <Select label="探针" size="sm" className="w-36"
                        disallowEmptySelection
                        selectedKeys={[editRule.probeCondition || 'any']}
                        onSelectionChange={keys => updateField({ probeCondition: Array.from(keys)[0] as string })}>
                        {PROBE_CONDITIONS.map(p => <SelectItem key={p.value}>{p.label}</SelectItem>)}
                      </Select>
                    )}
                  </div>
                </div>

                <Divider />

                {/* === Section 3: 通知与冷却 === */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-default-400">通知设置</p>
                  <div className="flex gap-2">
                    <Select label="通知方式" size="sm" className="flex-1"
                      disallowEmptySelection
                      selectedKeys={[editRule.notifyType || 'log']}
                      onSelectionChange={keys => updateField({ notifyType: Array.from(keys)[0] as string })}>
                      {NOTIFY_TYPES.map(n => <SelectItem key={n.value}>{n.label}</SelectItem>)}
                    </Select>
                    <Input label="冷却 (分钟)" size="sm" className="w-28"
                      inputMode="numeric"
                      value={String(editRule.cooldownMinutes ?? 5)}
                      onValueChange={v => updateField({ cooldownMinutes: parseNum(v, 5) ?? 5 })} />
                    <Input label="升级 (分钟)" size="sm" className="w-28"
                      inputMode="numeric"
                      placeholder="不升级"
                      description="持续触发后自动升级等级"
                      value={editRule.escalateAfterMinutes ? String(editRule.escalateAfterMinutes) : ''}
                      onValueChange={v => updateField({ escalateAfterMinutes: parseNum(v) })} />
                  </div>

                  {editRule.notifyType === 'webhook' && (
                    <Input label="Webhook URL" size="sm" placeholder="https://..."
                      value={editRule.notifyTarget || ''}
                      onValueChange={v => updateField({ notifyTarget: v })} />
                  )}

                  {editRule.notifyType === 'wechat' && (
                    <p className="text-xs text-default-400 bg-default-50 rounded-lg p-2">
                      将使用系统配置中的企业微信 Webhook 地址发送告警通知。
                      前往「网站配置 → 告警通知」中设置 Webhook URL。
                    </p>
                  )}
                </div>

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
