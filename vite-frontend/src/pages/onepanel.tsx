import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input, Textarea } from "@heroui/input";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/modal";
import { Select, SelectItem } from "@heroui/select";
import { Spinner } from "@heroui/spinner";
import { Switch } from "@heroui/switch";
import { Tab, Tabs } from "@heroui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/table";

import {
  AssetHost,
  OnePanelAppSummary,
  OnePanelBackupSummary,
  OnePanelBootstrap,
  OnePanelContainerSummary,
  OnePanelCronjobSummary,
  OnePanelExporterReport,
  OnePanelInstance,
  OnePanelInstanceDetail,
  OnePanelWebsiteSummary,
  createOnePanelInstance,
  deleteOnePanelInstance,
  diagnoseOnePanelInstance,
  getAssetList,
  getOnePanelDetail,
  getOnePanelList,
  updateOnePanelInstance,
} from '@/api';
import { hasPermission } from '@/utils/auth';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface OnePanelForm {
  id?: number;
  name: string;
  assetId: string;
  panelUrl: string;
  reportEnabled: boolean;
  remark: string;
}

const emptyForm = (): OnePanelForm => ({
  name: '',
  assetId: '__none__',
  panelUrl: '',
  reportEnabled: true,
  remark: '',
});

const normalize = (value?: string | null) => (value || '').trim().toLowerCase();

const formatDate = (value?: number | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
};

const formatPercent = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return `${value.toFixed(1)}%`;
};

const copyText = async (value: string, successMessage: string) => {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
  } catch {
    toast.error('复制失败，请手动复制');
  }
};

const getStatusChip = (status?: string | null) => {
  switch (status) {
    case 'success':
      return { color: 'success' as const, text: '上报正常' };
    case 'failed':
      return { color: 'danger' as const, text: '上报失败' };
    case 'never':
    default:
      return { color: 'default' as const, text: '未上报' };
  }
};

function renderNameValueGrid(report?: OnePanelExporterReport | null) {
  const system = report?.system;
  const audit = report?.audit;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card className="border border-divider/80">
        <CardBody className="gap-2 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-default-400">System</p>
          <p className="text-base font-semibold">{system?.hostName || '-'}</p>
          <p className="text-xs text-default-500">{system?.os || '-'} · {system?.architecture || '-'}</p>
          <p className="text-xs text-default-500">Kernel: {system?.kernelVersion || '-'}</p>
        </CardBody>
      </Card>
      <Card className="border border-divider/80">
        <CardBody className="gap-2 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-default-400">Services</p>
          <div className="flex flex-wrap gap-2">
            <Chip size="sm" color={report?.system?.dockerRunning ? 'success' : 'default'} variant="flat">Docker</Chip>
            <Chip size="sm" color={report?.system?.openrestyRunning ? 'success' : 'default'} variant="flat">OpenResty</Chip>
          </div>
          <p className="text-xs text-default-500">Panel: {report?.panelVersion || '-'} {report?.panelEdition ? `· ${report.panelEdition}` : ''}</p>
          <p className="text-xs text-default-500">Exporter: {report?.exporterVersion || '-'}</p>
        </CardBody>
      </Card>
      <Card className="border border-divider/80">
        <CardBody className="gap-2 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-default-400">Audit 24h</p>
          <p className="text-base font-semibold">失败登录 {audit?.loginFailedCount24h || 0}</p>
          <p className="text-xs text-default-500">操作 {audit?.operationCount24h || 0}</p>
          <p className="text-xs text-default-500">高风险 {audit?.riskyOperationCount24h || 0}</p>
        </CardBody>
      </Card>
      <Card className="border border-divider/80">
        <CardBody className="gap-2 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-default-400">Reported</p>
          <p className="text-base font-semibold">{formatDate(report?.reportTime)}</p>
          <p className="text-xs text-default-500">Apps {report?.apps?.length || 0} · Sites {report?.websites?.length || 0}</p>
          <p className="text-xs text-default-500">Containers {report?.containers?.length || 0} · Cron {report?.cronjobs?.length || 0}</p>
        </CardBody>
      </Card>
    </div>
  );
}

