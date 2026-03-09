import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input, Textarea } from "@heroui/input";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Switch } from "@heroui/switch";
import { Select, SelectItem } from "@heroui/select";
import { Tabs, Tab } from "@heroui/tabs";
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
  NotificationItem, NotifyChannelItem, NotifyPolicyItem
} from "@/api";

const CHANNEL_TYPES = [
  { value: 'wechat', label: '企业微信' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'email', label: 'Email' },
];

const CONFIG_PLACEHOLDERS: Record<string, string> = {
  wechat: JSON.stringify({ webhookUrl: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." }, null, 2),
  telegram: JSON.stringify({ token: "bot_token", chatId: "123456" }, null, 2),
  webhook: JSON.stringify({ url: "https://..." }, null, 2),
  email: JSON.stringify({ to: "user@example.com", smtpHost: "smtp.example.com", smtpPort: 587, username: "", password: "" }, null, 2),
};

const SEVERITY_MAP: Record<string, { label: string; color: "default" | "warning" | "danger" }> = {
  info: { label: '提示', color: 'default' },
  warning: { label: '警告', color: 'warning' },
  critical: { label: '严重', color: 'danger' },
  error: { label: '错误', color: 'danger' },
};

const EVENT_TYPES = [
  { value: 'alert', label: '告警触发' },
  { value: 'system', label: '系统事件' },
  { value: 'probe_offline', label: '探针离线' },
  { value: 'expiry', label: '到期提醒' },
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
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchList = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: any = { page: p, size: 20 };
      if (readFilter === 'unread') params.readStatus = 0;
      else if (readFilter === 'read') params.readStatus = 1;
      if (typeFilter) params.type = typeFilter;
      const res = await getNotifications(params);
      if (res.code === 0 && res.data) {
        const d = res.data as any;
        setItems(d.records || []);
        setTotal(d.total || 0);
        setPage(p);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [readFilter, typeFilter]);

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

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          label="已读状态"
          size="sm"
          className="w-36"
          selectedKeys={new Set([readFilter])}
          onSelectionChange={(keys) => { const v = Array.from(keys)[0] as string; setReadFilter(v || 'all'); }}
        >
          <SelectItem key="all">全部</SelectItem>
          <SelectItem key="unread">未读</SelectItem>
          <SelectItem key="read">已读</SelectItem>
        </Select>
        <Input
          label="类型筛选"
          size="sm"
          className="w-40"
          value={typeFilter}
          onValueChange={setTypeFilter}
          placeholder="如 alert, system"
        />
        <Button size="sm" color="primary" variant="flat" onPress={() => fetchList(1)}>刷新</Button>
        <Button size="sm" color="warning" variant="flat" onPress={handleMarkAllRead} isDisabled={unreadCount === 0}>
          全部已读 {unreadCount > 0 && `(${unreadCount})`}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <div className="text-center text-default-400 py-12">暂无通知消息</div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <Card key={item.id} shadow="sm" className={item.readStatus === 0 ? 'border-l-3 border-primary' : 'opacity-75'}>
              <CardBody className="flex flex-row items-start gap-3 py-3 px-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{item.title}</span>
                    {severityChip(item.severity)}
                    {item.type && <Chip size="sm" variant="bordered">{item.type}</Chip>}
                    {item.readStatus === 0 && <Chip size="sm" color="primary" variant="dot">未读</Chip>}
                  </div>
                  <div className="text-sm text-default-500 line-clamp-2">{item.content}</div>
                  <div className="text-xs text-default-400 mt-1">{formatTime(item.createdTime)}</div>
                </div>
                {item.readStatus === 0 && (
                  <Button size="sm" variant="light" color="primary" onPress={() => handleMarkRead(item.id)}>
                    标记已读
                  </Button>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-2">
          <Button size="sm" variant="flat" isDisabled={page <= 1} onPress={() => fetchList(page - 1)}>上一页</Button>
          <span className="text-sm self-center text-default-500">{page} / {totalPages}</span>
          <Button size="sm" variant="flat" isDisabled={page >= totalPages} onPress={() => fetchList(page + 1)}>下一页</Button>
        </div>
      )}
    </div>
  );
}

// ==================== Channels Tab ====================
function ChannelsTab() {
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
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  const openCreate = () => { setEditItem({ type: 'telegram', enabled: 1, configJson: CONFIG_PLACEHOLDERS.telegram }); onOpen(); };
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
      <div className="flex justify-between items-center">
        <span className="text-default-500 text-sm">管理通知渠道（Telegram / Webhook / Email）</span>
        <Button size="sm" color="primary" onPress={openCreate}>新建渠道</Button>
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
                    <Button size="sm" variant="light" color="primary" onPress={() => openEdit(ch)}>编辑</Button>
                    <Button size="sm" variant="light" color="secondary" isLoading={testing === ch.id} onPress={() => handleTest(ch.id)}>测试</Button>
                    <Button size="sm" variant="light" color="danger" onPress={() => handleDelete(ch.id)}>删除</Button>
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
                setEditItem(prev => ({
                  ...prev,
                  type: v,
                  configJson: prev?.configJson || CONFIG_PLACEHOLDERS[v] || '{}'
                }));
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
            <Textarea
              label="配置 (JSON)"
              minRows={5}
              maxRows={10}
              value={editItem?.configJson || ''}
              onValueChange={(v) => setEditItem(prev => ({ ...prev, configJson: v }))}
              placeholder={CONFIG_PLACEHOLDERS[editItem?.type || 'webhook']}
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
function PoliciesTab() {
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
    } catch { /* ignore */ }
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
      <div className="flex justify-between items-center">
        <div>
          <span className="text-default-500 text-sm">策略决定哪些事件发送到哪个渠道。</span>
          <span className="text-default-400 text-xs ml-1">示例：创建策略 "告警→微信"，事件类型选 alert，渠道选企业微信</span>
        </div>
        <Button size="sm" color="primary" onPress={openCreate}>新建策略</Button>
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
            <TableColumn>通知渠道</TableColumn>
            <TableColumn>创建时间</TableColumn>
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
                <TableCell className="text-sm">{channelName(p.channelIds)}</TableCell>
                <TableCell className="text-sm text-default-500">{formatTime(p.createdTime)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="light" color="primary" onPress={() => openEdit(p)}>编辑</Button>
                    <Button size="sm" variant="light" color="danger" onPress={() => handleDelete(p.id)}>删除</Button>
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
            <Select
              label="通知渠道"
              selectionMode="multiple"
              selectedKeys={editItem?.channelIds ? new Set(editItem.channelIds.split(',').map(s => s.trim())) : new Set()}
              onSelectionChange={(keys) => {
                const v = Array.from(keys).join(',');
                setEditItem(prev => ({ ...prev, channelIds: v }));
              }}
            >
              {channels.map(ch => (
                <SelectItem key={String(ch.id)}>{ch.name} ({ch.type})</SelectItem>
              ))}
            </Select>
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

// ==================== Main Page ====================
export default function NotificationPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>('notifications');

  return (
    <div className="flex flex-col gap-4 p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">通知中心</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="flat" onPress={() => navigate('/alert')}>告警规则</Button>
          <Button size="sm" variant="flat" onPress={() => navigate('/audit')}>审计日志</Button>
        </div>
      </div>

      {/* Architecture guide */}
      <Card className="border border-primary/20 bg-primary-50/30 dark:bg-primary/5">
        <CardBody className="p-3 text-xs text-default-600 space-y-1">
          <p className="font-semibold text-sm text-primary">通知架构说明</p>
          <p><strong>通知消息</strong> — 系统产生的所有通知记录（告警触发、探针离线、到期提醒等），支持已读状态和类型筛选。</p>
          <p><strong>通知渠道</strong> — 配置接收通知的方式：企业微信、Telegram、Webhook、Email。所有渠道统一在此管理（包括原"安全登录-企业微信通知"的功能）。</p>
          <p><strong>通知策略</strong> — 将事件类型路由到渠道。例如：告警事件 → 企业微信渠道，探针离线 → Telegram 渠道。不配置策略时，通知仅记录在消息列表中。</p>
        </CardBody>
      </Card>

      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as string)}
        variant="underlined"
        color="primary"
      >
        <Tab key="notifications" title="通知消息">
          <NotificationsTab />
        </Tab>
        <Tab key="channels" title="通知渠道">
          <ChannelsTab />
        </Tab>
        <Tab key="policies" title="通知策略">
          <PoliciesTab />
        </Tab>
      </Tabs>
    </div>
  );
}
