import { useState, useEffect, useCallback } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Spinner } from "@heroui/spinner";
import { Tooltip } from "@heroui/tooltip";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from "@heroui/modal";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from "@heroui/table";
import toast from 'react-hot-toast';

import { hasPermission } from '@/utils/auth';
import {
  listShopAccount,
  createShopAccount,
  updateShopAccount,
  deleteShopAccount,
  exportBrowserProfile,
  getShopAccountStats,
  unbindShopIp,
  bindShopIp,
  listIpPool,
} from "@/api";

/* ------------------- Constants ------------------- */

const PLATFORMS = [
  { key: 'tiktok', label: 'TikTok', color: 'default' as const },
  { key: 'xiaohongshu', label: '小红书', color: 'danger' as const },
  { key: 'douyin', label: '抖音', color: 'primary' as const },
  { key: 'facebook', label: 'Facebook', color: 'primary' as const },
  { key: 'instagram', label: 'Instagram', color: 'secondary' as const },
  { key: 'amazon', label: 'Amazon', color: 'warning' as const },
  { key: 'shopee', label: 'Shopee', color: 'warning' as const },
  { key: 'lazada', label: 'Lazada', color: 'primary' as const },
  { key: 'other', label: '其他', color: 'default' as const },
];

const BROWSER_TYPES = [
  { key: 'ziniao', label: '紫鸟浏览器' },
  { key: 'ads', label: 'AdsPower' },
  { key: 'other', label: '其他' },
];

const ACCOUNT_STATUSES = [
  { key: 'active', label: '正常', color: 'success' as const },
  { key: 'suspended', label: '暂停', color: 'warning' as const },
  { key: 'banned', label: '封禁', color: 'danger' as const },
  { key: 'cooldown', label: '冷却中', color: 'default' as const },
];

const ENVIRONMENTS = [
  { key: 'production', label: '生产环境' },
  { key: 'test', label: '测试环境' },
];

/* ------------------- Types ------------------- */

interface ShopAccount {
  id: number;
  name: string;
  platform: string;
  shopExternalId?: string;
  loginAccount?: string;
  browserType?: string;
  browserProfileId?: string;
  environment?: string;
  team?: string;
  operator?: string;
  remark?: string;
  accountStatus?: string;
  ipPoolId?: number;
  createdTime?: number;
  updatedTime?: number;
}

interface ShopListItem {
  shop: ShopAccount;
  ipName?: string;
  exitIp?: string;
  exitPort?: number;
  protocol?: string;
  countryCode?: string;
  healthStatus?: string;
}

interface ShopStats {
  total?: number;
  bound?: number;
  unbound?: number;
  active?: number;
  suspended?: number;
  byPlatform?: Record<string, number>;
  byTeam?: Record<string, number>;
}

interface ShopForm {
  id?: number;
  name: string;
  platform: string;
  shopExternalId: string;
  loginAccount: string;
  browserType: string;
  browserProfileId: string;
  environment: string;
  team: string;
  operator: string;
  accountStatus: string;
  remark: string;
}

interface AvailableIp {
  id: number;
  name: string;
  exitIp: string;
  exitPort: number;
  protocol: string;
  countryCode: string;
  healthStatus: string;
  boundShopId?: number;
}

const emptyForm: ShopForm = {
  name: '', platform: '', shopExternalId: '', loginAccount: '',
  browserType: '', browserProfileId: '', environment: 'production',
  team: '', operator: '', accountStatus: 'active', remark: '',
};

/* ------------------- Helpers ------------------- */

function platformChip(key: string) {
  const p = PLATFORMS.find(v => v.key === key);
  return <Chip size="sm" color={p?.color ?? 'default'} variant="flat">{p?.label ?? key}</Chip>;
}

function statusChip(key?: string) {
  const s = ACCOUNT_STATUSES.find(v => v.key === key);
  return <Chip size="sm" color={s?.color ?? 'default'} variant="flat">{s?.label ?? key ?? '-'}</Chip>;
}

function healthChip(status?: string) {
  if (!status) return <Chip size="sm" variant="flat" color="default">未检测</Chip>;
  const map: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    healthy: 'success', degraded: 'warning', down: 'danger',
  };
  const labelMap: Record<string, string> = {
    healthy: '健康', degraded: '异常', down: '离线',
  };
  return <Chip size="sm" color={map[status] ?? 'default'} variant="flat">{labelMap[status] ?? status}</Chip>;
}

