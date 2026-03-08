import { useEffect, useState, useCallback } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Spinner } from "@heroui/spinner";
import { Tabs, Tab } from "@heroui/tabs";
import { Checkbox } from "@heroui/checkbox";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from "@heroui/table";
import { Pagination } from "@heroui/pagination";
import toast from 'react-hot-toast';

import {
  checkIpQuality,
  batchCheckIpQuality,
  getIpCheckRecords,
  getLatencyMatrix,
  getAssetList,
  IpCheckRecordItem,
  LatencyMatrixItem,
} from "@/api";

type AssetOption = { id: number; name: string; primaryIp?: string | null };

function formatTime(ts?: number | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

function statusChip(status: string) {
  const map: Record<string, "success" | "warning" | "danger" | "default"> = {
    clean: "success",
    suspicious: "warning",
    blacklisted: "danger",
  };
  const labelMap: Record<string, string> = {
    clean: "正常",
    suspicious: "可疑",
    blacklisted: "黑名单",
  };
  return (
    <Chip size="sm" color={map[status] || "default"} variant="flat">
      {labelMap[status] || status}
    </Chip>
  );
}

function scoreColor(score?: number | null): string {
  if (score == null) return '';
  if (score === 0) return 'text-success';
  if (score <= 30) return 'text-warning';
  return 'text-danger';
}

// ======================== Tab 1: IP Check ========================
function IpCheckTab({ assets }: { assets: AssetOption[] }) {
  const [ip, setIp] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<number | undefined>();
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<IpCheckRecordItem[]>([]);

  // batch
  const [batchIds, setBatchIds] = useState<Set<number>>(new Set());
  const [batchChecking, setBatchChecking] = useState(false);

  const handleCheck = useCallback(async () => {
    const trimmed = ip.trim();
    if (!trimmed) { toast.error('请输入 IP 地址'); return; }
    setChecking(true);
    try {
      const r = await checkIpQuality(trimmed, selectedAssetId);
      if (r.code === 0 && r.data) {
        setResults(prev => [r.data!, ...prev]);
        toast.success('检测完成');
      } else {
        toast.error(r.msg || '检测失败');
      }
    } catch { toast.error('检测请求异常'); }
    finally { setChecking(false); }
  }, [ip, selectedAssetId]);

  const handleBatchCheck = useCallback(async () => {
    if (batchIds.size === 0) { toast.error('请选择至少一个资产'); return; }
    setBatchChecking(true);
    try {
      const r = await batchCheckIpQuality(Array.from(batchIds));
      if (r.code === 0 && r.data) {
        setResults(prev => [...r.data!, ...prev]);
        toast.success(`批量检测完成，共 ${r.data.length} 条结果`);
      } else {
        toast.error(r.msg || '批量检测失败');
      }
    } catch { toast.error('批量检测请求异常'); }
    finally { setBatchChecking(false); }
  }, [batchIds]);

  const toggleBatch = (id: number) => {
    setBatchIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Quick Check */}
      <Card>
        <CardHeader className="font-semibold text-lg">快速检测</CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label="IP 地址"
              placeholder="例如 1.2.3.4"
              value={ip}
              onValueChange={setIp}
              className="max-w-xs"
            />
            <Select
              label="关联资产（可选）"
              placeholder="选择资产"
              className="max-w-xs"
              selectedKeys={selectedAssetId != null ? [String(selectedAssetId)] : []}
              onSelectionChange={(keys) => {
                const v = Array.from(keys)[0];
                setSelectedAssetId(v != null ? Number(v) : undefined);
              }}
            >
              {assets.map(a => (
                <SelectItem key={String(a.id)}>{a.name}{a.primaryIp ? ` (${a.primaryIp})` : ''}</SelectItem>
              ))}
            </Select>
            <Button color="primary" onPress={handleCheck} isLoading={checking}>
              检测
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Batch Check */}
      <Card>
        <CardHeader className="font-semibold text-lg">批量检测</CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3 max-h-60 overflow-y-auto">
            {assets.map(a => (
              <Checkbox
                key={a.id}
                isSelected={batchIds.has(a.id)}
                onValueChange={() => toggleBatch(a.id)}
              >
                {a.name}{a.primaryIp ? ` (${a.primaryIp})` : ''}
              </Checkbox>
            ))}
            {assets.length === 0 && <span className="text-default-400">暂无资产</span>}
          </div>
          <div className="flex items-center gap-3">
            <Button color="primary" variant="flat" onPress={handleBatchCheck} isLoading={batchChecking}>
              批量检测 ({batchIds.size})
            </Button>
            {batchIds.size > 0 && (
              <Button variant="light" onPress={() => setBatchIds(new Set())}>清除选择</Button>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader className="font-semibold text-lg">检测结果</CardHeader>
          <CardBody>
            <Table aria-label="检测结果">
              <TableHeader>
                <TableColumn>IP</TableColumn>
                <TableColumn>资产名称</TableColumn>
                <TableColumn>检测类型</TableColumn>
                <TableColumn>黑名单评分</TableColumn>
                <TableColumn>整体状态</TableColumn>
                <TableColumn>时间</TableColumn>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.ip}</TableCell>
                    <TableCell>{r.assetName || '-'}</TableCell>
                    <TableCell>{r.checkType}</TableCell>
                    <TableCell>
                      <span className={scoreColor(r.blacklistScore)}>
                        {r.blacklistScore ?? '-'}
                      </span>
                    </TableCell>
                    <TableCell>{statusChip(r.overallStatus)}</TableCell>
                    <TableCell>{formatTime(r.createdTime)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ======================== Tab 2: Check Records ========================
function CheckRecordsTab() {
  const [records, setRecords] = useState<IpCheckRecordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size] = useState(20);
  const [loading, setLoading] = useState(false);
  const [filterIp, setFilterIp] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params: { page: number; size: number; ip?: string; overallStatus?: string } = { page, size };
      if (filterIp.trim()) params.ip = filterIp.trim();
      if (filterStatus) params.overallStatus = filterStatus;
      const r = await getIpCheckRecords(params);
      if (r.code === 0 && r.data) {
        setRecords(r.data.records);
        setTotal(r.data.total);
      }
    } catch { toast.error('获取记录失败'); }
    finally { setLoading(false); }
  }, [page, size, filterIp, filterStatus]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const totalPages = Math.max(1, Math.ceil(total / size));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="IP 筛选"
          placeholder="输入 IP"
          value={filterIp}
          onValueChange={setFilterIp}
          className="max-w-xs"
        />
        <Select
          label="状态筛选"
          placeholder="全部"
          className="max-w-[180px]"
          selectedKeys={filterStatus ? [filterStatus] : []}
          onSelectionChange={(keys) => {
            const v = Array.from(keys)[0];
            setFilterStatus(v != null ? String(v) : '');
          }}
        >
          <SelectItem key="clean">正常</SelectItem>
          <SelectItem key="suspicious">可疑</SelectItem>
          <SelectItem key="blacklisted">黑名单</SelectItem>
        </Select>
        <Button variant="flat" onPress={() => { setFilterIp(''); setFilterStatus(''); setPage(1); }}>
          重置
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <Table aria-label="检测记录">
          <TableHeader>
            <TableColumn>IP</TableColumn>
            <TableColumn>资产名称</TableColumn>
            <TableColumn>检测类型</TableColumn>
            <TableColumn>黑名单评分</TableColumn>
            <TableColumn>整体状态</TableColumn>
            <TableColumn>时间</TableColumn>
          </TableHeader>
          <TableBody emptyContent="暂无记录">
            {records.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.ip}</TableCell>
                <TableCell>{r.assetName || '-'}</TableCell>
                <TableCell>{r.checkType}</TableCell>
                <TableCell>
                  <span className={scoreColor(r.blacklistScore)}>
                    {r.blacklistScore ?? '-'}
                  </span>
                </TableCell>
                <TableCell>{statusChip(r.overallStatus)}</TableCell>
                <TableCell>{formatTime(r.createdTime)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center mt-2">
          <Pagination total={totalPages} page={page} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

// ======================== Tab 3: Latency Matrix ========================
function LatencyMatrixTab({ assets }: { assets: AssetOption[] }) {
  const [data, setData] = useState<LatencyMatrixItem[]>([]);
  const [loading, setLoading] = useState(false);

  const assetMap = new Map(assets.map(a => [a.id, a.name]));

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getLatencyMatrix();
      if (r.code === 0 && r.data) setData(r.data);
    } catch { toast.error('获取延迟矩阵失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMatrix(); }, [fetchMatrix]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="flat" onPress={fetchMatrix} isLoading={loading}>刷新</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <Table aria-label="延迟矩阵">
          <TableHeader>
            <TableColumn>源区域</TableColumn>
            <TableColumn>源资产</TableColumn>
            <TableColumn>目标 IP</TableColumn>
            <TableColumn>目标资产</TableColumn>
            <TableColumn>延迟 (ms)</TableColumn>
            <TableColumn>丢包率 (%)</TableColumn>
            <TableColumn>抖动 (ms)</TableColumn>
            <TableColumn>测试方式</TableColumn>
          </TableHeader>
          <TableBody emptyContent="暂无数据">
            {data.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.fromRegion || '-'}</TableCell>
                <TableCell>{item.fromAssetId ? (assetMap.get(item.fromAssetId) || `#${item.fromAssetId}`) : '-'}</TableCell>
                <TableCell>{item.toIp || '-'}</TableCell>
                <TableCell>{item.toAssetId ? (assetMap.get(item.toAssetId) || `#${item.toAssetId}`) : '-'}</TableCell>
                <TableCell>
                  <span className={item.latencyMs != null && item.latencyMs > 200 ? 'text-danger' : item.latencyMs != null && item.latencyMs > 100 ? 'text-warning' : ''}>
                    {item.latencyMs ?? '-'}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={item.packetLoss != null && item.packetLoss > 5 ? 'text-danger' : item.packetLoss != null && item.packetLoss > 0 ? 'text-warning' : ''}>
                    {item.packetLoss != null ? item.packetLoss.toFixed(1) : '-'}
                  </span>
                </TableCell>
                <TableCell>{item.jitterMs ?? '-'}</TableCell>
                <TableCell>{item.testMethod || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ======================== Main Page ========================
export default function IpQualityPage() {
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [tab, setTab] = useState<string>("check");

  useEffect(() => {
    getAssetList().then(r => {
      if (r.code === 0 && r.data) {
        setAssets(r.data.map(a => ({ id: a.id, name: a.name, primaryIp: a.primaryIp })));
      }
    });
  }, []);

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-2xl font-bold">IP 质量检测</h1>

      <Tabs
        selectedKey={tab}
        onSelectionChange={(k) => setTab(String(k))}
        variant="underlined"
        color="primary"
      >
        <Tab key="check" title="IP 检测">
          <IpCheckTab assets={assets} />
        </Tab>
        <Tab key="records" title="检测记录">
          <CheckRecordsTab />
        </Tab>
        <Tab key="latency" title="延迟矩阵">
          <LatencyMatrixTab assets={assets} />
        </Tab>
      </Tabs>
    </div>
  );
}
