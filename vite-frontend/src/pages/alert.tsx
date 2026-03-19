import { useEffect, useState, useCallback } from 'react';
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Divider } from "@heroui/divider";
import { Switch } from "@heroui/switch";
import { Select, SelectItem, SelectSection } from "@heroui/select";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure
} from "@heroui/modal";
import toast from 'react-hot-toast';

import {
  AlertRule, AlertRuleGroup, ScopeOptions,
  getAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, toggleAlertRule,
  getAlertGroups, createAlertGroup, updateAlertGroup, deleteAlertGroup, batchUpdateGroupRules,
  getScopeOptions, getAlertLogs,
} from '@/api';
import { hasPermission } from '@/utils/auth';
import { ChannelsTab, PoliciesTab } from './notification';

const METRIC_CATEGORIES = [
  {
    label: '基础设施', category: 'infra',
    metrics: [
      { value: 'cpu', label: 'CPU 使用率 (%)', needsProbe: true, needsScope: true },
      { value: 'mem', label: '内存使用率 (%)', needsProbe: true, needsScope: true },
      { value: 'disk', label: '磁盘使用率 (%)', needsProbe: true, needsScope: true },
      { value: 'swap', label: 'Swap 使用率 (%)', needsProbe: true, needsScope: true },
      { value: 'net_in', label: '入站流量 (B/s)', needsProbe: true, needsScope: true },
      { value: 'net_out', label: '出站流量 (B/s)', needsProbe: true, needsScope: true },
      { value: 'load', label: '系统负载 (1min)', needsProbe: true, needsScope: true },
      { value: 'temperature', label: '温度 (°C)', needsProbe: true, needsScope: true },
      { value: 'connections', label: 'TCP 连接数', needsProbe: true, needsScope: true },
    ],
  },
  {
    label: '连通性', category: 'connectivity',
    metrics: [
      { value: 'offline', label: '节点离线', needsProbe: true, needsScope: true },
      { value: 'forward_health', label: '转发健康度', needsProbe: false, needsScope: false },
      { value: 'probe_stale', label: '探针断联 (分钟)', needsProbe: false, needsScope: false },
    ],
  },
  {
    label: '资源', category: 'resource',
    metrics: [
      { value: 'expiry', label: '到期提醒 (剩余天数)', needsProbe: false, needsScope: true },
      { value: 'traffic_quota', label: '流量配额 (已用%)', needsProbe: false, needsScope: true },
      { value: 'xui_client_expiry', label: 'XUI 客户端到期 (剩余天数)', needsProbe: false, needsScope: false },
      { value: 'xui_client_traffic', label: 'XUI 客户端流量 (已用%)', needsProbe: false, needsScope: false },
    ],
  },
];
const METRICS = METRIC_CATEGORIES.flatMap(c => c.metrics);

const OPERATORS = [
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'eq', label: '=' },
];


const PROBE_CONDITIONS = [
  { value: 'both', label: '全部探针（所有探针异常才触发）' },
  { value: 'any', label: '任意探针（任一异常即触发）' },
  { value: 'komari', label: '仅 Komari' },
  { value: 'pika', label: '仅 Pika' },
];

const SEVERITIES = [
  { value: 'info', label: '提示', color: 'primary' as const },
  { value: 'warning', label: '警告', color: 'warning' as const },
  { value: 'critical', label: '严重', color: 'danger' as const },
];

// Metrics that don't need threshold input
const NO_THRESHOLD_METRICS = ['offline'];
// Metrics that don't need duration
const NO_DURATION_METRICS = ['offline', 'expiry', 'traffic_quota', 'forward_health', 'xui_client_expiry'];
// Metrics with fixed operator (auto-set)
const FIXED_OPERATOR_METRICS: Record<string, { operator: string; label: string; defaultThreshold: number; description: string }> = {
  expiry: { operator: 'lte', label: '提前提醒天数', defaultThreshold: 7, description: '剩余天数 <= 此值时触发（已过期也触发）' },
  traffic_quota: { operator: 'gte', label: '流量使用率 (%)', defaultThreshold: 80, description: '已用百分比 >= 此值时触发' },
  forward_health: { operator: 'lt', label: '健康度阈值 (%)', defaultThreshold: 60, description: '健康度低于此值时触发（100=完美）' },
  probe_stale: { operator: 'gte', label: '断联阈值 (分钟)', defaultThreshold: 10, description: '探针未同步超过此时间触发' },
  xui_client_expiry: { operator: 'lte', label: '提前提醒天数', defaultThreshold: 7, description: '剩余天数 <= 此值时触发（已过期也触发）' },
  xui_client_traffic: { operator: 'gte', label: '流量使用率 (%)', defaultThreshold: 80, description: '已用百分比 >= 此值时触发' },
};