export default function OnePanelPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canRead = hasPermission('onepanel.read');
  const canUpdate = hasPermission('onepanel.update');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [instances, setInstances] = useState<OnePanelInstance[]>([]);
  const [assets, setAssets] = useState<AssetHost[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [diagnoseOpen, setDiagnoseOpen] = useState(false);
  const [diagnoseLoading, setDiagnoseLoading] = useState(false);
  const [diagnoseResult, setDiagnoseResult] = useState<any>(null);

  const [isEdit] = useState(false);
  const [form, setForm] = useState<OnePanelForm>(emptyForm());
  const [selected, setSelected] = useState<OnePanelInstance | null>(null);
  const [detail, setDetail] = useState<OnePanelInstanceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [bootstrap, setBootstrap] = useState<OnePanelBootstrap | null>(null);
  const focusAssetId = Number(searchParams.get('assetId') || 0);
  const focusInstanceId = Number(searchParams.get('instanceId') || 0);

  const assetOptions = useMemo(() => (
    [{ key: '__none__', label: '不绑定资产', description: '稍后再和服务器资产建立关系' }].concat(
      assets.map((item) => ({
        key: item.id.toString(),
        label: item.name,
        description: `${item.primaryIp || '-'}${item.environment ? ` · ${item.environment}` : ''}${item.region ? ` · ${item.region}` : ''}`
      }))
    )
  ), [assets]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [instanceRes, assetRes] = await Promise.all([
        getOnePanelList(),
        getAssetList(),
      ]);
      if (instanceRes.code === 0 && Array.isArray(instanceRes.data)) {
        setInstances(instanceRes.data as OnePanelInstance[]);
      }
      if (assetRes.code === 0 && Array.isArray(assetRes.data)) {
        setAssets(assetRes.data as AssetHost[]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canRead) return;
    void loadData();
  }, [canRead]);

  useEffect(() => {
    if (!focusInstanceId || instances.length === 0) return;
    const target = instances.find((item) => item.id === focusInstanceId);
    if (target) {
      void loadDetail(target);
    }
  }, [focusInstanceId, instances]);

  const filteredInstances = useMemo(() => {
    const q = normalize(keyword);
    const scoped = focusAssetId > 0 ? instances.filter((item) => item.assetId === focusAssetId) : instances;
    if (!q) return scoped;
    return scoped.filter((item) => [
      item.name,
      item.assetName,
      item.assetPrimaryIp,
      item.panelUrl,
      item.panelVersion,
      item.panelEdition,
      item.exporterVersion,
      item.remark,
    ].some((value) => normalize(value).includes(q)));
  }, [instances, keyword, focusAssetId]);

  const summary = useMemo(() => ({
    total: instances.length,
    online: instances.filter((item) => item.lastReportStatus === 'success').length,
    apps: instances.reduce((sum, item) => sum + (item.appCount || 0), 0),
    websites: instances.reduce((sum, item) => sum + (item.websiteCount || 0), 0),
    containers: instances.reduce((sum, item) => sum + (item.containerCount || 0), 0),
  }), [instances]);

  const loadDetail = async (item: OnePanelInstance) => {
    setSelected(item);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const response = await getOnePanelDetail(item.id);
      if (response.code === 0 && response.data) {
        setDetail(response.data as OnePanelInstanceDetail);
      } else {
        toast.error(response.msg || '读取详情失败');
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const onSubmit = async () => {
    setSaving(true);
    try {
      const payload = {
        id: form.id,
        name: form.name,
        assetId: form.assetId && form.assetId !== '__none__' ? Number(form.assetId) : null,
        panelUrl: form.panelUrl || null,
        reportEnabled: form.reportEnabled ? 1 : 0,
        remark: form.remark || null,
      };

      if (isEdit && form.id) {
        const response = await updateOnePanelInstance(payload);
        if (response.code === 0) {
          toast.success('1Panel 实例已更新');
          setFormOpen(false);
          await loadData();
        } else {
          toast.error(response.msg || '更新失败');
        }
      } else {
        const response = await createOnePanelInstance(payload);
        if (response.code === 0 && response.data) {
          toast.success('1Panel 实例已创建');
          setBootstrap(response.data as OnePanelBootstrap);
          setBootstrapOpen(true);
          setFormOpen(false);
          await loadData();
        } else {
          toast.error(response.msg || '创建失败');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await deleteOnePanelInstance(selected.id);
      if (response.code === 0) {
        toast.success('1Panel 实例已删除');
        setDeleteOpen(false);
        setSelected(null);
        await loadData();
      } else {
        toast.error(response.msg || '删除失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const onDiagnose = async (item: OnePanelInstance) => {
    setSelected(item);
    setDiagnoseOpen(true);
    setDiagnoseLoading(true);
    setDiagnoseResult(null);
    try {
      const response = await diagnoseOnePanelInstance(item.id);
      if (response.code === 0 && response.data) {
        setDiagnoseResult(response.data);
      } else {
        toast.error(response.msg || '诊断失败');
      }
    } finally {
      setDiagnoseLoading(false);
    }
  };

  if (!canRead) {
    return (
      <Card className="border border-danger/20 bg-danger-50/60">
        <CardBody className="p-6">
          <h1 className="text-xl font-semibold text-danger">缺少 1Panel 查看权限</h1>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">1Panel 摘要</h1>
          <p className="mt-1 max-w-4xl text-sm text-default-500">
            通过本地 exporter 汇总每台服务器的应用、网站、容器、任务和备份摘要。Flux 只收脱敏摘要，不集中保存 1Panel 管理员密钥。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canUpdate ? (
            <Button color="primary" variant="flat" onPress={() => navigate('/assets')}>
              去服务器资产配置
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="border border-primary/20 bg-primary-50/40">
        <CardBody className="flex flex-col gap-2 p-4 text-sm text-primary-900">
          <p>1Panel 地址只在服务器资产里录入一次。</p>
          <p>摘要实例的创建、Token 轮换、移除，也统一从“服务器资产 -&gt; 编辑 -&gt; 服务接入”完成；当前页面只负责汇总查看。</p>
        </CardBody>
      </Card>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <Card className="border border-divider/80"><CardBody className="gap-2 p-5"><p className="text-xs uppercase tracking-[0.18em] text-default-400">Instances</p><p className="text-3xl font-semibold">{summary.total}</p><p className="text-sm text-default-500">已注册 exporter 节点</p></CardBody></Card>
        <Card className="border border-divider/80"><CardBody className="gap-2 p-5"><p className="text-xs uppercase tracking-[0.18em] text-default-400">Reporting</p><p className="text-3xl font-semibold">{summary.online}</p><p className="text-sm text-default-500">最近一次上报成功</p></CardBody></Card>
        <Card className="border border-divider/80"><CardBody className="gap-2 p-5"><p className="text-xs uppercase tracking-[0.18em] text-default-400">Apps</p><p className="text-3xl font-semibold">{summary.apps}</p><p className="text-sm text-default-500">已汇总应用</p></CardBody></Card>
        <Card className="border border-divider/80"><CardBody className="gap-2 p-5"><p className="text-xs uppercase tracking-[0.18em] text-default-400">Websites</p><p className="text-3xl font-semibold">{summary.websites}</p><p className="text-sm text-default-500">已汇总站点</p></CardBody></Card>
        <Card className="border border-divider/80"><CardBody className="gap-2 p-5"><p className="text-xs uppercase tracking-[0.18em] text-default-400">Containers</p><p className="text-3xl font-semibold">{summary.containers}</p><p className="text-sm text-default-500">已汇总容器</p></CardBody></Card>
      </div>

      <Card className="border border-divider/80">
        <CardBody className="gap-4 p-4">
          <Input
            label="搜索"
            placeholder="实例 / 服务器 / IP / 版本 / 备注"
            value={keyword}
            onValueChange={setKeyword}
          />

          {loading ? (
            <div className="flex h-52 items-center justify-center"><Spinner size="lg" /></div>
          ) : (
            <Table aria-label="1Panel instance list" removeWrapper isHeaderSticky>
              <TableHeader>
                <TableColumn>实例</TableColumn>
                <TableColumn>绑定服务器</TableColumn>
                <TableColumn>摘要规模</TableColumn>
                <TableColumn>版本</TableColumn>
                <TableColumn>最近上报</TableColumn>
                <TableColumn>操作</TableColumn>
              </TableHeader>
              <TableBody items={filteredInstances} emptyContent="暂无 1Panel exporter 实例，请前往服务器资产完成配置。">
                {(item) => {
                  const status = getStatusChip(item.lastReportStatus);
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="min-w-[220px]">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{item.name}</p>
                            <Chip size="sm" variant="flat" color={item.reportEnabled !== 0 ? 'success' : 'warning'}>
                              {item.reportEnabled !== 0 ? '上报开启' : '上报关闭'}
                            </Chip>
                          </div>
                          <p className="mt-1 text-xs font-mono text-default-500">{item.instanceKey}</p>
                          <p className="mt-1 text-xs text-default-500">{item.remark || '本地 exporter 只上传脱敏摘要'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-[160px]">
                          <p className="text-sm font-medium">{item.assetName || '-'}</p>
                          <p className="mt-1 text-xs text-default-500">{item.assetPrimaryIp || '-'}{item.assetEnvironment ? ` · ${item.assetEnvironment}` : ''}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-[180px] text-xs text-default-600">
                          <p>应用 {item.appCount || 0} · 站点 {item.websiteCount || 0}</p>
                          <p className="mt-1">容器 {item.containerCount || 0} · 任务 {item.cronjobCount || 0}</p>
                          <p className="mt-1">备份 {item.backupCount || 0}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-[150px]">
                          <p className="text-sm font-medium">{item.panelVersion || '-'}</p>
                          <p className="mt-1 text-xs text-default-500">{item.panelEdition || '-'} · exporter {item.exporterVersion || '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-[170px]">
                          <Chip size="sm" variant="flat" color={status.color}>{status.text}</Chip>
                          <p className="mt-2 text-xs text-default-500">{formatDate(item.lastReportAt)}</p>
                          <p className="mt-1 text-xs text-default-500">{item.lastReportRemoteIp || '-'}</p>
                          {item.lastReportError ? <p className="mt-1 text-xs text-danger">{item.lastReportError}</p> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="flat" onPress={() => loadDetail(item)}>详情</Button>
                          <Button size="sm" variant="flat" color="warning" onPress={() => void onDiagnose(item)}>诊断</Button>
                          {item.panelUrl ? (
                            <Button size="sm" variant="flat" color="secondary" as="a" href={item.panelUrl} target="_blank" rel="noreferrer">
                              打开 1Panel
                            </Button>
                          ) : null}
                          {item.assetId ? (
                            <Button size="sm" variant="flat" color="primary" onPress={() => navigate(`/assets?viewId=${item.assetId}`)}>
                              查看资产
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={formOpen} onOpenChange={(open) => !open && setFormOpen(false)} size="3xl" scrollBehavior="inside" isDismissable={!saving}>
        <ModalContent>
          <ModalHeader>{isEdit ? '编辑 1Panel 实例' : '新增 1Panel 实例'}</ModalHeader>
          <ModalBody className="space-y-4">
            <Input label="实例名称" value={form.name} onValueChange={(value) => setForm((prev) => ({ ...prev, name: value }))} />
            <Select
              label="绑定服务器资产"
              items={assetOptions}
              selectedKeys={[form.assetId]}
              onSelectionChange={(keys) => {
                const value = String(Array.from(keys)[0] || '__none__');
                const asset = assets.find((item) => item.id.toString() === value);
                setForm((prev) => ({
                  ...prev,
                  assetId: value,
                  panelUrl: prev.panelUrl || asset?.panelUrl || '',
                }));
              }}
            >
              {(item) => <SelectItem key={item.key} description={item.description}>{item.label}</SelectItem>}
            </Select>
            <Input label="1Panel 地址" placeholder="https://panel.example.com" value={form.panelUrl} onValueChange={(value) => setForm((prev) => ({ ...prev, panelUrl: value }))} />
            <Switch isSelected={form.reportEnabled} onValueChange={(value) => setForm((prev) => ({ ...prev, reportEnabled: value }))}>
              启用 exporter 上报
            </Switch>
            <Textarea label="备注" minRows={3} value={form.remark} onValueChange={(value) => setForm((prev) => ({ ...prev, remark: value }))} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setFormOpen(false)}>取消</Button>
            <Button color="primary" isLoading={saving} onPress={() => void onSubmit()}>
              {isEdit ? '保存修改' : '创建并生成 Token'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={deleteOpen} onOpenChange={(open) => !open && setDeleteOpen(false)}>
        <ModalContent>
          <ModalHeader>删除 1Panel 实例</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-600">
              将删除实例配置和最新摘要快照：<span className="font-semibold text-foreground">{selected?.name}</span>
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setDeleteOpen(false)}>取消</Button>
            <Button color="danger" isLoading={saving} onPress={() => void onDelete()}>确认删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={bootstrapOpen} onOpenChange={(open) => !open && setBootstrapOpen(false)} size="4xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>Exporter 安装参数</ModalHeader>
          <ModalBody className="space-y-4">
            <Card className="border border-warning/20 bg-warning-50/50">
              <CardBody className="gap-2 p-4 text-sm text-warning-800">
                <p>下面的 Node Token 只展示一次。Flux 不保存 1Panel API Key，目标服务器只需要把本地 1Panel API Key 写进 exporter 环境变量。</p>
              </CardBody>
            </Card>
            <Input
              label="Node Token"
              value={bootstrap?.nodeToken || ''}
              readOnly
              endContent={<Button size="sm" variant="light" onPress={() => void copyText(bootstrap?.nodeToken || '', 'Node Token 已复制')}>复制</Button>}
            />
            <Textarea
              label="环境变量模板"
              minRows={12}
              value={bootstrap?.envTemplate || ''}
              readOnly
              endContent={null}
            />
            <div className="flex justify-end">
              <Button size="sm" variant="flat" onPress={() => void copyText(bootstrap?.envTemplate || '', '环境变量模板已复制')}>
                复制环境变量模板
              </Button>
            </div>
            <Textarea label="安装提示" minRows={3} value={bootstrap?.installSnippet || ''} readOnly />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setBootstrapOpen(false)}>关闭</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={diagnoseOpen} onOpenChange={(open) => !open && setDiagnoseOpen(false)} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>连通性诊断: {selected?.name || ''}</ModalHeader>
          <ModalBody className="space-y-4">
            {diagnoseLoading ? (
              <div className="flex h-40 items-center justify-center"><Spinner size="lg" /></div>
            ) : diagnoseResult ? (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-semibold">检查结果</p>
                  {(diagnoseResult.checks || []).map((check: string, i: number) => (
                    <div key={i} className={`rounded-lg px-3 py-2 text-sm ${check.startsWith('PASS') ? 'bg-success-50 text-success-700' : check.startsWith('WARN') ? 'bg-warning-50 text-warning-700' : 'bg-danger-50 text-danger-700'}`}>
                      {check}
                    </div>
                  ))}
                </div>
                {(diagnoseResult.suggestions || []).length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">建议操作</p>
                    {(diagnoseResult.suggestions || []).map((s: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg border border-divider/80 px-3 py-2 text-sm">
                        <span className="mt-0.5 text-default-400">→</span>
                        <span className="font-mono text-xs">{s}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {diagnoseResult.triggerCommand ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">手动触发同步 (在目标服务器上执行)</p>
                    <div className="flex items-center gap-2 rounded-lg bg-default-100 px-3 py-2">
                      <code className="flex-1 text-xs">{diagnoseResult.triggerCommand}</code>
                      <Button size="sm" variant="flat" onPress={() => void copyText(diagnoseResult.triggerCommand, '命令已复制')}>复制</Button>
                    </div>
                  </div>
                ) : null}
                <Card className="border border-primary/20 bg-primary-50/40">
                  <CardBody className="gap-1 p-4 text-xs text-primary-900">
                    <p className="font-semibold text-sm">关于 1Panel API Key</p>
                    <p>Flux 不存储 1Panel API Key，密钥仅保存在目标服务器的 /etc/flux-1panel-sync/.env 文件中 (权限 600)。</p>
                    <p>安装绑定完成后，不能关闭 1Panel 的 API 接口——exporter 每次同步都需要用 API Key 访问本地 1Panel API。</p>
                    <p>安全建议：将 1Panel API 接口的访问限制为仅 127.0.0.1 / 本机，避免对外暴露。</p>
                  </CardBody>
                </Card>
              </>
            ) : (
              <p className="text-sm text-default-500">暂无诊断结果。</p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => { setDiagnoseOpen(false); void loadData(); }}>关闭并刷新</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={detailOpen} onOpenChange={(open) => !open && setDetailOpen(false)} size="5xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{detail?.instance?.name || selected?.name || '1Panel 实例详情'}</ModalHeader>
          <ModalBody className="space-y-5">
            {detailLoading ? (
              <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
            ) : detail ? (
              <>
                {renderNameValueGrid(detail.latestReport)}
                <Tabs aria-label="onepanel detail tabs" color="primary" variant="underlined">
                  <Tab key="apps" title={`应用 (${detail.latestReport?.apps?.length || 0})`}>
                    <div className="grid gap-3">
                      {(detail.latestReport?.apps || []).length === 0 ? <p className="text-sm text-default-500">暂无应用摘要。</p> : (detail.latestReport?.apps || []).map((item: OnePanelAppSummary, index) => (
                        <Card key={`${item.appKey || item.name || 'app'}-${index}`} className="border border-divider/80">
                          <CardBody className="gap-2 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{item.name || item.appKey || '-'}</p>
                              <Chip size="sm" variant="flat" color={item.upgradeAvailable ? 'warning' : 'success'}>{item.upgradeAvailable ? '可升级' : (item.status || '未知')}</Chip>
                            </div>
                            <p className="text-xs text-default-500">{item.version || '-'} · {item.portSummary || '-'} · {item.accessUrl || '-'}</p>
                          </CardBody>
                        </Card>
                      ))}
                    </div>
                  </Tab>
                  <Tab key="websites" title={`网站 (${detail.latestReport?.websites?.length || 0})`}>
                    <div className="grid gap-3">
                      {(detail.latestReport?.websites || []).length === 0 ? <p className="text-sm text-default-500">暂无网站摘要。</p> : (detail.latestReport?.websites || []).map((item: OnePanelWebsiteSummary, index) => (
                        <Card key={`${item.websiteId || item.name || 'website'}-${index}`} className="border border-divider/80">
                          <CardBody className="gap-2 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{item.name || item.primaryDomain || '-'}</p>
                              <Chip size="sm" variant="flat" color={item.httpsEnabled ? 'success' : 'default'}>{item.httpsEnabled ? 'HTTPS' : 'HTTP'}</Chip>
                            </div>
                            <p className="text-xs text-default-500">{item.primaryDomain || '-'} · Runtime {item.runtimeName || '-'}</p>
                            <p className="text-xs text-default-500">代理 {item.proxyCount || 0} · 证书到期 {formatDate(item.certExpireAt)}</p>
                          </CardBody>
                        </Card>
                      ))}
                    </div>
                  </Tab>
                  <Tab key="containers" title={`容器 (${detail.latestReport?.containers?.length || 0})`}>
                    <div className="grid gap-3">
                      {(detail.latestReport?.containers || []).length === 0 ? <p className="text-sm text-default-500">暂无容器摘要。</p> : (detail.latestReport?.containers || []).map((item: OnePanelContainerSummary, index) => (
                        <Card key={`${item.containerId || item.name || 'container'}-${index}`} className="border border-divider/80">
                          <CardBody className="gap-2 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{item.name || item.containerId || '-'}</p>
                              <Chip size="sm" variant="flat" color={item.status === 'running' ? 'success' : 'default'}>{item.status || '未知'}</Chip>
                            </div>
                            <p className="text-xs text-default-500">{item.image || '-'} · Compose {item.composeProject || '-'}</p>
                            <p className="text-xs text-default-500">CPU {formatPercent(item.cpuPercent)} · MEM {formatPercent(item.memoryPercent)} · {item.portSummary || '-'}</p>
                          </CardBody>
                        </Card>
                      ))}
                    </div>
                  </Tab>
                  <Tab key="cronjobs" title={`任务 (${detail.latestReport?.cronjobs?.length || 0})`}>
                    <div className="grid gap-3">
                      {(detail.latestReport?.cronjobs || []).length === 0 ? <p className="text-sm text-default-500">暂无任务摘要。</p> : (detail.latestReport?.cronjobs || []).map((item: OnePanelCronjobSummary, index) => (
                        <Card key={`${item.cronjobId || item.name || 'cron'}-${index}`} className="border border-divider/80">
                          <CardBody className="gap-2 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{item.name || '-'}</p>
                              <Chip size="sm" variant="flat">{item.status || '未知'}</Chip>
                            </div>
                            <p className="text-xs text-default-500">{item.type || '-'} · {item.schedule || '-'}</p>
                            <p className="text-xs text-default-500">最近执行 {item.lastRecordStatus || '-'} · {formatDate(item.lastRecordAt)}</p>
                          </CardBody>
                        </Card>
                      ))}
                    </div>
                  </Tab>
                  <Tab key="backups" title={`备份 (${detail.latestReport?.backups?.length || 0})`}>
                    <div className="grid gap-3">
                      {(detail.latestReport?.backups || []).length === 0 ? <p className="text-sm text-default-500">暂无备份摘要。</p> : (detail.latestReport?.backups || []).map((item: OnePanelBackupSummary, index) => (
                        <Card key={`${item.backupType || item.sourceName || 'backup'}-${index}`} className="border border-divider/80">
                          <CardBody className="gap-2 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{item.sourceName || item.backupType || '-'}</p>
                              <Chip size="sm" variant="flat">{item.lastRecordStatus || '未知'}</Chip>
                            </div>
                            <p className="text-xs text-default-500">类型 {item.backupType || '-'} · 最近备份 {formatDate(item.lastBackupAt)}</p>
                            <p className="text-xs text-default-500">快照 {item.snapshotCount || 0} · 最新快照 {formatDate(item.latestSnapshotAt)}</p>
                          </CardBody>
                        </Card>
                      ))}
                    </div>
                  </Tab>
                </Tabs>
              </>
            ) : (
              <p className="text-sm text-default-500">暂无详细摘要。</p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setDetailOpen(false)}>关闭</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
