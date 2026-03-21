import { useState, useEffect, useCallback } from "react";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { Tooltip } from "@heroui/tooltip";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from "@heroui/table";
import toast from 'react-hot-toast';

import { hasPermission } from '@/utils/auth';
import {
  listIpPool,
  createIpPool,
  updateIpPool,
  deleteIpPool,
  healthCheckIpPool,
  batchHealthCheckIpPool,
  exportProxyConfig,
  getIpPoolStats,
  bindShopIp,
  listShopAccount,
} from "@/api";

// ===================== Types =====================

interface IpPoolItem {
  id: number;
  name: string;
  exitIp: string;
  exitPort: number;
  protocol: string;
  proxyUser?: string;
  proxyPass?: string;
  ipType: string;
  countryCode: string;
  region?: string;
  isp?: string;
  healthStatus: string;
  healthScore?: number;
  lastCheckTime?: number;
  boundShopName?: string;
  boundShopId?: number;
  usagePurpose?: string;
  remark?: string;
  createdTime: number;
  updatedTime?: number;
}

interface IpPoolStats {
  total: number;
  bound: number;
  idle: number;
  healthy: number;
  degraded: number;
  down: number;
  byCountry: Record<string, number>;
}

interface IpPoolForm {
  id?: number;
  name: string;
  exitIp: string;
  exitPort: number | '';
  protocol: string;
  proxyUser: string;
  proxyPass: string;
  ipType: string;
  countryCode: string;
  region: string;
  isp: string;
  usagePurpose: string;
  remark: string;
}

const defaultForm: IpPoolForm = {
  name: '', exitIp: '', exitPort: '', protocol: 'socks5',
  proxyUser: '', proxyPass: '', ipType: 'datacenter',
  countryCode: '', region: '', isp: '', usagePurpose: '', remark: '',
};

// ===================== Constants =====================

const PROTOCOL_OPTIONS = [
  { value: 'socks5', label: 'SOCKS5' },
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
];

const IP_TYPE_OPTIONS = [
  { value: 'datacenter', label: '数据中心' },
  { value: 'residential', label: '住宅' },
  { value: 'mobile', label: '移动' },
];

const HEALTH_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'healthy', label: '健康' },
  { value: 'degraded', label: '降级' },
  { value: 'down', label: '不可用' },
  { value: 'unknown', label: '未检测' },
];

const EXPORT_FORMATS = [
  { value: 'ziniao', label: '紫鸟浏览器' },
  { value: 'ads', label: 'AdsPower' },
  { value: 'general', label: '通用格式' },
];

const IP_TYPE_LABEL: Record<string, string> = {
  datacenter: '数据中心',
  residential: '住宅',
  mobile: '移动',
};

// ===================== Helpers =====================