/** 从 metric 推导告警类别 */
function metricCategory(metric?: string): { label: string; color: 'primary' | 'danger' | 'warning' } {
  if (!metric) return { label: '基础设施', color: 'primary' };
  switch (metric) {
    case 'offline': case 'forward_health': case 'probe_stale':
      return { label: '连通性', color: 'danger' };
    case 'expiry': case 'traffic_quota': case 'xui_client_expiry': case 'xui_client_traffic':
      return { label: '资源', color: 'warning' };
    default:
      return { label: '基础设施', color: 'primary' };
  }
}


/** Parse numeric input, allowing empty/partial typing */
function parseNum(v: string, fallback?: number): number | undefined {
  if (v === '' || v === '-') return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

export default function AlertPage() {
  const canViewAlerts = hasPermission('alert.read');
  const canCreateAlerts = hasPermission('alert.create');
  const canUpdateAlerts = hasPermission('alert.update');
  const canDeleteAlerts = hasPermission('alert.delete');
  const [activeTab, setActiveTab] = useState<string>('rules');

  // Search state
  const [ruleSearch, setRuleSearch] = useState('');

  // Rules + Groups state
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [groups, setGroups] = useState<AlertRuleGroup[]>([]);
  const [scopeOpts, setScopeOpts] = useState<ScopeOptions | null>(null);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());

  // Edit modal
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editRule, setEditRule] = useState<Partial<AlertRule> | null>(null);

  // Group edit modal
  const { isOpen: isGroupOpen, onOpen: onGroupOpen, onClose: onGroupClose } = useDisclosure();
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDesc, setEditGroupDesc] = useState('');
  const [editGroupId, setEditGroupId] = useState<number | null>(null);

  // Rule log viewer
  const { isOpen: isLogOpen, onOpen: onLogOpen, onClose: onLogClose } = useDisclosure();
  const [, setLogRuleId] = useState<number | null>(null);
  const [logRuleName, setLogRuleName] = useState('');
  const [ruleLogs, setRuleLogs] = useState<any[]>([]);
  const [ruleLogsLoading, setRuleLogsLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setRulesLoading(true);
    try {
      const [rRes, gRes, sRes] = await Promise.all([getAlertRules(), getAlertGroups(), getScopeOptions()]);
      if (rRes.code === 0 && rRes.data) setRules(rRes.data as AlertRule[]);
      if (gRes.code === 0 && gRes.data) setGroups(gRes.data as AlertRuleGroup[]);
      if (sRes.code === 0 && sRes.data) setScopeOpts(sRes.data as ScopeOptions);
    } catch { toast.error('加载告警数据失败'); }
    finally { setRulesLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleGroupCollapse = (gid: number) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  };

  // Batch edit modal
  const { isOpen: isBatchOpen, onOpen: onBatchOpen, onClose: onBatchClose } = useDisclosure();
  const [batchGroupId, setBatchGroupId] = useState<number | null>(null);
  const [batchFields, setBatchFields] = useState<Record<string, any>>({});

  const openBatchEdit = (groupId: number) => {
    setBatchGroupId(groupId);
    setBatchFields({});
    onBatchOpen();
  };

  const handleBatchSave = async () => {
    if (!batchGroupId) return;
    const updates: Record<string, unknown> = {};
    if (batchFields.severity) updates.severity = batchFields.severity;
    if (batchFields.cooldownMinutes != null) updates.cooldownMinutes = batchFields.cooldownMinutes;
    if (batchFields.maxDailySends != null) updates.maxDailySends = batchFields.maxDailySends;
    if (batchFields.durationSeconds != null) updates.durationSeconds = batchFields.durationSeconds;
    if (Object.keys(updates).length === 0) { toast.error('请至少修改一项'); return; }
    try {
      await batchUpdateGroupRules(batchGroupId, updates);
      toast.success('已批量更新');
      onBatchClose();
      fetchAll();
    } catch { toast.error('操作失败'); }
  };

  const handleBatchToggle = async (groupId: number, enabled: number) => {
    try {
      await batchUpdateGroupRules(groupId, { enabled });
      toast.success(enabled ? '已批量启用' : '已批量禁用');
      fetchAll();
    } catch { toast.error('操作失败'); }
  };

  const handleDeleteGroup = async (groupId: number) => {
    try {
      const res = await deleteAlertGroup(groupId);
      if (res.code === 0) { toast.success('已删除规则组'); fetchAll(); }
      else toast.error(res.msg || '删除失败');
    } catch { toast.error('删除失败'); }
  };

  const openGroupCreate = () => {
    setEditGroupId(null);
    setEditGroupName('');
    setEditGroupDesc('');
    onGroupOpen();
  };

  const openGroupEdit = (g: AlertRuleGroup) => {
    setEditGroupId(g.id);
    setEditGroupName(g.name);
    setEditGroupDesc(g.description || '');
    onGroupOpen();
  };

  const handleGroupSave = async () => {
    if (!editGroupName.trim()) { toast.error('组名称不能为空'); return; }
    try {
      if (editGroupId) {
        await updateAlertGroup(editGroupId, editGroupName.trim(), editGroupDesc);
      } else {
        await createAlertGroup(editGroupName.trim(), editGroupDesc);
      }
      toast.success(editGroupId ? '已更新' : '已创建');
      onGroupClose();
      fetchAll();
    } catch { toast.error('操作失败'); }
  };

  // 小红点：追踪规则是否有新日志
  const getViewedTs = (ruleId: number): number => {
    try { return Number(localStorage.getItem(`rule_log_viewed_${ruleId}`) || '0'); } catch { return 0; }
  };
  const markViewed = (ruleId: number) => {
    localStorage.setItem(`rule_log_viewed_${ruleId}`, String(Date.now()));
  };
  const hasNewLogs = (rule: AlertRule): boolean => {
    if (!rule.lastTriggeredAt) return false;
    return rule.lastTriggeredAt > getViewedTs(rule.id);
  };

  const viewRuleLogs = async (ruleId: number, ruleName: string) => {
    setLogRuleId(ruleId);
    setLogRuleName(ruleName);
    setRuleLogs([]);
    setRuleLogsLoading(true);
    markViewed(ruleId);
    onLogOpen();
    try {
      const res = await getAlertLogs(1, 50);
      if (res.code === 0 && res.data) {
        const d = res.data as any;
        const allLogs = d.records || [];
        setRuleLogs(allLogs.filter((l: any) => l.ruleId === ruleId));
      }
    } catch { toast.error('加载日志失败'); }
    finally { setRuleLogsLoading(false); }
  };

  const renderRuleRow = (rule: AlertRule) => {
    const cat = metricCategory(rule.metric);
    const scopeLabel = rule.scopeJson ? (() => {
      try {
        const s = JSON.parse(rule.scopeJson);
        const parts: string[] = [];
        if (s.environment?.length) parts.push(`环境:${s.environment.join('/')}`);
        if (s.provider?.length) parts.push(`厂商:${s.provider.join('/')}`);
        if (s.region?.length) parts.push(`地区:${s.region.join('/')}`);
        if (s.tags?.length) parts.push(`标签:${s.tags.join('/')}`);
        if (s.os?.length) parts.push(`系统:${s.os.join('/')}`);
        return parts.length > 0 ? parts.join(' · ') : '全部节点';
      } catch { return '全部节点'; }
    })() : (rule.scopeType === 'tag' ? `标签:${rule.scopeValue}` : rule.scopeType === 'node' ? `节点:${rule.scopeValue}` : '全部节点');

    return (
      <div key={rule.id} className={`px-3 py-2 flex items-center gap-2 ${rule.enabled ? '' : 'opacity-50'}`}>
        <Switch size="sm" isSelected={rule.enabled === 1} isDisabled={!canUpdateAlerts} onValueChange={() => handleToggle(rule.id)} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-sm font-medium">{rule.name}</span>
            <Chip size="sm" variant="dot" color={cat.color} className="h-4 text-[9px]">{cat.label}</Chip>
            <Chip size="sm" variant="flat" color={SEVERITIES.find(s => s.value === rule.severity)?.color || 'warning'} className="h-4 text-[9px]">
              {SEVERITIES.find(s => s.value === rule.severity)?.label || '警告'}
            </Chip>
            <span className="text-[10px] font-mono text-default-400">
              {METRICS.find(m => m.value === rule.metric)?.label || rule.metric}
              {rule.metric !== 'offline' && ` ${rule.operator || '>'} ${rule.threshold}`}
            </span>
          </div>
          <p className="text-[10px] text-default-400 mt-0.5 truncate">{scopeLabel} · 冷却:{rule.cooldownMinutes}min</p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <div className="relative">
            <Button size="sm" variant="light" onPress={() => viewRuleLogs(rule.id, rule.name)}>日志</Button>
            {hasNewLogs(rule) && <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500" />}
          </div>
          {canUpdateAlerts && <Button size="sm" variant="light" onPress={() => openEdit(rule)}>编辑</Button>}
          {canDeleteAlerts && <Button size="sm" variant="light" color="danger" onPress={() => handleDelete(rule.id)}>删除</Button>}
        </div>
      </div>
    );
  };

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
        fetchAll();
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
      if (res.code === 0) { toast.success('已删除'); fetchAll(); }
      else toast.error(res.msg || '删除失败');
    } catch { toast.error('删除失败'); }
  };

  const handleToggle = async (id: number) => {
    if (!canUpdateAlerts) return;
    try {
      const res = await toggleAlertRule(id);
      if (res.code === 0) fetchAll();
    } catch { toast.error('切换规则状态失败'); }
  };

  const openCreate = () => {
    if (!canCreateAlerts) {
      toast.error('权限不足');
      return;
    }
    setEditRule({
      name: '', metric: 'cpu', operator: 'gt', threshold: 90,
      durationSeconds: 120, scopeType: 'all', scopeJson: '',
      cooldownMinutes: 5, enabled: 1, severity: 'warning',
      probeCondition: 'both', groupId: groups[0]?.id,
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

  // Helper to check if current metric needs probe/scope condition
  const currentMetricDef = editRule?.metric ? METRICS.find(m => m.value === editRule.metric) : null;
  const metricNeedsProbe = currentMetricDef?.needsProbe ?? true;
  const metricNeedsScope = currentMetricDef?.needsScope ?? true;

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
          <p className="mt-0.5 text-sm text-default-500">配置告警规则、通知渠道和策略</p>
        </div>
        <div className="flex gap-1 bg-default-100 rounded-lg p-0.5">
          {[
            { key: 'rules', label: '告警规则' },
            { key: 'channels', label: '通知渠道' },
            { key: 'policies', label: '通知策略' },
          ].map(t => (
            <button key={t.key}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                activeTab === t.key
                  ? 'bg-white dark:bg-default-200 font-medium shadow-sm'
                  : 'text-default-500 hover:text-default-700'
              }`}
              onClick={() => setActiveTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'rules' && (<>
          <div className="flex items-center gap-2">
            <Input size="sm" placeholder="搜索规则名称…" className="max-w-xs"
              value={ruleSearch} onValueChange={setRuleSearch}
              isClearable onClear={() => setRuleSearch('')} />
            <div className="ml-auto flex gap-2">
              {canCreateAlerts && <Button size="sm" variant="flat" onPress={openGroupCreate}>新建组</Button>}
              {canCreateAlerts && <Button size="sm" color="primary" onPress={openCreate}>新建规则</Button>}
            </div>
          </div>

          {rulesLoading ? (
            <div className="flex h-40 items-center justify-center"><Spinner size="lg" /></div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider/60 p-12 text-center">
              <h3 className="text-base font-semibold text-default-600">暂无告警规则</h3>
              <p className="mt-2 text-sm text-default-400">系统将在首次启动时自动创建默认规则组，请刷新页面。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 按组显示规则 */}
              {groups.map(group => {
                const groupRules = rules.filter(r => r.groupId === group.id)
                  .filter(r => !ruleSearch || r.name.toLowerCase().includes(ruleSearch.toLowerCase()));
                const collapsed = collapsedGroups.has(group.id);
                if (groupRules.length === 0 && ruleSearch) return null;
                return (
                  <div key={group.id} className="rounded-xl border border-divider/60 overflow-hidden">
                    {/* 组标题栏 */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-default-50 cursor-pointer"
                      onClick={() => toggleGroupCollapse(group.id)}>
                      <span className="text-xs text-default-400">{collapsed ? '▶' : '▼'}</span>
                      <span className="font-semibold text-sm">{group.name}</span>
                      {group.isDefault === 1 && <Chip size="sm" variant="flat" color="secondary" className="h-4 text-[9px]">推荐模板</Chip>}
                      <span className="text-xs text-default-400">({groupRules.length} 条)</span>
                      {group.description && <span className="text-xs text-default-400 hidden sm:inline">— {group.description}</span>}
                      <div className="ml-auto flex gap-1" onClick={e => e.stopPropagation()}>
                        {canUpdateAlerts && <Button size="sm" variant="light" onPress={() => openGroupEdit(group)}>编辑</Button>}
                        {canUpdateAlerts && <Button size="sm" variant="light" onPress={() => openBatchEdit(group.id)}>批量配置</Button>}
                        {canUpdateAlerts && <Button size="sm" variant="light" onPress={() => handleBatchToggle(group.id, 1)}>启用</Button>}
                        {canUpdateAlerts && <Button size="sm" variant="light" onPress={() => handleBatchToggle(group.id, 0)}>禁用</Button>}
                        {canDeleteAlerts && group.isDefault !== 1 && <Button size="sm" variant="light" color="danger" onPress={() => handleDeleteGroup(group.id)}>删除组</Button>}
                      </div>
                    </div>
                    {/* 组内规则 */}
                    {!collapsed && (
                      <div className="divide-y divide-divider/40">
                        {groupRules.map(rule => renderRuleRow(rule))}
                        {groupRules.length === 0 && <p className="text-xs text-default-400 p-3">此组暂无规则</p>}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 未分组规则 */}
              {(() => {
                const ungrouped = rules.filter(r => !r.groupId)
                  .filter(r => !ruleSearch || r.name.toLowerCase().includes(ruleSearch.toLowerCase()));
                if (ungrouped.length === 0) return null;
                return (
                  <div className="rounded-xl border border-divider/40 overflow-hidden">
                    <div className="px-3 py-2 bg-default-50">
                      <span className="font-semibold text-sm text-default-500">未分组 ({ungrouped.length})</span>
                    </div>
                    <div className="divide-y divide-divider/40">
                      {ungrouped.map(rule => renderRuleRow(rule))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
      </>)}

      {activeTab === 'channels' && <ChannelsTab />}
      {activeTab === 'policies' && <PoliciesTab />}

      {/* Edit/Create Rule Modal — 紧凑布局 */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
        <ModalContent>
          {editRule && (
            <>
              <ModalHeader className="pb-1 text-base">{editRule.id ? '编辑告警规则' : '新建告警规则'}</ModalHeader>
              <ModalBody className="space-y-3 text-sm">

                {/* 行 1：规则组 + 名称 + 等级 */}
                <div className="flex gap-2">
                  <Select label="规则组" size="sm" className="w-40"
                    selectedKeys={editRule.groupId ? [String(editRule.groupId)] : []}
                    onSelectionChange={keys => { const v = Array.from(keys)[0] as string; updateField({ groupId: v ? Number(v) : undefined }); }}>
                    {groups.map(g => <SelectItem key={String(g.id)}>{g.name}</SelectItem>)}
                  </Select>
                  <Input label="规则名称" size="sm" className="flex-1" isRequired
                    value={editRule.name || ''} onValueChange={v => updateField({ name: v })} />
                  <Select label="等级" size="sm" className="w-24" disallowEmptySelection
                    selectedKeys={[editRule.severity || 'warning']}
                    onSelectionChange={keys => updateField({ severity: Array.from(keys)[0] as string })}>
                    {SEVERITIES.map(s => <SelectItem key={s.value}>{s.label}</SelectItem>)}
                  </Select>
                </div>

                {/* 行 2：指标 + 阈值 */}
                <div className="flex gap-2">
                  <Select label="监控指标" size="sm" className="flex-1" isRequired disallowEmptySelection
                    selectedKeys={editRule.metric ? [editRule.metric] : []}
                    onSelectionChange={keys => handleMetricChange(Array.from(keys)[0] as string)}>
                    {METRIC_CATEGORIES.map(cat => (
                      <SelectSection key={cat.category} title={cat.label}>
                        {cat.metrics.map(m => <SelectItem key={m.value}>{m.label}</SelectItem>)}
                      </SelectSection>
                    ))}
                  </Select>
                  {editRule.metric && FIXED_OPERATOR_METRICS[editRule.metric] ? (
                    <Input label={FIXED_OPERATOR_METRICS[editRule.metric].label} size="sm" className="w-32"
                      inputMode="decimal"
                      value={editRule.threshold != null ? String(editRule.threshold) : ''}
                      onValueChange={v => updateField({ threshold: parseNum(v), operator: FIXED_OPERATOR_METRICS[editRule.metric!].operator })} />
                  ) : !NO_THRESHOLD_METRICS.includes(editRule.metric || '') ? (<>
                    <Select label="比较" size="sm" className="w-20" disallowEmptySelection
                      selectedKeys={[editRule.operator || 'gt']}
                      onSelectionChange={keys => updateField({ operator: Array.from(keys)[0] as string })}>
                      {OPERATORS.map(o => <SelectItem key={o.value}>{o.label}</SelectItem>)}
                    </Select>
                    <Input label="阈值" size="sm" className="w-24" inputMode="decimal"
                      value={editRule.threshold != null ? String(editRule.threshold) : ''}
                      onValueChange={v => updateField({ threshold: parseNum(v) })} />
                  </>) : null}
                </div>

                {/* 行 3：持续时间 + 冷却 + 升级 */}
                <div className="flex gap-2">
                  {!NO_DURATION_METRICS.includes(editRule.metric || '') && (
                    <Input label="持续触发(秒)" size="sm" className="flex-1" inputMode="numeric"
                      description="连续异常多久才告警"
                      value={String(editRule.durationSeconds ?? 120)}
                      onValueChange={v => updateField({ durationSeconds: parseNum(v, 120) ?? 120 })} />
                  )}
                  <Input label="冷却(分钟)" size="sm" className="flex-1" inputMode="numeric"
                    description="同规则再次触发间隔"
                    value={String(editRule.cooldownMinutes ?? 5)}
                    onValueChange={v => updateField({ cooldownMinutes: parseNum(v, 5) ?? 5 })} />
                  <Input label="每日上限" size="sm" className="flex-1" inputMode="numeric"
                    description="每天最多推送次数,0=不限"
                    value={String((editRule as any).maxDailySends ?? 10)}
                    onValueChange={v => updateField({ maxDailySends: parseNum(v, 10) ?? 10 } as any)} />
                </div>
                <p className="text-[10px] text-default-300">渐进冷却：连续触发时冷却时间自动翻倍（30min→1h→2h→...→24h），恢复后重置</p>

                <Divider className="my-1" />

                {/* 监控范围 */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-default-500">监控范围 <span className="text-default-300 font-normal">（维度间 AND，维度内 OR。留空=全部节点）</span></p>
                  {metricNeedsScope ? (<>
                    {scopeOpts && (() => {
                      let scopeObj: Record<string, string[]> = {};
                      try { if (editRule.scopeJson) scopeObj = JSON.parse(editRule.scopeJson); } catch {}
                      const updateScope = (key: string, values: string[]) => {
                        const next = { ...scopeObj, [key]: values.filter(Boolean) };
                        Object.keys(next).forEach(k => { if (!next[k]?.length) delete next[k]; });
                        updateField({ scopeJson: Object.keys(next).length > 0 ? JSON.stringify(next) : '' });
                      };
                      const dims = [
                        { key: 'environment', label: '环境', options: scopeOpts.environments },
                        { key: 'provider', label: '厂商', options: scopeOpts.providers },
                        { key: 'region', label: '地区', options: scopeOpts.regions },
                        { key: 'tags', label: '标签', options: scopeOpts.tags },
                        { key: 'os', label: '系统', options: scopeOpts.osList },
                      ];
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {dims.map(d => d.options.length > 0 && (
                            <div key={d.key} className="space-y-0.5">
                              <p className="text-[10px] text-default-400">{d.label}</p>
                              <div className="flex flex-wrap gap-1">
                                {d.options.map(opt => {
                                  const selected = scopeObj[d.key] || [];
                                  const isActive = selected.includes(opt);
                                  const count = (scopeOpts as any)?.counts?.[d.key]?.[opt];
                                  return (
                                    <Chip key={opt} size="sm" className="cursor-pointer h-5 text-[10px]"
                                      variant={isActive ? 'solid' : 'bordered'}
                                      color={isActive ? 'primary' : 'default'}
                                      onClick={() => updateScope(d.key, isActive ? selected.filter(v => v !== opt) : [...selected, opt])}>
                                      {opt}{count ? ` (${count})` : ''}
                                    </Chip>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {metricNeedsProbe && (
                      <Select label="探针条件" size="sm" disallowEmptySelection
                        selectedKeys={[editRule.probeCondition || 'both']}
                        onSelectionChange={keys => updateField({ probeCondition: Array.from(keys)[0] as string })}>
                        {PROBE_CONDITIONS.map(p => <SelectItem key={p.value}>{p.label}</SelectItem>)}
                      </Select>
                    )}
                  </>) : (
                    <p className="text-[11px] text-default-400">此指标使用独立数据源，无需选择节点范围。</p>
                  )}
                </div>

              </ModalBody>
              <ModalFooter className="pt-2">
                <Button size="sm" variant="flat" onPress={onClose}>取消</Button>
                <Button size="sm" color="primary" onPress={handleSave}>{editRule.id ? '保存' : '创建'}</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Group Edit Modal */}
      <Modal isOpen={isGroupOpen} onClose={onGroupClose} size="md">
        <ModalContent>
          <ModalHeader>{editGroupId ? '编辑规则组' : '新建规则组'}</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <Input label="组名称" isRequired value={editGroupName} onValueChange={setEditGroupName} />
            <Input label="描述（可选）" value={editGroupDesc} onValueChange={setEditGroupDesc} />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onGroupClose}>取消</Button>
            <Button color="primary" onPress={handleGroupSave}>保存</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Batch Edit Modal */}
      <Modal isOpen={isBatchOpen} onClose={onBatchClose} size="md">
        <ModalContent>
          <ModalHeader>批量配置组内规则</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <p className="text-xs text-default-400">留空的字段不会被修改。修改将应用到该组所有规则。</p>
            <Select label="严重等级" size="sm" placeholder="不修改"
              selectedKeys={batchFields.severity ? [batchFields.severity] : []}
              onSelectionChange={keys => setBatchFields(p => ({ ...p, severity: Array.from(keys)[0] as string || undefined }))}>
              {SEVERITIES.map(s => <SelectItem key={s.value}>{s.label}</SelectItem>)}
            </Select>
            <div className="flex gap-2">
              <Input label="持续触发(秒)" size="sm" className="flex-1" inputMode="numeric" placeholder="不修改"
                value={batchFields.durationSeconds != null ? String(batchFields.durationSeconds) : ''}
                onValueChange={v => setBatchFields(p => ({ ...p, durationSeconds: v ? Number(v) : undefined }))} />
              <Input label="冷却(分钟)" size="sm" className="flex-1" inputMode="numeric" placeholder="不修改"
                value={batchFields.cooldownMinutes != null ? String(batchFields.cooldownMinutes) : ''}
                onValueChange={v => setBatchFields(p => ({ ...p, cooldownMinutes: v ? Number(v) : undefined }))} />
              <Input label="每日上限" size="sm" className="flex-1" inputMode="numeric" placeholder="不修改"
                value={batchFields.maxDailySends != null ? String(batchFields.maxDailySends) : ''}
                onValueChange={v => setBatchFields(p => ({ ...p, maxDailySends: v ? Number(v) : undefined }))} />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="flat" onPress={onBatchClose}>取消</Button>
            <Button size="sm" color="primary" onPress={handleBatchSave}>应用到组内所有规则</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Rule History Log Modal */}
      <Modal isOpen={isLogOpen} onClose={onLogClose} size="xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>规则历史日志 — {logRuleName}</ModalHeader>
          <ModalBody>
            {ruleLogsLoading ? (
              <div className="flex justify-center py-8"><Spinner size="lg" /></div>
            ) : ruleLogs.length === 0 ? (
              <p className="text-center text-default-400 py-8">该规则暂无触发记录</p>
            ) : (
              <div className="space-y-1">
                {ruleLogs.map((log: any) => (
                  <div key={log.id} className="rounded-lg border border-divider/40 p-2 flex items-start gap-2">
                    <Chip size="sm" variant="flat"
                      color={log.notifyStatus === 'sent' ? 'success' : log.notifyStatus === 'failed' ? 'danger' : 'warning'}
                      className="h-5 text-[9px] flex-shrink-0 mt-0.5">
                      {log.notifyStatus === 'sent' ? '已发送' : log.notifyStatus === 'failed' ? '失败' : '记录'}
                    </Chip>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{log.message}</p>
                      <p className="text-[10px] text-default-400 mt-0.5">
                        节点: {log.nodeName || '-'} · {new Date(log.createdTime).toLocaleString('zh-CN', { hour12: false })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onLogClose}>关闭</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
