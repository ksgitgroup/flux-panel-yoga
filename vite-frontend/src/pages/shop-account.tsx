import { useState, useEffect, useCallback } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Spinner } from "@heroui/spinner";
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
} from "@/api";

/* ───────────────── 常量 ───────────────── */

const PLATFORMS = [
  { key: 'tiktok', label: 'TikTok', color: 'default' as const },
  { key: 'xiaohongshu', label: '小红书', color: 'danger' as const },
  { key: 'douyin', label: '抖音', color: 'primary' as const },
  { key: 'facebook', label: 'Facebook', color: 'primary' as const },
  { key: 'instagram', label: 'Instagram', color: 'secondary' as const },
  { key: 'amazon', label: 'Amazon', color: 'warning' as const },
  { key: 'shopee', label: 'Shopee', color: 'warning' as const },
  { key: 'lazada', label: 'Lazada', color: 'primary' as const },
];

const BROWSER_TYPES = [
  { key: 'ziniao', label: '紫鸟' },
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
  { key: 'production', label: '生产' },
  { key: 'test', label: '测试' },
];

/* ───────────────── 类型 ───────────────── */

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
  boundIp?: number;
  unboundIp?: number;
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
  remark: string;
}

const emptyForm: ShopForm = {
  name: '', platform: '', shopExternalId: '', loginAccount: '',
  browserType: '', browserProfileId: '', environment: 'production',
  team: '', operator: '', remark: '',
};

/* ───────────────── 工具函数 ───────────────── */

function platformChip(key: string) {
  const p = PLATFORMS.find(v => v.key === key);
  return <Chip size="sm" color={p?.color ?? 'default'} variant="flat">{p?.label ?? key}</Chip>;
}

function statusChip(key?: string) {
  const s = ACCOUNT_STATUSES.find(v => v.key === key);
  return <Chip size="sm" color={s?.color ?? 'default'} variant="flat">{s?.label ?? key ?? '-'}</Chip>;
}

