import { useEffect, useState, useCallback } from 'react';
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Switch } from "@heroui/switch";
import { Select, SelectItem } from "@heroui/select";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell
} from "@heroui/table";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure
} from "@heroui/modal";
import toast from 'react-hot-toast';

import {
  getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead,
  getNotifyChannels, createNotifyChannel, updateNotifyChannel, deleteNotifyChannel, testNotifyChannel,
  getNotifyPolicies, createNotifyPolicy, updateNotifyPolicy, deleteNotifyPolicy,
  getAlertLogs, clearAlertLogs, AlertLog,
  NotificationItem, NotifyChannelItem, NotifyPolicyItem
} from "@/api";
import { hasPermission } from '@/utils/auth';

const CHANNEL_TYPES = [
  { value: 'wechat', label: '企业微信' },
  { value: 'dingtalk', label: '钉钉' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'email', label: 'Email' },
];

interface ChannelField { key: string; label: string; placeholder: string; type?: 'text' | 'password' | 'number'; description?: string; }
const CHANNEL_FIELDS: Record<string, ChannelField[]> = {
  wechat: [
    { key: 'webhookUrl', label: 'Webhook 地址', placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx', description: '企业微信群 → 群设置 → 群机器人 → 添加机器人 → 复制 Webhook 地址' },
  ],
  dingtalk: [
    { key: 'webhookUrl', label: 'Webhook 地址', placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=xxxx', description: '钉钉群 → 群设置 → 智能群助手 → 添加机器人 → 选择自定义 → 复制 Webhook 地址' },
  ],
  telegram: [
    { key: 'token', label: 'Bot Token', placeholder: '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ', description: '通过 @BotFather 创建 Bot 后获取' },
    { key: 'chatId', label: 'Chat ID', placeholder: '-1001234567890', description: '群组或频道的 Chat ID，可通过 @userinfobot 获取' },
  ],
  webhook: [
    { key: 'url', label: 'Webhook URL', placeholder: 'https://your-server.com/webhook/notify', description: '将以 POST JSON 方式推送 { title, text, severity, timestamp }' },
  ],
  email: [
    { key: 'smtpHost', label: 'SMTP 服务器', placeholder: 'smtp.example.com' },
    { key: 'smtpPort', label: 'SMTP 端口', placeholder: '587', type: 'number' },
    { key: 'username', label: '发件人账号', placeholder: 'notify@example.com' },
    { key: 'password', label: '发件人密码', placeholder: '授权码或密码', type: 'password' },
    { key: 'to', label: '收件人', placeholder: 'admin@example.com', description: '多个收件人用逗号分隔' },
  ],
};

function parseConfigJson(json: string | undefined): Record<string, string> {
  try { return json ? JSON.parse(json) : {}; } catch { return {}; }
}
function buildConfigJson(fields: Record<string, string>): string {
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) { if (v) cleaned[k] = v; }
  return JSON.stringify(cleaned, null, 2);
}

const SEVERITY_MAP: Record<string, { label: string; color: "default" | "warning" | "danger" }> = {
  info: { label: '提示', color: 'default' },
  warning: { label: '警告', color: 'warning' },
  critical: { label: '严重', color: 'danger' },
  error: { label: '错误', color: 'danger' },
};

const EVENT_TYPES = [
  { value: 'alert', label: '告警触发' },
  { value: 'alert_recovery', label: '告警恢复' },
  { value: 'daily_summary', label: '每日摘要' },
  { value: 'system', label: '系统事件' },
  { value: 'probe_offline', label: '探针离线' },
  { value: 'expiry', label: '到期提醒' },
  { value: 'expiry_reminder', label: '到期提醒(定时)' },
  { value: 'diagnosis', label: '诊断异常' },
  { value: 'traffic', label: '流量超额' },
];

const SEVERITY_OPTIONS = [
  { value: 'info', label: '提示', color: 'default' as const },
  { value: 'warning', label: '警告', color: 'warning' as const },
  { value: 'critical', label: '严重', color: 'danger' as const },
];

function formatTime(ts?: number | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN');
}

function severityChip(severity: string) {
  const s = SEVERITY_MAP[severity] || SEVERITY_MAP.info;
  return <Chip size="sm" color={s.color} variant="flat">{s.label}</Chip>;
}

// ==================== Notifications Tab ====================
function NotificationsTab() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [readFilter, setReadFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [sevFilter, setSevFilter] = useState<string>('');
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchList = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: any = { page: p, size: 30 };
      if (readFilter === 'unread') params.readStatus = 0;
      else if (readFilter === 'read') params.readStatus = 1;
      if (typeFilter) params.type = typeFilter;
      if (sevFilter) params.severity = sevFilter;
      const res = await getNotifications(params);
      if (res.code === 0 && res.data) {
        const d = res.data as any;
        setItems(d.records || []);
        setTotal(d.total || 0);
        setPage(p);
      }
    } catch { toast.error('加载通知列表失败'); }
    finally { setLoading(false); }
  }, [readFilter, typeFilter, sevFilter]);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await getUnreadCount();
      if (res.code === 0 && res.data) setUnreadCount((res.data as any).count || 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchList(1); }, [fetchList]);
  useEffect(() => { fetchUnread(); }, [fetchUnread]);

  const handleMarkRead = async (id: number) => {
    try {
      const res = await markNotificationRead(id);
      if (res.code === 0) { fetchList(page); fetchUnread(); }
      else toast.error(res.msg || '操作失败');
    } catch { toast.error('操作失败'); }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await markAllNotificationsRead();
      if (res.code === 0) { toast.success('已全部标记为已读'); fetchList(page); fetchUnread(); }
      else toast.error(res.msg || '操作失败');
    } catch { toast.error('操作失败'); }
  };

  // 提取类别和清理标题
  const parseTitle = (title?: string) => {
    if (!title) return { category: null, cleanTitle: '' };
    const prefixes: Record<string, { label: string; color: 'primary' | 'danger' | 'warning' }> = {
      '[基础设施] ': { label: '基础设施', color: 'primary' },
      '[连通性] ': { label: '连通性', color: 'danger' },
      '[资源] ': { label: '资源', color: 'warning' },
    };
    for (const [prefix, meta] of Object.entries(prefixes)) {
      if (title.startsWith(prefix)) return { category: meta, cleanTitle: title.slice(prefix.length) };
    }
    return { category: null, cleanTitle: title };
  };

  const totalPages = Math.max(1, Math.ceil(total / 30));

  return (
    <div className="flex flex-col gap-3">
      {/* 紧凑筛选栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <Select size="sm" className="w-28" aria-label="已读状态" placeholder="已读状态"
          selectedKeys={new Set([readFilter])}
          onSelectionChange={(keys) => setReadFilter(Array.from(keys)[0] as string || 'all')}>
          <SelectItem key="all">全部</SelectItem>
          <SelectItem key="unread">未读</SelectItem>
          <SelectItem key="read">已读</SelectItem>
        </Select>
        <Select size="sm" className="w-32" aria-label="类型" placeholder="全部类型"
          selectedKeys={typeFilter ? new Set([typeFilter]) : new Set([''])}
          onSelectionChange={(keys) => setTypeFilter(Array.from(keys)[0] as string || '')}>
          {[{ value: '', label: '全部类型' }, ...EVENT_TYPES].map(t => (
            <SelectItem key={t.value}>{t.label}</SelectItem>
          ))}
        </Select>
        <Select size="sm" className="w-28" aria-label="级别" placeholder="全部级别"
          selectedKeys={sevFilter ? new Set([sevFilter]) : new Set([''])}
          onSelectionChange={(keys) => setSevFilter(Array.from(keys)[0] as string || '')}>
          <SelectItem key="">全部级别</SelectItem>
          <SelectItem key="critical">严重</SelectItem>
          <SelectItem key="warning">警告</SelectItem>
          <SelectItem key="info">提示</SelectItem>
        </Select>
        <Button size="sm" variant="flat" onPress={() => fetchList(1)}>刷新</Button>
        <Button size="sm" variant="flat" color="warning" onPress={handleMarkAllRead} isDisabled={unreadCount === 0}>
          全部已读{unreadCount > 0 ? ` (${unreadCount})` : ''}
        </Button>
        <span className="text-xs text-default-400 ml-auto">共 {total} 条</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <div className="text-center text-default-400 py-8">暂无通知消息</div>
      ) : (
        <div className="space-y-1">
          {items.map((item) => {
            const { category, cleanTitle } = parseTitle(item.title);
            return (
              <div key={item.id}
                className={`rounded-lg border p-2 px-3 flex items-center gap-2 ${
                  item.readStatus === 0 ? 'border-primary/40 bg-primary-50/30' : 'border-divider/40 opacity-60'
                }`}>
                {/* 左侧未读指示 */}
                {item.readStatus === 0 && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                {/* 中部：类别+标题+标签+内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {category && <Chip size="sm" variant="dot" color={category.color} className="h-4 text-[9px]">{category.label}</Chip>}
                    <span className={`text-sm ${item.readStatus === 0 ? 'font-semibold' : ''}`}>{cleanTitle}</span>
                    {severityChip(item.severity)}
                    {item.type && <Chip size="sm" variant="bordered" className="h-4 text-[9px]">{EVENT_TYPES.find(t => t.value === item.type)?.label || item.type}</Chip>}
                  </div>
                  <p className="text-xs text-default-400 truncate mt-0.5">{item.content}</p>
                </div>
                {/* 右侧：时间 + 操作 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-default-400 whitespace-nowrap">{formatTime(item.createdTime)}</span>
                  {item.readStatus === 0 && (
                    <Button size="sm" variant="flat" color="primary" className="h-6 text-[10px] min-w-0 px-2"
                      onPress={() => handleMarkRead(item.id)}>
                      已读
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button size="sm" variant="flat" isDisabled={page <= 1} onPress={() => fetchList(page - 1)}>上一页</Button>
          <span className="text-xs self-center text-default-400">{page} / {totalPages}</span>
          <Button size="sm" variant="flat" isDisabled={page >= totalPages} onPress={() => fetchList(page + 1)}>下一页</Button>
        </div>
      )}
    </div>
  );
}

// ==================== Channels Tab ====================
export function ChannelsTab() {
  const canCreate = hasPermission('notification.create');
  const canUpdate = hasPermission('notification.update');
  const canDelete = hasPermission('notification.delete');

  const [channels, setChannels] = useState<NotifyChannelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editItem, setEditItem] = useState<Partial<NotifyChannelItem> | null>(null);
  const [testing, setTesting] = useState<number | null>(null);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNotifyChannels();
      if (res.code === 0 && res.data) setChannels(res.data as NotifyChannelItem[]);
    } catch { toast.error('加载通知渠道失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  const openCreate = () => { setEditItem({ type: 'wechat', enabled: 1, configJson: '{}' }); onOpen(); };
  const openEdit = (ch: NotifyChannelItem) => { setEditItem({ ...ch }); onOpen(); };

  const handleSave = async () => {
    if (!editItem?.name || !editItem?.type) { toast.error('请填写名称和类型'); return; }
    try {
      const fn = editItem.id ? updateNotifyChannel : createNotifyChannel;
      const res = await fn(editItem);
      if (res.code === 0) { toast.success(editItem.id ? '已更新' : '已创建'); onClose(); fetchChannels(); }
      else toast.error(res.msg || '操作失败');
    } catch { toast.error('操作失败'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此通知渠道？')) return;
    try {
      const res = await deleteNotifyChannel(id);
      if (res.code === 0) { toast.success('已删除'); fetchChannels(); }
      else toast.error(res.msg || '删除失败');
    } catch { toast.error('删除失败'); }
  };

  const handleTest = async (id: number) => {
    setTesting(id);
    try {
      const res = await testNotifyChannel(id);
      if (res.code === 0) toast.success('测试消息已发送');
      else toast.error(res.msg || '测试失败');
    } catch { toast.error('测试失败'); }
    finally { setTesting(null); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end items-center">
        {canCreate && <Button size="sm" color="primary" onPress={openCreate}>新建渠道</Button>}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <Table aria-label="通知渠道" removeWrapper>
          <TableHeader>
            <TableColumn>名称</TableColumn>
            <TableColumn>类型</TableColumn>
            <TableColumn>启用</TableColumn>
            <TableColumn>创建时间</TableColumn>
            <TableColumn>操作</TableColumn>
          </TableHeader>
          <TableBody emptyContent="暂无渠道">
            {channels.map((ch) => (
              <TableRow key={ch.id}>
                <TableCell>{ch.name}</TableCell>
                <TableCell>
                  <Chip size="sm" variant="flat">
                    {CHANNEL_TYPES.find(t => t.value === ch.type)?.label || ch.type}
                  </Chip>
                </TableCell>
                <TableCell>
                  <Chip size="sm" color={ch.enabled === 1 ? 'success' : 'default'} variant="dot">
                    {ch.enabled === 1 ? '已启用' : '已禁用'}
                  </Chip>
                </TableCell>
                <TableCell className="text-sm text-default-500">{formatTime(ch.createdTime)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {canUpdate && <Button size="sm" variant="light" color="primary" onPress={() => openEdit(ch)}>编辑</Button>}
                    <Button size="sm" variant="light" color="secondary" isLoading={testing === ch.id} onPress={() => handleTest(ch.id)}>测试</Button>
                    {canDelete && <Button size="sm" variant="light" color="danger" onPress={() => handleDelete(ch.id)}>删除</Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalContent>
          <ModalHeader>{editItem?.id ? '编辑渠道' : '新建渠道'}</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <Input
              label="渠道名称"
              value={editItem?.name || ''}
              onValueChange={(v) => setEditItem(prev => ({ ...prev, name: v }))}
            />
            <Select
              label="渠道类型"
              selectedKeys={editItem?.type ? new Set([editItem.type]) : new Set()}
              onSelectionChange={(keys) => {
                const v = Array.from(keys)[0] as string;
                setEditItem(prev => ({ ...prev, type: v, configJson: '{}' }));
              }}
            >
              {CHANNEL_TYPES.map(t => <SelectItem key={t.value}>{t.label}</SelectItem>)}
            </Select>
            <div className="flex items-center gap-2">
              <span className="text-sm">启用</span>
              <Switch
                isSelected={editItem?.enabled === 1}
                onValueChange={(v) => setEditItem(prev => ({ ...prev, enabled: v ? 1 : 0 }))}
              />
            </div>
            {(() => {
              const channelType = editItem?.type || 'webhook';
              const fields = CHANNEL_FIELDS[channelType] || [];
              const configObj = parseConfigJson(editItem?.configJson ?? undefined);
              const updateField = (key: string, value: string) => {
                const updated = { ...configObj, [key]: value };
                setEditItem(prev => ({ ...prev, configJson: buildConfigJson(updated) }));
              };
              return (
                <div className="space-y-3">
                  <p className="text-xs text-default-400">
                    {channelType === 'wechat' && '企业微信群机器人 Webhook 推送'}
                    {channelType === 'dingtalk' && '钉钉自定义机器人 Webhook 推送（Markdown 格式）'}
                    {channelType === 'telegram' && 'Telegram Bot API 推送'}
                    {channelType === 'webhook' && '通用 HTTP POST JSON 推送'}
                    {channelType === 'email' && 'SMTP 邮件发送（暂未完整实现）'}
                  </p>
                  {fields.map((f) => (
                    <div key={f.key}>
                      <Input
                        size="sm"
                        label={f.label}
                        placeholder={f.placeholder}
                        type={f.type || 'text'}
                        value={configObj[f.key] || ''}
                        onValueChange={(v) => updateField(f.key, v)}
                      />
                      {f.description && <p className="text-[11px] text-default-400 mt-0.5 ml-1">{f.description}</p>}
                    </div>
                  ))}
                </div>
              );
            })()}
            <Input
              label="每分钟最大通知数"
              placeholder="0 = 不限制"
              type="number"
              value={String(editItem?.rateLimitPerMinute ?? 0)}
              onValueChange={(v) => setEditItem(prev => ({ ...prev, rateLimitPerMinute: parseInt(v) || 0 }))}
              description="防止批量告警轰炸，超过限制的通知将被跳过（站内通知不受影响）"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>取消</Button>
            <Button color="primary" onPress={handleSave}>保存</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

// ==================== Policies Tab ====================
export function PoliciesTab() {
  const canCreate = hasPermission('notification.create');
  const canUpdate = hasPermission('notification.update');
  const canDelete = hasPermission('notification.delete');

  const [policies, setPolicies] = useState<NotifyPolicyItem[]>([]);
  const [channels, setChannels] = useState<NotifyChannelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editItem, setEditItem] = useState<Partial<NotifyPolicyItem> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([getNotifyPolicies(), getNotifyChannels()]);
      if (pRes.code === 0 && pRes.data) setPolicies(pRes.data as NotifyPolicyItem[]);
      if (cRes.code === 0 && cRes.data) setChannels(cRes.data as NotifyChannelItem[]);
    } catch { toast.error('加载通知策略失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => { setEditItem({ enabled: 1 }); onOpen(); };
  const openEdit = (p: NotifyPolicyItem) => { setEditItem({ ...p }); onOpen(); };

  const handleSave = async () => {
    if (!editItem?.name) { toast.error('请填写策略名称'); return; }
    try {
      const fn = editItem.id ? updateNotifyPolicy : createNotifyPolicy;
      const res = await fn(editItem);
      if (res.code === 0) { toast.success(editItem.id ? '已更新' : '已创建'); onClose(); fetchData(); }
      else toast.error(res.msg || '操作失败');
    } catch { toast.error('操作失败'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此通知策略？')) return;
    try {
      const res = await deleteNotifyPolicy(id);
      if (res.code === 0) { toast.success('已删除'); fetchData(); }
      else toast.error(res.msg || '删除失败');
    } catch { toast.error('删除失败'); }
  };

  const channelName = (ids?: string | null) => {
    if (!ids) return '-';
    return ids.split(',').map(id => {
      const ch = channels.find(c => c.id === Number(id.trim()));
      return ch?.name || id;
    }).join(', ');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end items-center">
        {canCreate && <Button size="sm" color="primary" onPress={openCreate}>新建策略</Button>}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <Table aria-label="通知策略" removeWrapper>
          <TableHeader>
            <TableColumn>名称</TableColumn>
            <TableColumn>启用</TableColumn>
            <TableColumn>事件类型</TableColumn>
            <TableColumn>严重级别</TableColumn>
            <TableColumn>路由</TableColumn>
            <TableColumn>通知渠道</TableColumn>
            <TableColumn>操作</TableColumn>
          </TableHeader>
          <TableBody emptyContent="暂无策略">
            {policies.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.name}</TableCell>
                <TableCell>
                  <Chip size="sm" color={p.enabled === 1 ? 'success' : 'default'} variant="dot">
                    {p.enabled === 1 ? '已启用' : '已禁用'}
                  </Chip>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {p.eventTypes ? p.eventTypes.split(',').map((e, i) => {
                      const et = EVENT_TYPES.find(t => t.value === e.trim());
                      return <Chip key={i} size="sm" variant="flat">{et?.label || e.trim()}</Chip>;
                    }) : '-'}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {p.severityFilter ? p.severityFilter.split(',').map((s, i) => {
                      const sv = SEVERITY_MAP[s.trim()] || SEVERITY_MAP.info;
                      return <Chip key={i} size="sm" color={sv.color} variant="flat">{sv.label}</Chip>;
                    }) : <span className="text-default-400">全部</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    {p.categoryFilter ? p.categoryFilter.split(',').map((c, i) => {
                      const label = c.trim() === 'infra' ? '基础设施' : c.trim() === 'connectivity' ? '连通性' : c.trim() === 'resource' ? '资源' : c.trim();
                      return <Chip key={i} size="sm" variant="flat" className="h-4 text-[9px]">{label}</Chip>;
                    }) : null}
                    {p.tagFilter ? <Chip size="sm" variant="bordered" className="h-4 text-[9px]">标签: {p.tagFilter}</Chip> : null}
                    {p.muteSchedule ? <Chip size="sm" variant="flat" color="default" className="h-4 text-[9px]">静默 {p.muteSchedule}</Chip> : null}
                    {p.includeRecovery === 0 ? <Chip size="sm" variant="flat" color="warning" className="h-4 text-[9px]">不含恢复</Chip> : null}
                    {!p.categoryFilter && !p.tagFilter && !p.muteSchedule && p.includeRecovery !== 0 ? <span className="text-default-400">-</span> : null}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{channelName(p.channelIds)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {canUpdate && <Button size="sm" variant="light" color="primary" onPress={() => openEdit(p)}>编辑</Button>}
                    {canDelete && <Button size="sm" variant="light" color="danger" onPress={() => handleDelete(p.id)}>删除</Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalContent>
          <ModalHeader>{editItem?.id ? '编辑策略' : '新建策略'}</ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <p className="text-xs text-default-400 bg-default-50 rounded-lg p-2">
              匹配规则：事件类型 <strong>且</strong> 严重级别 <strong>且</strong> 告警类别 <strong>且</strong> 标签 全部满足时才发送到渠道。留空的条件视为「全部匹配」。
            </p>
            <Input
              label="策略名称"
              value={editItem?.name || ''}
              onValueChange={(v) => setEditItem(prev => ({ ...prev, name: v }))}
            />
            <div className="flex items-center gap-2">
              <span className="text-sm">启用</span>
              <Switch
                isSelected={editItem?.enabled === 1}
                onValueChange={(v) => setEditItem(prev => ({ ...prev, enabled: v ? 1 : 0 }))}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-default-700 mb-2">事件类型</p>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map(et => {
                  const selected = (editItem?.eventTypes || '').split(',').map(s => s.trim()).filter(Boolean);
                  const isActive = selected.includes(et.value);
                  return (
                    <Chip key={et.value} size="sm" variant={isActive ? 'solid' : 'bordered'}
                      color={isActive ? 'primary' : 'default'}
                      className="cursor-pointer"
                      onClick={() => {
                        const next = isActive ? selected.filter(v => v !== et.value) : [...selected, et.value];
                        setEditItem(prev => ({ ...prev, eventTypes: next.join(',') }));
                      }}>
                      {et.label}
                    </Chip>
                  );
                })}
              </div>
              <p className="text-[11px] text-default-400 mt-1.5">选择需要触发此策略的事件类型，可多选</p>
            </div>
            <div>
              <p className="text-sm font-medium text-default-700 mb-2">严重级别筛选</p>
              <div className="flex flex-wrap gap-2">
                {SEVERITY_OPTIONS.map(sv => {
                  const selected = (editItem?.severityFilter || '').split(',').map(s => s.trim()).filter(Boolean);
                  const isActive = selected.includes(sv.value);
                  return (
                    <Chip key={sv.value} size="sm" variant={isActive ? 'solid' : 'bordered'}
                      color={isActive ? sv.color : 'default'}
                      className="cursor-pointer"
                      onClick={() => {
                        const next = isActive ? selected.filter(v => v !== sv.value) : [...selected, sv.value];
                        setEditItem(prev => ({ ...prev, severityFilter: next.join(',') }));
                      }}>
                      {sv.label}
                    </Chip>
                  );
                })}
              </div>
              <p className="text-[11px] text-default-400 mt-1.5">不选则匹配所有级别。不同级别可关联不同策略实现分级通知</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">包含恢复通知</p>
                <p className="text-[11px] text-default-400">关闭后，告警恢复时不再推送到外部渠道（站内通知照常记录）</p>
              </div>
              <Switch
                isSelected={editItem?.includeRecovery !== 0}
                onValueChange={(v) => setEditItem(prev => ({ ...prev, includeRecovery: v ? 1 : 0 }))}
              />
            </div>
            {/* 告警类别过滤 */}
            <div>
              <p className="text-sm font-medium text-default-700 mb-2">告警类别</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'infra', label: '基础设施' },
                  { value: 'connectivity', label: '连通性' },
                  { value: 'resource', label: '资源' },
                ].map(cat => {
                  const selected = (editItem?.categoryFilter || '').split(',').map(s => s.trim()).filter(Boolean);
                  const isActive = selected.includes(cat.value);
                  return (
                    <Chip key={cat.value} size="sm" variant={isActive ? 'solid' : 'bordered'}
                      color={isActive ? 'primary' : 'default'}
                      className="cursor-pointer"
                      onClick={() => {
                        const next = isActive ? selected.filter(v => v !== cat.value) : [...selected, cat.value];
                        setEditItem(prev => ({ ...prev, categoryFilter: next.join(',') }));
                      }}>
                      {cat.label}
                    </Chip>
                  );
                })}
              </div>
              <p className="text-[11px] text-default-400 mt-1.5">不选则匹配所有类别</p>
            </div>

            {/* 标签过滤 */}
            <Input
              label="标签过滤"
              placeholder="prod,hk,us （逗号分隔）"
              value={editItem?.tagFilter || ''}
              onValueChange={(v) => setEditItem(prev => ({ ...prev, tagFilter: v }))}
              description="只接收带有这些标签的节点告警，留空则匹配全部"
            />

            {/* 静默窗口 */}
            <div>
              <p className="text-sm font-medium text-default-700 mb-2">静默窗口</p>
              <div className="flex gap-2 items-center">
                <Input
                  size="sm" type="time" label="开始"
                  className="flex-1"
                  value={(editItem?.muteSchedule || '').split('-')[0]?.trim() || ''}
                  onValueChange={(v) => {
                    const end = (editItem?.muteSchedule || '').split('-')[1]?.trim() || '';
                    setEditItem(prev => ({ ...prev, muteSchedule: v && end ? `${v}-${end}` : '' }));
                  }}
                />
                <span className="text-default-400">—</span>
                <Input
                  size="sm" type="time" label="结束"
                  className="flex-1"
                  value={(editItem?.muteSchedule || '').split('-')[1]?.trim() || ''}
                  onValueChange={(v) => {
                    const start = (editItem?.muteSchedule || '').split('-')[0]?.trim() || '';
                    setEditItem(prev => ({ ...prev, muteSchedule: start && v ? `${start}-${v}` : '' }));
                  }}
                />
              </div>
              <p className="text-[11px] text-default-400 mt-1.5">在此时间段内不推送外部渠道（支持跨午夜，如 22:00-06:00），留空不静默</p>
            </div>

            <div>
              <p className="text-sm font-medium text-default-700 mb-2">通知渠道</p>
              <div className="flex flex-wrap gap-2">
                {channels.length === 0 ? (
                  <p className="text-xs text-default-400">暂无可用渠道，请先在「通知渠道」中创建</p>
                ) : channels.map(ch => {
                  const selectedIds = (editItem?.channelIds || '').split(',').map(s => s.trim()).filter(Boolean);
                  const isActive = selectedIds.includes(String(ch.id));
                  return (
                    <Chip key={ch.id} size="sm"
                      variant={isActive ? 'solid' : 'bordered'}
                      color={isActive ? 'primary' : 'default'}
                      className="cursor-pointer"
                      onClick={() => {
                        const next = isActive
                          ? selectedIds.filter(v => v !== String(ch.id))
                          : [...selectedIds, String(ch.id)];
                        setEditItem(prev => ({ ...prev, channelIds: next.join(',') }));
                      }}>
                      {ch.name} ({ch.type})
                    </Chip>
                  );
                })}
              </div>
              <p className="text-[11px] text-default-400 mt-1.5">选择告警要推送到的外部渠道，可多选</p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>取消</Button>
            <Button color="primary" onPress={handleSave}>保存</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

