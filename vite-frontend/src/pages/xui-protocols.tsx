import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Spinner } from "@heroui/spinner";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";

import {
  XuiInboundDirectoryItem,
  XuiProtocolDirectory,
  getXuiProtocolDirectory,
} from '@/api';
import { hasPermission } from '@/utils/auth';

const formatDate = (value?: number | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const formatFlow = (value?: number | null) => {
  const bytes = value || 0;
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const normalize = (value?: string | null) => (value || '').trim().toLowerCase();

const getInboundStatus = (item: XuiInboundDirectoryItem) => {
  if (item.status === 1) return { label: '远端已删除', color: 'danger' as const };
  if (item.enable === 0) return { label: '已停用', color: 'warning' as const };
  return { label: '正常', color: 'success' as const };
};

export default function XuiProtocolsPage() {
  const navigate = useNavigate();
  const canViewXui = hasPermission('xui.read');
  const [loading, setLoading] = useState(true);
  const [directory, setDirectory] = useState<XuiProtocolDirectory | null>(null);
  const [keyword, setKeyword] = useState('');
  const [protocolFilter, setProtocolFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [serverFilter, setServerFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getXuiProtocolDirectory()
      .then((res) => {
        if (!cancelled && res.code === 0 && res.data) {
          setDirectory(res.data as XuiProtocolDirectory);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const items = directory?.items || [];
  const protocolOptions = useMemo(() => {
    const values = new Set<string>();
    items.forEach((item) => {
      const protocol = normalize(item.protocol);
      if (protocol) values.add(protocol);
    });
    return Array.from(values).sort();
  }, [items]);
  const protocolSelectOptions = useMemo(
    () => [{ key: 'all', label: '全部协议' }, ...protocolOptions.map((item) => ({ key: item, label: item }))],
    [protocolOptions],
  );

  const serverOptions = useMemo(() => {
    const values = new Map<string, string>();
    items.forEach((item) => {
      const key = String(item.assetId || item.instanceId);
      const label = item.assetName || item.hostLabel || item.instanceName || `实例 #${item.instanceId}`;
      values.set(key, label);
    });
    return Array.from(values.entries()).sort((a, b) => a[1].localeCompare(b[1], 'zh-CN'));
  }, [items]);
  const serverSelectOptions = useMemo(
    () => [{ key: 'all', label: '全部服务器' }, ...serverOptions.map(([key, label]) => ({ key, label }))],
    [serverOptions],
  );

  const filteredItems = useMemo(() => {
    const q = normalize(keyword);
    return items.filter((item) => {
      if (protocolFilter !== 'all' && normalize(item.protocol) !== protocolFilter) return false;
      if (providerFilter !== 'all' && normalize(item.instanceProvider) !== providerFilter) return false;
      if (serverFilter !== 'all' && String(item.assetId || item.instanceId) !== serverFilter) return false;
      if (statusFilter === 'enabled' && !(item.status !== 1 && item.enable !== 0)) return false;
      if (statusFilter === 'disabled' && item.enable !== 0) return false;
      if (statusFilter === 'deleted' && item.status !== 1) return false;
      if (statusFilter === 'online' && (item.onlineClientCount || 0) <= 0) return false;
      if (statusFilter === 'expiring') {
        if (!item.expiryTime) return false;
        const days = (item.expiryTime - Date.now()) / 86400000;
        if (days < 0 || days > 30) return false;
      }
      if (!q) return true;
      return [
        item.remark,
        item.tag,
        item.protocol,
        item.transportSummary,
        item.instanceName,
        item.assetName,
        item.hostLabel,
        item.assetPrimaryIp,
        item.assetRegion,
        item.assetProvider,
        item.port != null ? String(item.port) : '',
      ].some((value) => normalize(value).includes(q));
    });
  }, [items, keyword, protocolFilter, providerFilter, statusFilter, serverFilter]);

  const summary = useMemo(() => {
    const protocols = new Set(filteredItems.map((item) => normalize(item.protocol)).filter(Boolean));
    const servers = new Set(filteredItems.map((item) => item.assetId || `instance-${item.instanceId}`));
    return {
      visibleInbounds: filteredItems.length,
      protocols: protocols.size,
      onlineClients: filteredItems.reduce((sum, item) => sum + (item.onlineClientCount || 0), 0),
      expiringSoon: filteredItems.filter((item) => item.expiryTime && item.expiryTime > Date.now() && item.expiryTime - Date.now() <= 30 * 86400000).length,
      servers: servers.size,
    };
  }, [filteredItems]);

  if (!canViewXui) {
    return (
      <Card className="border border-danger/20 bg-danger-50/60">
        <CardBody className="p-6">
          <h1 className="text-xl font-semibold text-danger">缺少 X-UI 查看权限</h1>
        </CardBody>
      </Card>
    );
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">协议看板</h1>
          <p className="mt-1 max-w-4xl text-sm text-default-500">
            把所有 VPS 上的 x-ui / 3x-ui 入站协议拉平成一张目录表。你可以按协议、服务器、实例和状态横向筛选，快速定位活跃入口、异常入口和即将到期的协议节点。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="flat" onPress={() => navigate('/xui')}>返回 X-UI 管理</Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <Card className="border border-divider/80"><CardBody className="gap-2 p-5"><p className="text-xs uppercase tracking-[0.18em] text-default-400">Visible Inbounds</p><p className="text-3xl font-semibold">{summary.visibleInbounds}</p><p className="text-sm text-default-500">当前筛选范围内的协议入口</p></CardBody></Card>
        <Card className="border border-divider/80"><CardBody className="gap-2 p-5"><p className="text-xs uppercase tracking-[0.18em] text-default-400">Protocols</p><p className="text-3xl font-semibold">{summary.protocols}</p><p className="text-sm text-default-500">涉及的协议类型数</p></CardBody></Card>
        <Card className="border border-divider/80"><CardBody className="gap-2 p-5"><p className="text-xs uppercase tracking-[0.18em] text-default-400">Online Clients</p><p className="text-3xl font-semibold">{summary.onlineClients}</p><p className="text-sm text-default-500">当前筛选协议的在线用户</p></CardBody></Card>
        <Card className="border border-divider/80"><CardBody className="gap-2 p-5"><p className="text-xs uppercase tracking-[0.18em] text-default-400">Expiring 30d</p><p className="text-3xl font-semibold">{summary.expiringSoon}</p><p className="text-sm text-default-500">30 天内到期的协议入口</p></CardBody></Card>
        <Card className="border border-divider/80"><CardBody className="gap-2 p-5"><p className="text-xs uppercase tracking-[0.18em] text-default-400">Servers</p><p className="text-3xl font-semibold">{summary.servers}</p><p className="text-sm text-default-500">当前筛选覆盖的 VPS / 实例</p></CardBody></Card>
      </div>

      <Card className="border border-divider/80">
        <CardBody className="gap-4 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Input
              label="搜索"
              placeholder="协议 / 备注 / 服务器 / IP / 端口"
              value={keyword}
              onValueChange={setKeyword}
            />
            <Select
              label="协议"
              items={protocolSelectOptions}
              selectedKeys={[protocolFilter]}
              onSelectionChange={(keys) => setProtocolFilter(String(Array.from(keys)[0] || 'all'))}
            >
              {(item) => <SelectItem key={item.key}>{item.label}</SelectItem>}
            </Select>
            <Select label="面板类型" selectedKeys={[providerFilter]} onSelectionChange={(keys) => setProviderFilter(String(Array.from(keys)[0] || 'all'))}>
              <SelectItem key="all">全部面板</SelectItem>
              <SelectItem key="x-ui">x-ui</SelectItem>
              <SelectItem key="3x-ui">3x-ui</SelectItem>
            </Select>
            <Select label="状态" selectedKeys={[statusFilter]} onSelectionChange={(keys) => setStatusFilter(String(Array.from(keys)[0] || 'all'))}>
              <SelectItem key="all">全部状态</SelectItem>
              <SelectItem key="enabled">正常</SelectItem>
              <SelectItem key="disabled">已停用</SelectItem>
              <SelectItem key="deleted">远端已删除</SelectItem>
              <SelectItem key="online">仅有在线客户端</SelectItem>
              <SelectItem key="expiring">30天内到期</SelectItem>
            </Select>
            <Select
              label="服务器 / 实例"
              items={serverSelectOptions}
              selectedKeys={[serverFilter]}
              onSelectionChange={(keys) => setServerFilter(String(Array.from(keys)[0] || 'all'))}
            >
              {(item) => <SelectItem key={item.key}>{item.label}</SelectItem>}
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Chip size="sm" variant={protocolFilter === 'all' ? 'solid' : 'flat'} color="primary" className="cursor-pointer" onClick={() => setProtocolFilter('all')}>
              全部协议
            </Chip>
            {(directory?.protocolSummaries || []).slice(0, 8).map((item) => (
              <Chip
                key={item.protocol}
                size="sm"
                variant={protocolFilter === item.protocol ? 'solid' : 'flat'}
                color="secondary"
                className="cursor-pointer"
                onClick={() => setProtocolFilter(protocolFilter === item.protocol ? 'all' : item.protocol)}
              >
                {item.protocol} · {item.inboundCount || 0}
              </Chip>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="hidden xl:block">
        <Table aria-label="XUI protocol directory" removeWrapper isHeaderSticky>
          <TableHeader>
            <TableColumn>协议入口</TableColumn>
            <TableColumn>服务器</TableColumn>
            <TableColumn>实例</TableColumn>
            <TableColumn>传输 / 端口</TableColumn>
            <TableColumn>客户端</TableColumn>
            <TableColumn>流量</TableColumn>
            <TableColumn>状态 / 到期</TableColumn>
            <TableColumn>操作</TableColumn>
          </TableHeader>
          <TableBody items={filteredItems} emptyContent="当前筛选下没有协议入口。">
            {(item) => {
              const status = getInboundStatus(item);
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="min-w-[220px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{item.remark || item.tag || `Inbound #${item.remoteInboundId}`}</p>
                        <Chip size="sm" variant="flat" color="primary">{item.protocol || 'unknown'}</Chip>
                      </div>
                      <p className="mt-1 text-xs text-default-500 font-mono">{item.tag || '-'} · ID {item.remoteInboundId}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-[180px]">
                      <p className="text-sm font-medium">{item.assetName || item.hostLabel || '-'}</p>
                      <p className="mt-1 text-xs text-default-500">{item.assetPrimaryIp || '-'}{item.assetRegion ? ` · ${item.assetRegion}` : ''}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-[160px]">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{item.instanceName || `实例 #${item.instanceId}`}</p>
                        <Chip size="sm" variant="flat" color={item.instanceProvider === '3x-ui' ? 'secondary' : 'default'}>{item.instanceProvider || 'x-ui'}</Chip>
                      </div>
                      <p className="mt-1 text-xs text-default-500">同步 {formatDate(item.instanceLastSyncAt)}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-[150px]">
                      <p className="text-sm font-mono">{item.listen || '0.0.0.0'}:{item.port ?? '-'}</p>
                      <p className="mt-1 text-xs text-default-500">{item.transportSummary || '-'}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-[110px]">
                      <p className="text-sm font-semibold">{item.clientCount || 0}</p>
                      <p className="mt-1 text-xs text-success">在线 {item.onlineClientCount || 0}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-[120px] text-xs">
                      <p>↑ {formatFlow(item.up)}</p>
                      <p className="mt-1">↓ {formatFlow(item.down)}</p>
                      <p className="mt-1 text-default-500">总 {formatFlow(item.allTime)}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-[150px]">
                      <Chip size="sm" variant="flat" color={status.color}>{status.label}</Chip>
                      <p className="mt-2 text-xs text-default-500">
                        {item.expiryTime
                          ? `${formatDate(item.expiryTime)}${item.expiryTime < Date.now() ? ' · 已过期' : ''}`
                          : '不过期 / 未记录'}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="flat" onPress={() => navigate(`/xui?instanceId=${item.instanceId}`)}>
                        查看实例
                      </Button>
                      {item.instanceBaseUrl ? (
                        <Button
                          size="sm"
                          variant="flat"
                          color="secondary"
                          as="a"
                          href={`${item.instanceBaseUrl}${item.instanceWebBasePath || '/'}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          打开面板
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            }}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 xl:hidden">
        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-divider/60 p-8 text-center text-sm text-default-500">
            当前筛选下没有协议入口。
          </div>
        ) : (
          filteredItems.map((item) => {
            const status = getInboundStatus(item);
            return (
              <Card key={item.id} className="border border-divider/80">
                <CardBody className="gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold">{item.remark || item.tag || `Inbound #${item.remoteInboundId}`}</p>
                    <Chip size="sm" variant="flat" color="primary">{item.protocol || 'unknown'}</Chip>
                    <Chip size="sm" variant="flat" color={status.color}>{status.label}</Chip>
                  </div>
                  <p className="text-xs text-default-500">{item.assetName || item.hostLabel || '-'} · {item.assetPrimaryIp || '-'}{item.assetRegion ? ` · ${item.assetRegion}` : ''}</p>
                  <div className="grid gap-2 sm:grid-cols-2 text-xs text-default-600">
                    <p>实例: {item.instanceName || `#${item.instanceId}`} · {item.instanceProvider || 'x-ui'}</p>
                    <p>地址: {item.listen || '0.0.0.0'}:{item.port ?? '-'}</p>
                    <p>客户端: {item.clientCount || 0} / 在线 {item.onlineClientCount || 0}</p>
                    <p>总流量: {formatFlow(item.allTime)}</p>
                    <p>传输: {item.transportSummary || '-'}</p>
                    <p>到期: {item.expiryTime ? formatDate(item.expiryTime) : '不过期 / 未记录'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="flat" onPress={() => navigate(`/xui?instanceId=${item.instanceId}`)}>查看实例</Button>
                    {item.instanceBaseUrl ? (
                      <Button size="sm" variant="flat" color="secondary" as="a" href={`${item.instanceBaseUrl}${item.instanceWebBasePath || '/'}`} target="_blank" rel="noreferrer">
                        打开面板
                      </Button>
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