function healthChip(status?: string) {
  if (!status) return <Chip size="sm" variant="flat" color="default">未绑定</Chip>;
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

/* ───────────────── 页面组件 ───────────────── */

export default function ShopAccountPage() {
  const canWrite = hasPermission('shop_account.write');

  // 数据状态
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<ShopListItem[]>([]);
  const [stats, setStats] = useState<ShopStats>({});

  // 筛选
  const [keyword, setKeyword] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBrowser, setFilterBrowser] = useState('');

  // 表单模态框
  const { isOpen: isFormOpen, onOpen: onFormOpen, onClose: onFormClose } = useDisclosure();
  const [isEdit, setIsEdit] = useState(false);
  const [form, setForm] = useState<ShopForm>({ ...emptyForm });
  const [submitLoading, setSubmitLoading] = useState(false);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<ShopAccount | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 导出 Profile 模态框
  const { isOpen: isExportOpen, onOpen: onExportOpen, onClose: onExportClose } = useDisclosure();
  const [exportResult, setExportResult] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  /* ───── 数据加载 ───── */

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

  /* ───── 创建 / 编辑 ───── */

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

  /* ───── 删除 ───── */

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

  /* ───── 解绑 IP ───── */

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

  /* ───── 导出浏览器 Profile ───── */

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

  /* ───── 表单字段更新 ───── */

  const setField = <K extends keyof ShopForm>(key: K, val: ShopForm[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  /* ═══════════════════ 渲染 ═══════════════════ */

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-2xl font-bold">店铺账号管理</h1>

      {/* ───── 统计栏 ───── */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-default-500">店铺总数</span>
            <span className="font-semibold text-lg">{stats.total ?? '-'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-default-500">已绑定 IP</span>
            <Chip size="sm" color="success" variant="flat">{stats.boundIp ?? 0}</Chip>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-default-500">未绑定 IP</span>
            <Chip size="sm" color="warning" variant="flat">{stats.unboundIp ?? 0}</Chip>
          </div>

          {stats.byPlatform && Object.keys(stats.byPlatform).length > 0 && (
            <>
              <span className="text-default-400">|</span>
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
              <span className="text-default-400">|</span>
              {Object.entries(stats.byTeam).map(([k, v]) => (
                <Chip key={k} size="sm" variant="flat">{k} {v}</Chip>
              ))}
            </>
          )}
        </CardBody>
      </Card>

      {/* ───── 搜索 / 筛选栏 ───── */}
      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="搜索"
          placeholder="店铺名称 / 登录账号"
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

      {/* ───── 数据表格 ───── */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <Table aria-label="店铺账号列表" removeWrapper>
          <TableHeader>
            <TableColumn>店铺名称</TableColumn>
            <TableColumn>平台</TableColumn>
            <TableColumn>登录账号</TableColumn>
            <TableColumn>IP 绑定状态</TableColumn>
            <TableColumn>指纹浏览器</TableColumn>
            <TableColumn>团队 / 负责人</TableColumn>
            <TableColumn>状态</TableColumn>
            <TableColumn>操作</TableColumn>
          </TableHeader>
          <TableBody emptyContent="暂无数据">
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
                    </div>
                  </TableCell>
                  <TableCell>{platformChip(s.platform)}</TableCell>
                  <TableCell>{s.loginAccount || '-'}</TableCell>
                  <TableCell>
                    {item.exitIp ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{item.exitIp}{item.exitPort ? `:${item.exitPort}` : ''}</span>
                        {healthChip(item.healthStatus)}
                        {canWrite && (
                          <Button size="sm" variant="light" color="danger" onPress={() => handleUnbindIp(s.id)}>
                            解绑
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Chip size="sm" variant="flat" color="default">未绑定</Chip>
                    )}
                  </TableCell>
                  <TableCell>
                    <span>{browserLabel(s.browserType)}</span>
                    {s.browserProfileId && (
                      <span className="text-default-400 text-xs ml-1">({s.browserProfileId})</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span>{s.team || '-'}</span>
                    {s.operator && <span className="text-default-400 text-xs ml-1">/ {s.operator}</span>}
                  </TableCell>
                  <TableCell>{statusChip(s.accountStatus)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {canWrite && (
                        <Button size="sm" variant="light" onPress={() => openEdit(item)}>编辑</Button>
                      )}
                      <Button size="sm" variant="light" onPress={() => handleExport(s.id)}>导出</Button>
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

      {/* ───── 创建 / 编辑模态框 ───── */}
      <Modal isOpen={isFormOpen} onClose={onFormClose} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{isEdit ? '编辑店铺' : '新增店铺'}</ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="店铺名称"
                placeholder="请输入"
                value={form.name}
                onValueChange={(v) => setField('name', v)}
                isRequired
              />
              <Select
                label="平台"
                placeholder="请选择"
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
                placeholder="平台侧 ID"
                value={form.shopExternalId}
                onValueChange={(v) => setField('shopExternalId', v)}
              />
              <Input
                label="登录账号"
                placeholder="邮箱 / 手机号"
                value={form.loginAccount}
                onValueChange={(v) => setField('loginAccount', v)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="指纹浏览器"
                placeholder="请选择"
                selectedKeys={form.browserType ? [form.browserType] : []}
                onSelectionChange={(keys) => setField('browserType', Array.from(keys)[0] as string ?? '')}
              >
                {BROWSER_TYPES.map(b => <SelectItem key={b.key}>{b.label}</SelectItem>)}
              </Select>
              <Input
                label="浏览器 Profile ID"
                placeholder="浏览器配置文件 ID"
                value={form.browserProfileId}
                onValueChange={(v) => setField('browserProfileId', v)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="环境"
                placeholder="请选择"
                selectedKeys={form.environment ? [form.environment] : []}
                onSelectionChange={(keys) => setField('environment', Array.from(keys)[0] as string ?? '')}
              >
                {ENVIRONMENTS.map(e => <SelectItem key={e.key}>{e.label}</SelectItem>)}
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
              placeholder="运营负责人"
              value={form.operator}
              onValueChange={(v) => setField('operator', v)}
            />
            <Textarea
              label="备注"
              placeholder="可选备注信息"
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

      {/* ───── 删除确认模态框 ───── */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} size="sm">
        <ModalContent>
          <ModalHeader>确认删除</ModalHeader>
          <ModalBody>
            确定删除店铺 <strong>{deleteTarget?.name}</strong> 吗？此操作不可撤销。
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setDeleteTarget(null)}>取消</Button>
            <Button color="danger" onPress={handleDelete} isLoading={deleteLoading}>删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ───── 导出 Profile 模态框 ───── */}
      <Modal isOpen={isExportOpen} onClose={onExportClose} size="lg" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>导出浏览器 Profile</ModalHeader>
          <ModalBody>
            {exportLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : (
              <pre className="bg-default-100 rounded-lg p-4 text-sm overflow-auto max-h-96 whitespace-pre-wrap break-all">
                {exportResult || '无数据'}
              </pre>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onExportClose}>关闭</Button>
            <Button color="primary" onPress={copyExport} isDisabled={!exportResult || exportLoading}>
              复制
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