// ==================== Alert Logs Tab ====================
function AlertLogsTab() {
  const canDelete = hasPermission('alert.delete');
  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchLogs = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await getAlertLogs(p, 20);
      if (res.code === 0 && res.data) {
        const d = res.data as any;
        setLogs(d.records || []);
        setTotal(d.total || 0);
        setPage(p);
      }
    } catch { toast.error('加载告警记录失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const filtered = logs.filter(l =>
    !search || (l.message || '').toLowerCase().includes(search.toLowerCase())
    || (l.nodeName || '').toLowerCase().includes(search.toLowerCase())
    || (l.ruleName || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-default-500">共 {total} 条</span>
          <Input size="sm" placeholder="搜索消息/节点/规则…" className="max-w-xs"
            value={search} onValueChange={setSearch}
            isClearable onClear={() => setSearch('')} />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="flat" onPress={() => fetchLogs(page)}>刷新</Button>
          {canDelete && (
            <Button size="sm" variant="flat" color="danger" onPress={async () => {
              if (!confirm('确定清除所有告警记录？')) return;
              await clearAlertLogs();
              toast.success('已清除');
              fetchLogs(1);
            }}>清除全部</Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider/60 p-12 text-center">
          <h3 className="text-base font-semibold text-default-600">暂无告警记录</h3>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {filtered.map(log => (
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
          {total > 20 && (
            <div className="flex justify-center gap-2 pt-2">
              <Button size="sm" variant="flat" isDisabled={page <= 1} onPress={() => fetchLogs(page - 1)}>上一页</Button>
              <span className="text-xs text-default-400 self-center">{page} / {Math.ceil(total / 20)}</span>
              <Button size="sm" variant="flat" isDisabled={page >= Math.ceil(total / 20)} onPress={() => fetchLogs(page + 1)}>下一页</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ==================== Main Page ====================
export default function NotificationPage() {
  const [activeTab, setActiveTab] = useState<string>('notifications');

  return (
    <div className="flex flex-col gap-4 p-4 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">通知中心</h1>
          <p className="mt-0.5 text-sm text-default-500">告警规则触发 → 通知策略匹配 → 通知渠道发送 + 站内消息记录</p>
        </div>
        <div className="flex gap-1 bg-default-100 rounded-lg p-0.5">
          {[
            { key: 'notifications', label: '通知消息' },
            { key: 'alert_logs', label: '告警记录' },
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

      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'alert_logs' && <AlertLogsTab />}
    </div>
  );
}