function formatTime(ts?: number | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

function healthChip(status: string) {
  const map: Record<string, "success" | "warning" | "danger" | "default"> = {
    healthy: "success",
    degraded: "warning",
    down: "danger",
  };
  const labelMap: Record<string, string> = {
    healthy: "健康",
    degraded: "降级",
    down: "不可用",
    unknown: "未检测",
  };
  return (
    <Chip size="sm" color={map[status] || "default"} variant="flat">
      {labelMap[status] || status}
    </Chip>
  );
}

// ===================== Component =====================

export default function IpPoolPage() {
  const canWrite = hasPermission('ip_pool.write');

  // Data
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<IpPoolItem[]>([]);
  const [stats, setStats] = useState<IpPoolStats | null>(null);

  // Filters
  const [keyword, setKeyword] = useState('');
  const [filterIpType, setFilterIpType] = useState('');
  const [filterHealth, setFilterHealth] = useState('');
  const [filterCountry, setFilterCountry] = useState('');

  // Form modal
  const { isOpen: isFormOpen, onOpen: onFormOpen, onClose: onFormClose } = useDisclosure();
  const [isEdit, setIsEdit] = useState(false);
  const [form, setForm] = useState<IpPoolForm>({ ...defaultForm });
  const [submitting, setSubmitting] = useState(false);

  // Delete confirm
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
  const [deleteTarget, setDeleteTarget] = useState<IpPoolItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Export modal
  const { isOpen: isExportOpen, onOpen: onExportOpen, onClose: onExportClose } = useDisclosure();
  const [exportFormat, setExportFormat] = useState('general');
  const [exportResult, setExportResult] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportTargetId, setExportTargetId] = useState<number | null>(null);

  // Bind modal
  const { isOpen: isBindOpen, onOpen: onBindOpen, onClose: onBindClose } = useDisclosure();
  const [bindIpId, setBindIpId] = useState<number | null>(null);
  const [bindIpName, setBindIpName] = useState('');
  const [shopList, setShopList] = useState<{ id: number; name: string; platform: string; ipPoolId?: number }[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
  const [bindLoading, setBindLoading] = useState(false);
  const [shopListLoading, setShopListLoading] = useState(false);

  // Health check loading per row
  const [checkingIds, setCheckingIds] = useState<Set<number>>(new Set());
  const [batchChecking, setBatchChecking] = useState(false);

  // ===================== Data Loading =====================

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        listIpPool({ keyword, ipType: filterIpType, healthStatus: filterHealth, countryCode: filterCountry }),
        getIpPoolStats(),
      ]);
      if (listRes.code === 0) setList(listRes.data?.records || []);
      else toast.error(listRes.msg || '加载IP池列表失败');
      if (statsRes.code === 0) setStats(statsRes.data || null);
    } catch {
      toast.error('加载数据异常');
    } finally {
      setLoading(false);
    }
  }, [keyword, filterIpType, filterHealth, filterCountry]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ===================== Form Handlers =====================

  const handleOpenCreate = () => {
    setIsEdit(false);
    setForm({ ...defaultForm });
    onFormOpen();
  };

  const handleOpenEdit = (item: IpPoolItem) => {
    setIsEdit(true);
    setForm({
      id: item.id,
      name: item.name,
      exitIp: item.exitIp,
      exitPort: item.exitPort,
      protocol: item.protocol,
      proxyUser: item.proxyUser || '',
      proxyPass: item.proxyPass || '',
      ipType: item.ipType,
      countryCode: item.countryCode,
      region: item.region || '',
      isp: item.isp || '',
      usagePurpose: item.usagePurpose || '',
      remark: item.remark || '',
    });
    onFormOpen();
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('请输入名称'); return; }
    if (!form.exitIp.trim()) { toast.error('请输入出口IP'); return; }
    if (!form.exitPort) { toast.error('请输入端口'); return; }

    setSubmitting(true);
    try {
      const payload = { ...form, exitPort: Number(form.exitPort) };
      const res = isEdit ? await updateIpPool(payload) : await createIpPool(payload);
      if (res.code === 0) {
        toast.success(isEdit ? '更新成功' : '创建成功');
        onFormClose();
        loadData();
      } else {
        toast.error(res.msg || '操作失败');
      }
    } catch {
      toast.error('请求异常');
    } finally {
      setSubmitting(false);
    }
  };

  // ===================== Delete =====================

  const handleConfirmDelete = (item: IpPoolItem) => {
    setDeleteTarget(item);
    onDeleteOpen();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteIpPool(deleteTarget.id);
      if (res.code === 0) {
        toast.success('删除成功');
        onDeleteClose();
        loadData();
      } else {
        toast.error(res.msg || '删除失败');
      }
    } catch {
      toast.error('删除请求异常');
    } finally {
      setDeleting(false);
    }
  };

  // ===================== Health Check =====================

  const handleHealthCheck = async (id: number) => {
    setCheckingIds(prev => new Set(prev).add(id));
    try {
      const res = await healthCheckIpPool(id);
      if (res.code === 0) {
        toast.success('健康检测完成');
        loadData();
      } else {
        toast.error(res.msg || '检测失败');
      }
    } catch {
      toast.error('检测请求异常');
    } finally {
      setCheckingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleBatchHealthCheck = async () => {
    setBatchChecking(true);
    try {
      const res = await batchHealthCheckIpPool();
      if (res.code === 0) {
        toast.success(`批量检测完成，共 ${res.data?.checked || 0} 个`);
        loadData();
      } else {
        toast.error(res.msg || '批量检测失败');
      }
    } catch {
      toast.error('批量检测请求异常');
    } finally {
      setBatchChecking(false);
    }
  };

  // ===================== Export =====================

  const handleOpenExport = (id?: number) => {
    setExportTargetId(id ?? null);
    setExportFormat('general');
    setExportResult('');
    onExportOpen();
  };

  const handleExport = async () => {
    if (!exportTargetId) {
      toast.error('请选择要导出的 IP');
      return;
    }
    setExporting(true);
    try {
      const res = await exportProxyConfig(exportTargetId, exportFormat);
      if (res.code === 0) {
        setExportResult(res.data || '');
        toast.success('导出成功');
      } else {
        toast.error(res.msg || '导出失败');
      }
    } catch {
      toast.error('导出请求异常');
    } finally {
      setExporting(false);
    }
  };

  const handleCopyExport = () => {
    navigator.clipboard.writeText(exportResult).then(
      () => toast.success('已复制到剪贴板'),
      () => toast.error('复制失败'),
    );
  };

  // ===================== Bind to Shop =====================

  const handleOpenBind = async (item: IpPoolItem) => {
    setBindIpId(item.id);
    setBindIpName(`${item.name} (${item.exitIp}:${item.exitPort})`);
    setSelectedShopId(null);
    setShopListLoading(true);
    onBindOpen();
    try {
      const res = await listShopAccount({});
      if (res.code === 0) {
        const records = res.data?.records || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setShopList(records.map((r: any) => ({
          id: r.shop?.id ?? r.id,
          name: r.shop?.name ?? r.name ?? '',
          platform: r.shop?.platform ?? r.platform ?? '',
          ipPoolId: r.shop?.ipPoolId ?? r.ipPoolId,
        })));
      }
    } catch {
      toast.error('加载店铺列表失败');
    } finally {
      setShopListLoading(false);
    }
  };

  const handleBind = async () => {
    if (!bindIpId || !selectedShopId) { toast.error('请选择店铺'); return; }
    setBindLoading(true);
    try {
      const res = await bindShopIp(selectedShopId, bindIpId);
      if (res.code === 0) {
        toast.success('绑定成功');
        onBindClose();
        loadData();
      } else {
        toast.error(res.msg || '绑定失败');
      }
    } catch {
      toast.error('绑定请求异常');
    } finally {
      setBindLoading(false);
    }
  };

  // ===================== Derived =====================

  const countryOptions = stats?.byCountry
    ? [{ value: '', label: '全部国家' }, ...Object.keys(stats.byCountry).map(c => ({ value: c, label: c }))]
    : [{ value: '', label: '全部国家' }];

  const idleShops = shopList.filter(s => !s.ipPoolId);
  const boundShops = shopList.filter(s => !!s.ipPoolId);

  // ===================== Render =====================

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 标题 & 功能说明 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">IP 池管理</h1>
          <p className="text-sm text-default-400 mt-1">
            管理代理出口 IP 资源，支持健康检测、店铺绑定和代理配置导出（紫鸟 / AdsPower / 通用格式）
          </p>
        </div>
        <div className="flex gap-2">
          <Tooltip content="对所有 IP 执行 TCP 连通性测试，更新健康状态">
            <Button
              size="sm"
              variant="flat"
              isLoading={batchChecking}
              onPress={handleBatchHealthCheck}
            >
              批量健康检测
            </Button>
          </Tooltip>
          {canWrite && (
            <Button size="sm" color="primary" onPress={handleOpenCreate}>
              添加 IP
            </Button>
          )}
        </div>
      </div>

      {/* 使用指引（仅在无数据时显示） */}
      {!loading && list.length === 0 && !keyword && !filterIpType && !filterHealth && !filterCountry && (
        <Card shadow="sm" className="border border-primary/20 bg-primary-50/10">
          <CardBody className="py-4 px-5">
            <h2 className="text-sm font-semibold mb-2">快速上手</h2>
            <ol className="text-sm text-default-600 list-decimal pl-4 space-y-1">
              <li><strong>添加 IP</strong> — 点击右上角「添加 IP」，填入代理服务器的出口 IP、端口、协议和认证信息</li>
              <li><strong>健康检测</strong> — 添加后点击「检测」按钮验证连通性，系统会自动计算延迟评分</li>
              <li><strong>绑定店铺</strong> — 将 IP 绑定到店铺账号，实现 1 个 IP 对应 1 个店铺的环境隔离</li>
              <li><strong>导出配置</strong> — 导出代理配置到指纹浏览器（紫鸟/AdsPower），一键粘贴使用</li>
            </ol>
            <p className="text-xs text-default-400 mt-3">
              IP 来源可以是购买的代理服务商、GOST 转发隧道的出口 IP、或自建的 VPN 节点
            </p>
          </CardBody>
        </Card>
      )}

      {/* 统计卡片 */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="总数" value={stats.total} />
          <StatCard label="已绑定" value={stats.bound} color="text-primary" hint="已分配给店铺的 IP" />
          <StatCard label="空闲" value={stats.idle} color="text-default-500" hint="未绑定店铺，可分配" />
          <StatCard label="健康" value={stats.healthy} color="text-success" hint="TCP 连通且延迟正常" />
          <StatCard label="降级" value={stats.degraded} color="text-warning" hint="延迟较高或不稳定" />
          <StatCard label="不可用" value={stats.down} color="text-danger" hint="TCP 连接失败" />
        </div>
      )}

      {/* 国家分布 */}
      {stats?.byCountry && Object.keys(stats.byCountry).length > 0 && (
        <Card shadow="sm">
          <CardBody className="flex flex-row flex-wrap gap-2 py-2">
            <span className="text-sm text-default-500 mr-1">国家分布:</span>
            {Object.entries(stats.byCountry).map(([code, count]) => (
              <Chip key={code} size="sm" variant="flat">{code}: {count}</Chip>
            ))}
          </CardBody>
        </Card>
      )}

      {/* 搜索与筛选 */}
      <div className="flex flex-wrap gap-2 items-end">
        <Input
          size="sm"
          placeholder="搜索名称 / IP / 备注"
          className="w-48"
          value={keyword}
          onValueChange={setKeyword}
          isClearable
          onClear={() => setKeyword('')}
        />
        <Select
          size="sm"
          className="w-36"
          selectedKeys={filterIpType ? [filterIpType] : []}
          onSelectionChange={keys => {
            const val = Array.from(keys)[0] as string || '';
            setFilterIpType(val);
          }}
          placeholder="IP类型"
          aria-label="IP类型筛选"
        >
          {[{ value: '', label: '全部类型' }, ...IP_TYPE_OPTIONS].map(o => (
            <SelectItem key={o.value}>{o.label}</SelectItem>
          ))}
        </Select>
        <Select
          size="sm"
          className="w-36"
          selectedKeys={filterHealth ? [filterHealth] : []}
          onSelectionChange={keys => {
            const val = Array.from(keys)[0] as string || '';
            setFilterHealth(val);
          }}
          placeholder="健康状态"
          aria-label="健康状态筛选"
        >
          {HEALTH_STATUS_OPTIONS.map(o => (
            <SelectItem key={o.value}>{o.label}</SelectItem>
          ))}
        </Select>
        <Select
          size="sm"
          className="w-36"
          selectedKeys={filterCountry ? [filterCountry] : []}
          onSelectionChange={keys => {
            const val = Array.from(keys)[0] as string || '';
            setFilterCountry(val);
          }}
          placeholder="国家/地区"
          aria-label="国家筛选"
        >
          {countryOptions.map(o => (
            <SelectItem key={o.value}>{o.label}</SelectItem>
          ))}
        </Select>
      </div>

      {/* 表格 */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <Table removeWrapper aria-label="IP池列表">
          <TableHeader>
            <TableColumn>名称</TableColumn>
            <TableColumn>出口 IP:端口</TableColumn>
            <TableColumn>协议</TableColumn>
            <TableColumn>类型</TableColumn>
            <TableColumn>国家/地区</TableColumn>
            <TableColumn>健康状态</TableColumn>
            <TableColumn>绑定店铺</TableColumn>
            <TableColumn>操作</TableColumn>
          </TableHeader>
          <TableBody emptyContent="暂无 IP 数据，点击右上角「添加 IP」开始">
            {list.map(item => (
              <TableRow key={item.id}>
                <TableCell>
                  <div>
                    <span className="font-medium">{item.name}</span>
                    {item.usagePurpose && (
                      <p className="text-xs text-default-400">{item.usagePurpose}</p>
                    )}
                    {item.remark && (
                      <p className="text-xs text-default-400 truncate max-w-[160px]">{item.remark}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {item.exitIp}:{item.exitPort}
                </TableCell>
                <TableCell>
                  <Chip size="sm" variant="flat">{item.protocol.toUpperCase()}</Chip>
                </TableCell>
                <TableCell>{IP_TYPE_LABEL[item.ipType] || item.ipType}</TableCell>
                <TableCell>{item.countryCode || '-'}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    {healthChip(item.healthStatus)}
                    {item.lastCheckTime && (
                      <span className="text-xs text-default-400">{formatTime(item.lastCheckTime)}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {item.boundShopName ? (
                    <Chip size="sm" color="primary" variant="flat">{item.boundShopName}</Chip>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="text-default-400 text-sm">空闲</span>
                      {canWrite && (
                        <Tooltip content="将此 IP 绑定到一个店铺账号">
                          <Button size="sm" variant="light" color="primary" onPress={() => handleOpenBind(item)}>
                            绑定
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {canWrite && (
                      <Button size="sm" variant="light" onPress={() => handleOpenEdit(item)}>
                        编辑
                      </Button>
                    )}
                    <Tooltip content="TCP 连通性测试，检测代理是否可用">
                      <Button
                        size="sm"
                        variant="light"
                        isLoading={checkingIds.has(item.id)}
                        onPress={() => handleHealthCheck(item.id)}
                      >
                        检测
                      </Button>
                    </Tooltip>
                    <Tooltip content="导出代理配置，可粘贴到指纹浏览器">
                      <Button
                        size="sm"
                        variant="light"
                        onPress={() => handleOpenExport(item.id)}
                      >
                        导出
                      </Button>
                    </Tooltip>
                    {canWrite && (
                      <Button
                        size="sm"
                        variant="light"
                        color="danger"
                        onPress={() => handleConfirmDelete(item)}
                      >
                        删除
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* 创建/编辑模态框 */}
      <Modal isOpen={isFormOpen} onClose={onFormClose} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{isEdit ? '编辑 IP' : '添加 IP'}</ModalHeader>
          <ModalBody>
            {!isEdit && (
              <div className="text-sm text-default-400 bg-default-50 rounded-lg p-3 mb-2">
                填入代理服务器信息。如果是 GOST 转发的隧道出口，填写 GOST 节点的入口 IP 和转发端口。
                代理用户名/密码为可选项，取决于代理服务商是否要求认证。
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="名称"
                isRequired
                placeholder="例: US-住宅-01"
                description="建议格式：国家-类型-编号"
                value={form.name}
                onValueChange={v => setForm(f => ({ ...f, name: v }))}
              />
              <Input
                label="出口 IP"
                isRequired
                placeholder="例: 154.23.45.67"
                description="代理服务器的公网 IP 地址"
                value={form.exitIp}
                onValueChange={v => setForm(f => ({ ...f, exitIp: v }))}
              />
              <Input
                label="端口"
                isRequired
                type="number"
                placeholder="例: 10800"
                description="代理监听端口"
                value={String(form.exitPort)}
                onValueChange={v => setForm(f => ({ ...f, exitPort: v ? Number(v) : '' }))}
              />
              <Select
                label="协议"
                selectedKeys={[form.protocol]}
                onSelectionChange={keys => {
                  const val = Array.from(keys)[0] as string;
                  if (val) setForm(f => ({ ...f, protocol: val }));
                }}
                description="SOCKS5 最常用，部分浏览器仅支持 HTTP"
              >
                {PROTOCOL_OPTIONS.map(o => (
                  <SelectItem key={o.value}>{o.label}</SelectItem>
                ))}
              </Select>
              <Input
                label="代理用户名"
                placeholder="可选"
                value={form.proxyUser}
                onValueChange={v => setForm(f => ({ ...f, proxyUser: v }))}
              />
              <Input
                label="代理密码"
                type="password"
                placeholder="可选"
                value={form.proxyPass}
                onValueChange={v => setForm(f => ({ ...f, proxyPass: v }))}
              />
              <Select
                label="IP 类型"
                selectedKeys={[form.ipType]}
                onSelectionChange={keys => {
                  const val = Array.from(keys)[0] as string;
                  if (val) setForm(f => ({ ...f, ipType: val }));
                }}
                description="住宅 IP 最安全，数据中心 IP 易被识别"
              >
                {IP_TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value}>{o.label}</SelectItem>
                ))}
              </Select>
              <Input
                label="国家/地区代码"
                placeholder="例: US, HK, JP"
                description="ISO 3166-1 两字母代码"
                value={form.countryCode}
                onValueChange={v => setForm(f => ({ ...f, countryCode: v.toUpperCase() }))}
              />
              <Input
                label="地区"
                placeholder="例: 加利福尼亚"
                value={form.region}
                onValueChange={v => setForm(f => ({ ...f, region: v }))}
              />
              <Input
                label="ISP"
                placeholder="例: Comcast"
                description="运营商信息，有助判断 IP 质量"
                value={form.isp}
                onValueChange={v => setForm(f => ({ ...f, isp: v }))}
              />
              <Input
                label="用途"
                className="col-span-2"
                placeholder="例: TikTok 美区店铺"
                value={form.usagePurpose}
                onValueChange={v => setForm(f => ({ ...f, usagePurpose: v }))}
              />
              <Textarea
                label="备注"
                className="col-span-2"
                placeholder="其他备注信息"
                value={form.remark}
                onValueChange={v => setForm(f => ({ ...f, remark: v }))}
                minRows={2}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onFormClose}>取消</Button>
            <Button color="primary" isLoading={submitting} onPress={handleSubmit}>
              {isEdit ? '保存' : '创建'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 删除确认 */}
      <Modal isOpen={isDeleteOpen} onClose={onDeleteClose} size="sm">
        <ModalContent>
          <ModalHeader>确认删除</ModalHeader>
          <ModalBody>
            <p>确定要删除 <strong>{deleteTarget?.name}</strong> ({deleteTarget?.exitIp}:{deleteTarget?.exitPort}) 吗？</p>
            {deleteTarget?.boundShopName && (
              <p className="text-warning text-sm mt-2">
                该 IP 当前已绑定店铺「{deleteTarget.boundShopName}」，删除后将自动解绑。
              </p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onDeleteClose}>取消</Button>
            <Button color="danger" isLoading={deleting} onPress={handleDelete}>删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 导出代理配置模态框 */}
      <Modal isOpen={isExportOpen} onClose={onExportClose} size="lg">
        <ModalContent>
          <ModalHeader>导出代理配置</ModalHeader>
          <ModalBody>
            <div className="text-sm text-default-400 bg-default-50 rounded-lg p-3 mb-3">
              选择导出格式后点击「生成」，将配置粘贴到对应的指纹浏览器代理设置中。
              <br />
              <strong>紫鸟</strong>：直接粘贴 proxyUrl 到代理配置
              <strong className="ml-3">AdsPower</strong>：粘贴 JSON 到代理导入
              <strong className="ml-3">通用</strong>：标准 URL 格式
            </div>
            <div className="flex gap-2 items-end mb-3">
              <Select
                label="导出格式"
                className="w-48"
                selectedKeys={[exportFormat]}
                onSelectionChange={keys => {
                  const val = Array.from(keys)[0] as string;
                  if (val) setExportFormat(val);
                }}
              >
                {EXPORT_FORMATS.map(o => (
                  <SelectItem key={o.value}>{o.label}</SelectItem>
                ))}
              </Select>
              <Button color="primary" isLoading={exporting} onPress={handleExport}>
                生成
              </Button>
            </div>
            {exportResult && (
              <div className="flex flex-col gap-2">
                <Textarea
                  isReadOnly
                  value={exportResult}
                  minRows={4}
                  maxRows={12}
                  classNames={{ input: 'font-mono text-xs' }}
                />
                <Button size="sm" variant="flat" onPress={handleCopyExport}>
                  复制到剪贴板
                </Button>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onExportClose}>关闭</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 绑定店铺模态框 */}
      <Modal isOpen={isBindOpen} onClose={onBindClose} size="lg">
        <ModalContent>
          <ModalHeader>绑定店铺</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-500 mb-3">
              将 IP <strong>{bindIpName}</strong> 绑定到一个店铺账号。
              每个 IP 仅能绑定 1 个店铺，确保环境隔离。
            </p>
            {shopListLoading ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : (
              <>
                {idleShops.length > 0 ? (
                  <>
                    <p className="text-xs text-default-400 mb-2">未绑定 IP 的店铺（{idleShops.length} 个）：</p>
                    <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                      {idleShops.map(shop => (
                        <div
                          key={shop.id}
                          onClick={() => setSelectedShopId(shop.id)}
                          className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            selectedShopId === shop.id
                              ? 'border-primary bg-primary-50/30'
                              : 'border-default-200 hover:bg-default-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{shop.name}</span>
                            <Chip size="sm" variant="flat">{shop.platform}</Chip>
                          </div>
                          {selectedShopId === shop.id && (
                            <Chip size="sm" color="primary" variant="solid">已选</Chip>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-6 text-default-400">
                    <p>所有店铺都已绑定 IP</p>
                    <p className="text-xs mt-1">请先在「店铺管理」中创建新的店铺账号</p>
                  </div>
                )}
                {boundShops.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-default-400 mb-1">已绑定其他 IP 的店铺（{boundShops.length} 个）：</p>
                    <div className="flex flex-wrap gap-1">
                      {boundShops.slice(0, 10).map(shop => (
                        <Tooltip key={shop.id} content="该店铺已绑定其他 IP，需先在店铺管理中解绑">
                          <Chip size="sm" variant="flat" color="default">{shop.name}</Chip>
                        </Tooltip>
                      ))}
                      {boundShops.length > 10 && <span className="text-xs text-default-400">...等 {boundShops.length} 个</span>}
                    </div>
                  </div>
                )}
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onBindClose}>取消</Button>
            <Button
              color="primary"
              isLoading={bindLoading}
              isDisabled={!selectedShopId}
              onPress={handleBind}
            >
              确认绑定
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

// ===================== Sub-components =====================

function StatCard({ label, value, color, hint }: { label: string; value: number; color?: string; hint?: string }) {
  const content = (
    <Card shadow="sm" className={hint ? 'cursor-help' : ''}>
      <CardBody className="flex flex-col items-center py-3">
        <span className="text-xs text-default-500">{label}</span>
        <span className={`text-xl font-bold ${color || ''}`}>{value}</span>
      </CardBody>
    </Card>
  );
  if (hint) return <Tooltip content={hint}>{content}</Tooltip>;
  return content;
}