function browserLabel(key?: string) {
  return BROWSER_TYPES.find(v => v.key === key)?.label ?? key ?? '-';
}

/* ------------------- Page Component ------------------- */

export default function ShopAccountPage() {
  const canWrite = hasPermission('shop_account.write');

  // Data
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<ShopListItem[]>([]);
  const [stats, setStats] = useState<ShopStats>({});

  // Filters
  const [keyword, setKeyword] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBrowser, setFilterBrowser] = useState('');

  // Form modal
  const { isOpen: isFormOpen, onOpen: onFormOpen, onClose: onFormClose } = useDisclosure();
  const [isEdit, setIsEdit] = useState(false);
  const [form, setForm] = useState<ShopForm>({ ...emptyForm });
  const [submitLoading, setSubmitLoading] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ShopAccount | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Export Profile modal
  const { isOpen: isExportOpen, onOpen: onExportOpen, onClose: onExportClose } = useDisclosure();
  const [exportResult, setExportResult] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  // Bind IP modal
  const { isOpen: isBindOpen, onOpen: onBindOpen, onClose: onBindClose } = useDisclosure();
  const [bindShopId, setBindShopId] = useState<number | null>(null);
  const [bindShopName, setBindShopName] = useState('');
  const [availableIps, setAvailableIps] = useState<AvailableIp[]>([]);
  const [selectedIpId, setSelectedIpId] = useState<number | null>(null);
  const [bindLoading, setBindLoading] = useState(false);
  const [ipListLoading, setIpListLoading] = useState(false);

  /* -------- Data Loading -------- */

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (keyword.trim()) params.keyword = keyword.trim();
      if (filterPlatform) params.platform = filterPlatform;
      if (filterStatus) params.accountStatus = filterStatus;
      if (filterBrowser) params.browserType = filterBrowser;

      const res = await listShopAccount(params);
      if (res.code === 0) {
        setRecords(res.data?.records ?? []);
      } else {
        toast.error(res.msg || '加载店铺列表失败');
      }
    } catch {
      toast.error('请求异常');
    } finally {
      setLoading(false);
    }
  }, [keyword, filterPlatform, filterStatus, filterBrowser]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await getShopAccountStats();
      if (res.code === 0 && res.data) setStats(res.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchList();
    fetchStats();
  }, [fetchList, fetchStats]);

  /* -------- Create / Edit -------- */

  const openCreate = () => {
    setIsEdit(false);
    setForm({ ...emptyForm });
    onFormOpen();
  };

  const openEdit = (item: ShopListItem) => {
    setIsEdit(true);
    const s = item.shop;
    setForm({
      id: s.id,
      name: s.name ?? '',
      platform: s.platform ?? '',
      shopExternalId: s.shopExternalId ?? '',
      loginAccount: s.loginAccount ?? '',
      browserType: s.browserType ?? '',
      browserProfileId: s.browserProfileId ?? '',
      environment: s.environment ?? 'production',
      team: s.team ?? '',
      operator: s.operator ?? '',
      accountStatus: s.accountStatus ?? 'active',
      remark: s.remark ?? '',
    });
    onFormOpen();
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('请输入店铺名称'); return; }
    if (!form.platform) { toast.error('请选择平台'); return; }
    setSubmitLoading(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      const res = isEdit
        ? await updateShopAccount(payload)
        : await createShopAccount(payload);
      if (res.code === 0) {
        toast.success(isEdit ? '更新成功' : '创建成功');
        onFormClose();
        fetchList();
        fetchStats();
      } else {
        toast.error(res.msg || '操作失败');
      }
    } catch {
      toast.error('请求异常');
    } finally {
      setSubmitLoading(false);
    }
  };

  /* -------- Delete -------- */

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await deleteShopAccount(deleteTarget.id);
      if (res.code === 0) {
        toast.success('删除成功');
        setDeleteTarget(null);
        fetchList();
        fetchStats();
      } else {
        toast.error(res.msg || '删除失败');
      }
    } catch {
      toast.error('请求异常');
    } finally {
      setDeleteLoading(false);
    }
  };

  /* -------- Unbind IP -------- */

  const handleUnbindIp = async (shopId: number) => {
    try {
      const res = await unbindShopIp(shopId);
      if (res.code === 0) {
        toast.success('已解绑 IP');
        fetchList();
        fetchStats();
      } else {
        toast.error(res.msg || '解绑失败');
      }
    } catch {
      toast.error('请求异常');
    }
  };

  /* -------- Bind IP -------- */

  const handleOpenBind = async (item: ShopListItem) => {
    setBindShopId(item.shop.id);
    setBindShopName(item.shop.name);
    setSelectedIpId(null);
    setIpListLoading(true);
    onBindOpen();
    try {
      const res = await listIpPool({ size: 200 });
      if (res.code === 0) {
        const allIps = res.data?.records || [];
        setAvailableIps(allIps);
      }
    } catch {
      toast.error('加载 IP 列表失败');
    } finally {
      setIpListLoading(false);
    }
  };

  const handleBindIp = async () => {
    if (!bindShopId || !selectedIpId) { toast.error('请选择 IP'); return; }
    setBindLoading(true);
    try {
      const res = await bindShopIp(bindShopId, selectedIpId);
      if (res.code === 0) {
        toast.success('绑定成功');
        onBindClose();
        fetchList();
        fetchStats();
      } else {
        toast.error(res.msg || '绑定失败');
      }
    } catch {
      toast.error('绑定请求异常');
    } finally {
      setBindLoading(false);
    }
  };

  /* -------- Export Browser Profile -------- */

  const handleExport = async (shopId: number) => {
    setExportLoading(true);
    setExportResult('');
    onExportOpen();
    try {
      const res = await exportBrowserProfile(shopId);
      if (res.code === 0) {
        setExportResult(JSON.stringify(res.data, null, 2));
      } else {
        setExportResult(res.msg || '导出失败');
      }
    } catch {
      setExportResult('请求异常');
    } finally {
      setExportLoading(false);
    }
  };

  const copyExport = () => {
    navigator.clipboard.writeText(exportResult).then(
      () => toast.success('已复制到剪贴板'),
      () => toast.error('复制失败'),
    );
  };

  /* -------- Form helpers -------- */

  const setField = <K extends keyof ShopForm>(key: K, val: ShopForm[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const idleIps = availableIps.filter(ip => !ip.boundShopId);
  const boundIps = availableIps.filter(ip => !!ip.boundShopId);

  /* ===================== Render ===================== */

  return (
    <div className="flex flex-col gap-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">店铺账号管理</h1>
        <p className="text-sm text-default-400 mt-1">
          管理跨境电商平台店铺账号，绑定独立 IP 实现环境隔离，配置指纹浏览器实现安全登录
        </p>
      </div>

      {/* 使用指引 */}
      {!loading && records.length === 0 && !keyword && !filterPlatform && (
        <Card shadow="sm" className="border border-primary/20 bg-primary-50/10">
          <CardBody className="py-4 px-5">
            <h2 className="text-sm font-semibold mb-2">使用流程</h2>
            <ol className="text-sm text-default-600 list-decimal pl-4 space-y-1.5">
              <li><strong>新增店铺</strong> — 点击右上角「新增店铺」，填入平台、账号信息和指纹浏览器配置</li>
              <li><strong>绑定 IP</strong> — 为店铺绑定一个独立的代理 IP，确保每个店铺使用唯一 IP 登录</li>
              <li><strong>导出配置</strong> — 导出浏览器 Profile（含代理配置），粘贴到紫鸟/AdsPower 中使用</li>
            </ol>
            <div className="mt-3 flex gap-4 text-xs text-default-400">
              <span>前置条件：先在「IP 池管理」中添加好代理 IP</span>
            </div>
            <div className="mt-2 p-2 bg-warning-50/50 rounded-md">
              <p className="text-xs text-warning-600">
                <strong>环境隔离原则：</strong>1 个店铺 = 1 个独立 IP + 1 个独立浏览器 Profile。避免多个店铺共用同一 IP 导致关联封号。
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* 统计栏 */}
      {(stats.total ?? 0) > 0 && (
        <Card>
          <CardBody className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-default-500">店铺总数</span>
              <span className="font-semibold text-lg">{stats.total ?? '-'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip content="已绑定独立代理 IP 的店铺">
                <div className="flex items-center gap-1">
                  <span className="text-default-500">已绑定 IP</span>
                  <Chip size="sm" color="success" variant="flat">{stats.bound ?? 0}</Chip>
                </div>
              </Tooltip>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip content="尚未绑定 IP 的店铺，存在关联风险">
                <div className="flex items-center gap-1">
                  <span className="text-default-500">未绑定 IP</span>
                  <Chip size="sm" color="warning" variant="flat">{stats.unbound ?? 0}</Chip>
                </div>
              </Tooltip>
            </div>

            {stats.byPlatform && Object.keys(stats.byPlatform).length > 0 && (
              <>
                <span className="text-default-300">|</span>
                {Object.entries(stats.byPlatform).map(([k, v]) => {
                  const p = PLATFORMS.find(pp => pp.key === k);
                  return (
                    <Chip key={k} size="sm" color={p?.color ?? 'default'} variant="flat">
                      {p?.label ?? k} {v}
                    </Chip>
                  );
                })}
              </>
            )}

            {stats.byTeam && Object.keys(stats.byTeam).length > 0 && (
              <>
                <span className="text-default-300">|</span>
                {Object.entries(stats.byTeam).map(([k, v]) => (
                  <Chip key={k} size="sm" variant="flat">{k}: {v}</Chip>
                ))}
              </>
            )}
          </CardBody>
        </Card>
      )}

      {/* 搜索 / 筛选栏 */}
      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="搜索"
          placeholder="店铺名称 / 登录账号 / 负责人"
          value={keyword}
          onValueChange={setKeyword}
          className="max-w-xs"
          isClearable
          onClear={() => setKeyword('')}
        />
        <Select
          label="平台"
          placeholder="全部"
          className="max-w-[160px]"
          selectedKeys={filterPlatform ? [filterPlatform] : []}
          onSelectionChange={(keys) => setFilterPlatform(Array.from(keys)[0] as string ?? '')}
        >
          {PLATFORMS.map(p => <SelectItem key={p.key}>{p.label}</SelectItem>)}
        </Select>
        <Select
          label="状态"
          placeholder="全部"
          className="max-w-[140px]"
          selectedKeys={filterStatus ? [filterStatus] : []}
          onSelectionChange={(keys) => setFilterStatus(Array.from(keys)[0] as string ?? '')}
        >
          {ACCOUNT_STATUSES.map(s => <SelectItem key={s.key}>{s.label}</SelectItem>)}
        </Select>
        <Select
          label="浏览器"
          placeholder="全部"
          className="max-w-[140px]"
          selectedKeys={filterBrowser ? [filterBrowser] : []}
          onSelectionChange={(keys) => setFilterBrowser(Array.from(keys)[0] as string ?? '')}
        >
          {BROWSER_TYPES.map(b => <SelectItem key={b.key}>{b.label}</SelectItem>)}
        </Select>
        <Button variant="flat" onPress={() => { setKeyword(''); setFilterPlatform(''); setFilterStatus(''); setFilterBrowser(''); }}>
          重置
        </Button>
        <div className="flex-1" />
        {canWrite && (
          <Button color="primary" onPress={openCreate}>新增店铺</Button>
        )}
      </div>

      {/* 数据表格 */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <Table aria-label="店铺账号列表" removeWrapper>
          <TableHeader>
            <TableColumn>店铺名称</TableColumn>
            <TableColumn>平台</TableColumn>
            <TableColumn>登录账号</TableColumn>
            <TableColumn>
              <Tooltip content="每个店铺应绑定唯一 IP，防止关联封号">
                <span>IP 绑定状态</span>
              </Tooltip>
            </TableColumn>
            <TableColumn>指纹浏览器</TableColumn>
            <TableColumn>团队 / 负责人</TableColumn>
            <TableColumn>状态</TableColumn>
            <TableColumn>操作</TableColumn>
          </TableHeader>
          <TableBody emptyContent="暂无店铺数据，点击右上角「新增店铺」开始">
            {records.map((item) => {
              const s = item.shop;
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <div>
                      <span className="font-medium">{s.name}</span>
                      {s.shopExternalId && (
                        <span className="text-default-400 text-xs ml-2">#{s.shopExternalId}</span>
                      )}
                      {s.environment === 'test' && (
                        <Chip size="sm" variant="flat" color="warning" className="ml-1">测试</Chip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{platformChip(s.platform)}</TableCell>
                  <TableCell>{s.loginAccount || <span className="text-default-300">未填写</span>}</TableCell>
                  <TableCell>
                    {item.exitIp ? (
                      <div className="flex items-center gap-2">
                        <Tooltip content={`${item.ipName || ''} | ${item.protocol?.toUpperCase() || ''} | ${item.countryCode || '未知地区'}`}>
                          <span className="text-sm font-mono">{item.exitIp}{item.exitPort ? `:${item.exitPort}` : ''}</span>
                        </Tooltip>
                        {healthChip(item.healthStatus)}
                        {canWrite && (
                          <Tooltip content="解除 IP 绑定">
                            <Button size="sm" variant="light" color="danger" onPress={() => handleUnbindIp(s.id)}>
                              解绑
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Chip size="sm" variant="flat" color="warning">未绑定</Chip>
                        {canWrite && (
                          <Tooltip content="为此店铺绑定一个独立代理 IP">
                            <Button size="sm" variant="light" color="primary" onPress={() => handleOpenBind(item)}>
                              绑定 IP
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{browserLabel(s.browserType)}</span>
                      {s.browserProfileId && (
                        <Tooltip content="浏览器配置文件 ID，用于关联指纹浏览器中的 Profile">
                          <span className="text-default-400 text-xs">Profile: {s.browserProfileId}</span>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span>{s.team || <span className="text-default-300">未分配</span>}</span>
                    {s.operator && <span className="text-default-400 text-xs ml-1">/ {s.operator}</span>}
                  </TableCell>
                  <TableCell>{statusChip(s.accountStatus)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {canWrite && (
                        <Button size="sm" variant="light" onPress={() => openEdit(item)}>编辑</Button>
                      )}
                      <Tooltip content={item.exitIp ? '导出包含代理配置的浏览器 Profile' : '请先绑定 IP 后再导出'}>
                        <Button
                          size="sm"
                          variant="light"
                          isDisabled={!item.exitIp}
                          onPress={() => handleExport(s.id)}
                        >
                          导出
                        </Button>
                      </Tooltip>
                      {canWrite && (
                        <Button size="sm" variant="light" color="danger" onPress={() => setDeleteTarget(s)}>
                          删除
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* 创建 / 编辑模态框 */}
      <Modal isOpen={isFormOpen} onClose={onFormClose} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{isEdit ? '编辑店铺' : '新增店铺'}</ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            {!isEdit && (
              <div className="text-sm text-default-400 bg-default-50 rounded-lg p-3">
                创建店铺账号后，可在列表中绑定代理 IP 和导出浏览器配置。
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="店铺名称"
                placeholder="例: TK-US-美妆店01"
                description="建议格式：平台-地区-业务-编号"
                value={form.name}
                onValueChange={(v) => setField('name', v)}
                isRequired
              />
              <Select
                label="平台"
                placeholder="请选择运营平台"
                selectedKeys={form.platform ? [form.platform] : []}
                onSelectionChange={(keys) => setField('platform', Array.from(keys)[0] as string ?? '')}
                isRequired
              >
                {PLATFORMS.map(p => <SelectItem key={p.key}>{p.label}</SelectItem>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="店铺外部 ID"
                placeholder="平台侧的店铺 ID 或编号"
                description="便于与平台后台对照"
                value={form.shopExternalId}
                onValueChange={(v) => setField('shopExternalId', v)}
              />
              <Input
                label="登录账号"
                placeholder="邮箱 / 手机号 / 用户名"
                description="用于登录平台的账号"
                value={form.loginAccount}
                onValueChange={(v) => setField('loginAccount', v)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="指纹浏览器"
                placeholder="请选择"
                description="店铺使用的指纹浏览器类型"
                selectedKeys={form.browserType ? [form.browserType] : []}
                onSelectionChange={(keys) => setField('browserType', Array.from(keys)[0] as string ?? '')}
              >
                {BROWSER_TYPES.map(b => <SelectItem key={b.key}>{b.label}</SelectItem>)}
              </Select>
              <Input
                label="浏览器 Profile ID"
                placeholder="指纹浏览器中的配置文件编号"
                description="在紫鸟/AdsPower 中创建 Profile 后填入其 ID"
                value={form.browserProfileId}
                onValueChange={(v) => setField('browserProfileId', v)}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Select
                label="环境"
                selectedKeys={form.environment ? [form.environment] : []}
                onSelectionChange={(keys) => setField('environment', Array.from(keys)[0] as string ?? '')}
              >
                {ENVIRONMENTS.map(e => <SelectItem key={e.key}>{e.label}</SelectItem>)}
              </Select>
              <Select
                label="账号状态"
                selectedKeys={form.accountStatus ? [form.accountStatus] : []}
                onSelectionChange={(keys) => setField('accountStatus', Array.from(keys)[0] as string ?? '')}
              >
                {ACCOUNT_STATUSES.map(s => <SelectItem key={s.key}>{s.label}</SelectItem>)}
              </Select>
              <Input
                label="团队"
                placeholder="所属团队"
                value={form.team}
                onValueChange={(v) => setField('team', v)}
              />
            </div>
            <Input
              label="负责人"
              placeholder="运营负责人姓名"
              value={form.operator}
              onValueChange={(v) => setField('operator', v)}
            />
            <Textarea
              label="备注"
              placeholder="其他备注信息"
              value={form.remark}
              onValueChange={(v) => setField('remark', v)}
              minRows={2}
              maxRows={4}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onFormClose}>取消</Button>
            <Button color="primary" onPress={handleSubmit} isLoading={submitLoading}>
              {isEdit ? '保存' : '创建'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 删除确认模态框 */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>确认删除</ModalHeader>
          <ModalBody>
            <p>确定删除店铺 <strong>{deleteTarget?.name}</strong> 吗？此操作不可撤销。</p>
            {deleteTarget?.ipPoolId && (
              <p className="text-warning text-sm mt-2">该店铺已绑定 IP，删除后将自动解绑。</p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setDeleteTarget(null)}>取消</Button>
            <Button color="danger" onPress={handleDelete} isLoading={deleteLoading}>删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 绑定 IP 模态框 */}
      <Modal isOpen={isBindOpen} onClose={onBindClose} size="lg">
        <ModalContent>
          <ModalHeader>为店铺绑定 IP</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-500 mb-3">
              为 <strong>{bindShopName}</strong> 选择一个代理 IP。绑定后该 IP 将专属于此店铺。
            </p>
            {ipListLoading ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : (
              <>
                {idleIps.length > 0 ? (
                  <>
                    <p className="text-xs text-default-400 mb-2">可用 IP（{idleIps.length} 个空闲）：</p>
                    <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                      {idleIps.map(ip => (
                        <div
                          key={ip.id}
                          onClick={() => setSelectedIpId(ip.id)}
                          className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            selectedIpId === ip.id
                              ? 'border-primary bg-primary-50/30'
                              : 'border-default-200 hover:bg-default-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{ip.exitIp}:{ip.exitPort}</span>
                            <Chip size="sm" variant="flat">{ip.protocol.toUpperCase()}</Chip>
                            {ip.countryCode && <Chip size="sm" variant="flat">{ip.countryCode}</Chip>}
                            {healthChip(ip.healthStatus)}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-default-400">{ip.name}</span>
                            {selectedIpId === ip.id && (
                              <Chip size="sm" color="primary" variant="solid">已选</Chip>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-6 text-default-400">
                    <p>暂无空闲 IP</p>
                    <p className="text-xs mt-1">请先在「IP 池管理」中添加代理 IP</p>
                  </div>
                )}
                {boundIps.length > 0 && (
                  <p className="text-xs text-default-400 mt-3">
                    另有 {boundIps.length} 个 IP 已绑定其他店铺
                  </p>
                )}
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onBindClose}>取消</Button>
            <Button
              color="primary"
              isLoading={bindLoading}
              isDisabled={!selectedIpId}
              onPress={handleBindIp}
            >
              确认绑定
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 导出 Profile 模态框 */}
      <Modal isOpen={isExportOpen} onClose={onExportClose} size="lg" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>导出浏览器 Profile</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-400 mb-3">
              导出内容包含店铺信息和代理配置，可直接导入到指纹浏览器中创建 Profile。
            </p>
            {exportLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : (
              <pre className="bg-default-100 rounded-lg p-4 text-sm overflow-auto max-h-96 whitespace-pre-wrap break-all font-mono">
                {exportResult || '无数据'}
              </pre>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onExportClose}>关闭</Button>
            <Button color="primary" onPress={copyExport} isDisabled={!exportResult || exportLoading}>
              复制到剪贴板
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
