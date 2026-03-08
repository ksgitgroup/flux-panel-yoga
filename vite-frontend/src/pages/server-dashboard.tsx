import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import { Progress } from "@heroui/progress";
import { Spinner } from "@heroui/spinner";
import { Divider } from "@heroui/divider";
import { Button } from "@heroui/button";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure
} from "@heroui/modal";
import toast from 'react-hot-toast';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

import {
  MonitorNodeSnapshot,
  MonitorRecordSeries,
  getMonitorDashboard,
  getMonitorRecords,
  deleteMonitorNode,
  getTerminalAccessUrl,
} from '@/api';
import { isAdmin } from '@/utils/auth';
import { useNavigate } from 'react-router-dom';

// ===================== Helpers =====================

function formatBytes(bytes?: number | null): string {
  if (bytes == null || bytes === 0) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatSpeed(bytesPerSec?: number | null): string {
  if (bytesPerSec == null || bytesPerSec === 0) return '-';
  const bits = bytesPerSec * 8;
  if (bits < 1000) return bits.toFixed(0) + ' bps';
  if (bits < 1_000_000) return (bits / 1000).toFixed(1) + ' Kbps';
  if (bits < 1_000_000_000) return (bits / 1_000_000).toFixed(1) + ' Mbps';
  return (bits / 1_000_000_000).toFixed(2) + ' Gbps';
}

function formatUptime(seconds?: number | null): string {
  if (seconds == null || seconds === 0) return '-';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}天 ${h}时`;
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}时 ${m}分` : `${m}分`;
}

function barColor(v: number): 'success' | 'warning' | 'danger' {
  return v > 90 ? 'danger' : v > 75 ? 'warning' : 'success';
}

function barColorClass(v: number): string {
  return v > 90 ? 'bg-danger' : v > 75 ? 'bg-warning' : 'bg-success';
}

function memPercent(used?: number | null, total?: number | null): number {
  if (!used || !total || total === 0) return 0;
  return (used / total) * 100;
}

// ===================== Chart Helpers =====================

const CHART_COLORS = {
  cpu: '#3b82f6',
  ram: '#10b981', ram_total: '#6ee7b7',
  swap: '#f59e0b', swap_total: '#fcd34d',
  disk: '#8b5cf6', disk_total: '#c4b5fd',
  net_in: '#06b6d4', net_out: '#f43f5e',
  load: '#ec4899',
  connections: '#6366f1',
  // Pika naming
  cpu_usage: '#3b82f6',
  memory_usage: '#10b981',
  network_upload: '#f43f5e', network_download: '#06b6d4',
  disk_usage: '#8b5cf6',
};

const CHART_LABELS: Record<string, string> = {
  cpu: 'CPU %', ram: '已用内存', ram_total: '总内存',
  swap: '已用 Swap', swap_total: '总 Swap',
  disk: '已用磁盘', disk_total: '总磁盘',
  net_in: '下行 B/s', net_out: '上行 B/s',
  load: '负载', connections: 'TCP 连接数',
  cpu_usage: 'CPU %', memory_usage: '内存 %',
  network_upload: '上行 B/s', network_download: '下行 B/s',
  disk_usage: '磁盘 %',
};

const TIME_RANGES = [
  { label: '1h', value: '1h' },
  { label: '3h', value: '3h' },
  { label: '6h', value: '6h' },
  { label: '12h', value: '12h' },
  { label: '24h', value: '24h' },
  { label: '3d', value: '3d' },
  { label: '7d', value: '7d' },
];

// Group series for rendering as separate charts
type ChartGroup = { title: string; unit: string; series: MonitorRecordSeries[]; domain?: [number, number] };

function groupSeries(allSeries: MonitorRecordSeries[], probeType: string): ChartGroup[] {
  const groups: ChartGroup[] = [];
  const has = (name: string) => allSeries.some(s => s.name === name);

  if (probeType === 'pika') {
    if (has('cpu_usage'))
      groups.push({ title: 'CPU', unit: '%', series: allSeries.filter(s => s.name === 'cpu_usage'), domain: [0, 100] });
    if (has('memory_usage'))
      groups.push({ title: '内存', unit: '%', series: allSeries.filter(s => s.name === 'memory_usage'), domain: [0, 100] });
    const netSeries = allSeries.filter(s => s.name.startsWith('network_'));
    if (netSeries.length > 0) groups.push({ title: '网络', unit: 'B/s', series: netSeries });
    if (has('disk_usage'))
      groups.push({ title: '磁盘', unit: '%', series: allSeries.filter(s => s.name === 'disk_usage'), domain: [0, 100] });
  } else {
    // Komari
    if (has('cpu'))
      groups.push({ title: 'CPU', unit: '%', series: allSeries.filter(s => s.name === 'cpu'), domain: [0, 100] });
    const ramSeries = allSeries.filter(s => s.name === 'ram' || s.name === 'ram_total');
    if (ramSeries.length > 0) groups.push({ title: '内存', unit: 'bytes', series: ramSeries });
    const swapSeries = allSeries.filter(s => s.name === 'swap' || s.name === 'swap_total');
    if (swapSeries.length > 0) groups.push({ title: 'Swap', unit: 'bytes', series: swapSeries });
    const diskSeries = allSeries.filter(s => s.name === 'disk' || s.name === 'disk_total');
    if (diskSeries.length > 0) groups.push({ title: '磁盘', unit: 'bytes', series: diskSeries });
    const netSeries = allSeries.filter(s => s.name === 'net_in' || s.name === 'net_out');
    if (netSeries.length > 0) groups.push({ title: '网络', unit: 'B/s', series: netSeries });
    if (has('load'))
      groups.push({ title: '负载', unit: '', series: allSeries.filter(s => s.name === 'load') });
    if (has('connections'))
      groups.push({ title: '连接数', unit: '', series: allSeries.filter(s => s.name === 'connections') });
  }
  return groups;
}

function formatChartTime(ts: number, range: string): string {
  const d = new Date(ts);
  if (['3d', '7d'].includes(range)) {
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatChartValue(v: number, unit: string): string {
  if (unit === 'bytes' || unit === 'B/s') {
    if (v < 1024) return v.toFixed(0) + ' B';
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
    if (v < 1024 * 1024 * 1024) return (v / (1024 * 1024)).toFixed(1) + ' MB';
    return (v / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
  if (unit === '%') return v.toFixed(1) + '%';
  return v.toFixed(2);
}

function MiniChartTooltip({ active, payload, unit }: any) {
  if (!active || !payload?.length) return null;
  const ts = payload[0]?.payload?.timestamp;
  return (
    <div className="rounded-lg bg-content1 border border-divider/60 p-2 shadow-lg text-xs">
      <p className="text-default-400 font-mono mb-1">{ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : ''}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="font-mono" style={{ color: p.color }}>
          {CHART_LABELS[p.dataKey] || p.dataKey}: {formatChartValue(p.value, unit)}
        </p>
      ))}
    </div>
  );
}

function NodeCharts({ nodeId, range }: { nodeId: number; range: string }) {
  const [series, setSeries] = useState<MonitorRecordSeries[]>([]);
  const [probeType, setProbeType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getMonitorRecords(nodeId, range)
      .then(res => {
        if (cancelled) return;
        if (res.code === 0 && res.data) {
          setSeries((res.data as any).series || []);
          setProbeType((res.data as any).probeType || '');
        } else {
          setError(res.msg || '获取失败');
        }
      })
      .catch(() => { if (!cancelled) setError('请求失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [nodeId, range]);

  if (loading) return <div className="flex justify-center py-6"><Spinner size="sm" /></div>;
  if (error) return <p className="text-xs text-danger text-center py-4">{error}</p>;
  if (series.length === 0) return <p className="text-xs text-default-400 text-center py-4">暂无历史数据</p>;

  const groups = groupSeries(series, probeType);

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        // Merge all series data by timestamp
        const timeMap = new Map<number, Record<string, number>>();
        g.series.forEach(s => {
          s.data.forEach(pt => {
            const existing = timeMap.get(pt.timestamp) || { timestamp: pt.timestamp };
            existing[s.name] = pt.value;
            timeMap.set(pt.timestamp, existing);
          });
        });
        const chartData = Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp);
        if (chartData.length === 0) return null;

        return (
          <div key={g.title}>
            <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-2">{g.title}</p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  {g.series.map(s => (
                    <linearGradient key={s.name} id={`grad_${s.name}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={(CHART_COLORS as any)[s.name] || '#6366f1'} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={(CHART_COLORS as any)[s.name] || '#6366f1'} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--heroui-divider)" opacity={0.4} />
                <XAxis
                  dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']}
                  tickFormatter={(v) => formatChartTime(v, range)}
                  tick={{ fontSize: 10 }} stroke="var(--heroui-default-400)"
                />
                <YAxis
                  tick={{ fontSize: 10 }} stroke="var(--heroui-default-400)" width={50}
                  domain={g.domain || ['auto', 'auto']}
                  tickFormatter={(v) => g.unit === 'bytes' || g.unit === 'B/s' ? formatChartValue(v, g.unit) : g.unit === '%' ? `${v}%` : String(v)}
                />
                <Tooltip content={<MiniChartTooltip unit={g.unit} />} />
                {g.series.length > 1 && <Legend formatter={(v: string) => CHART_LABELS[v] || v} wrapperStyle={{ fontSize: 10 }} />}
                {g.series.map(s => (
                  <Area
                    key={s.name} type="monotone" dataKey={s.name}
                    name={s.name}
                    stroke={(CHART_COLORS as any)[s.name] || '#6366f1'}
                    strokeWidth={1.5}
                    fill={`url(#grad_${s.name})`}
                    dot={false} activeDot={{ r: 2 }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}

// ===================== Component =====================

export default function ServerDashboardPage() {
  const navigate = useNavigate();
  const admin = isAdmin();
  const [nodes, setNodes] = useState<MonitorNodeSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [probeFilter, setProbeFilter] = useState<'all' | 'komari' | 'pika'>('all');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [regionFilter, setRegionFilter] = useState<string>('');
  const [osFilter, setOsFilter] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure();
  const [selectedNode, setSelectedNode] = useState<MonitorNodeSnapshot | null>(null);
  const [chartRange, setChartRange] = useState('1h');
  const [showCharts, setShowCharts] = useState(false);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await getMonitorDashboard();
      if (res.code === 0 && res.data) {
        const data = res.data as any;
        setNodes(data.nodes || []);
        setLastUpdate(new Date());
      }
    } catch { /* ignore */ }
    finally { if (showLoading) setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData(true);
    // 10s polling for real-time feel
    pollRef.current = setInterval(() => fetchData(false), 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchData]);

  const openDetail = (node: MonitorNodeSnapshot) => {
    setSelectedNode(node);
    setShowCharts(false);
    setChartRange('1h');
    onDetailOpen();
  };

  // Deduplicate by assetId: group nodes into unique servers
  // Same server with both Komari + Pika counts as ONE server
  const serverSummary = useMemo(() => {
    const byAsset = new Map<number | string, { online: boolean; region?: string; os?: string }>();
    nodes.forEach(n => {
      const key = n.assetId ?? `unlinked-${n.instanceId}-${n.id}`;
      const prev = byAsset.get(key);
      byAsset.set(key, {
        online: (prev?.online || false) || n.online === 1,
        region: prev?.region || n.region || undefined,
        os: prev?.os || n.os || undefined,
      });
    });
    const total = byAsset.size;
    let online = 0;
    byAsset.forEach(v => { if (v.online) online++; });
    return { total, online, offline: total - online };
  }, [nodes]);

  // Collect all unique tags with counts
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    nodes.forEach(n => {
      if (n.tags) {
        try { JSON.parse(n.tags).forEach((t: string) => { counts[t] = (counts[t] || 0) + 1; }); } catch { /* ignore */ }
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  // Count by probe type
  const probeCounts = useMemo(() => {
    const counts = { komari: 0, pika: 0 };
    nodes.forEach(n => {
      if (n.instanceType === 'pika') counts.pika++;
      else counts.komari++;
    });
    return counts;
  }, [nodes]);

  // Region counts from nodes
  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    nodes.forEach(n => { const r = n.region || ''; counts[r] = (counts[r] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  // OS counts from nodes (extract category from full OS string)
  const osCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    nodes.forEach(n => {
      let cat = '';
      const os = (n.os || '').toLowerCase();
      if (os.includes('ubuntu')) cat = 'Ubuntu';
      else if (os.includes('debian')) cat = 'Debian';
      else if (os.includes('centos')) cat = 'CentOS';
      else if (os.includes('alma')) cat = 'AlmaLinux';
      else if (os.includes('rocky')) cat = 'Rocky';
      else if (os.includes('fedora')) cat = 'Fedora';
      else if (os.includes('alpine')) cat = 'Alpine';
      else if (os.includes('arch')) cat = 'Arch';
      else if (os.includes('windows')) cat = 'Windows';
      else if (os.includes('macos') || os.includes('darwin')) cat = 'MacOS';
      else if (os) cat = 'Other';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    let list = nodes;
    if (statusFilter === 'online') list = list.filter(n => n.online === 1);
    else if (statusFilter === 'offline') list = list.filter(n => n.online !== 1);
    if (probeFilter !== 'all') list = list.filter(n => (n.instanceType || 'komari') === probeFilter);
    if (regionFilter) {
      list = list.filter(n => regionFilter === '_empty' ? !n.region : n.region === regionFilter);
    }
    if (osFilter) {
      const q = osFilter.toLowerCase();
      list = list.filter(n => {
        if (osFilter === '_empty') return !n.os;
        const os = (n.os || '').toLowerCase();
        if (q === 'other') return os && !['ubuntu','debian','centos','alma','rocky','fedora','alpine','arch','windows','macos','darwin'].some(k => os.includes(k));
        return os.includes(q);
      });
    }
    if (tagFilter) {
      list = list.filter(n => {
        if (!n.tags) return false;
        try { return JSON.parse(n.tags).includes(tagFilter); } catch { return false; }
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(n =>
        (n.name || '').toLowerCase().includes(q) ||
        (n.ip || '').toLowerCase().includes(q) ||
        (n.region || '').toLowerCase().includes(q) ||
        (n.os || '').toLowerCase().includes(q) ||
        (n.assetName || '').toLowerCase().includes(q) ||
        (n.instanceName || '').toLowerCase().includes(q) ||
        (n.tags || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [nodes, search, statusFilter, probeFilter, tagFilter, regionFilter, osFilter]);

  if (!admin) {
    return (
      <Card className="border border-danger/20 bg-danger-50/60">
        <CardBody className="p-6"><h1 className="text-xl font-semibold text-danger">仅管理员可访问</h1></CardBody>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-[1800px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">服务器看板</h1>
          <p className="mt-0.5 text-sm text-default-500">
            实时监控 · 每 10 秒自动刷新
            {lastUpdate && (
              <span className="ml-2 text-default-400">
                更新于 {lastUpdate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="flat" onPress={() => navigate('/assets')}>资产管理</Button>
          <Button size="sm" variant="flat" onPress={() => navigate('/probe')}>探针配置</Button>
          <Button size="sm" variant="flat" onPress={() => navigate('/alert')}>告警管理</Button>
        </div>
      </div>

      {/* Summary Bar - counts deduplicated by server (same server with dual probes = 1) */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setStatusFilter('all')}
          className={`rounded-xl border px-4 py-2.5 transition-all cursor-pointer ${
            statusFilter === 'all' ? 'border-primary bg-primary-50 dark:bg-primary/10' : 'border-divider/60 bg-content1 hover:border-primary/40'
          }`}
        >
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">全部</p>
          <p className="text-2xl font-bold font-mono">{serverSummary.total}</p>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'online' ? 'all' : 'online')}
          className={`rounded-xl border px-4 py-2.5 transition-all cursor-pointer ${
            statusFilter === 'online' ? 'border-success bg-success-50 dark:bg-success/10' : 'border-success/20 bg-success-50/30 dark:bg-success-50/10 hover:border-success/40'
          }`}
        >
          <p className="text-[10px] font-bold tracking-widest text-success uppercase">在线</p>
          <p className="text-2xl font-bold font-mono text-success">{serverSummary.online}</p>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'offline' ? 'all' : 'offline')}
          className={`rounded-xl border px-4 py-2.5 transition-all cursor-pointer ${
            statusFilter === 'offline' ? 'border-danger bg-danger-50 dark:bg-danger/10' : serverSummary.offline > 0 ? 'border-danger/20 bg-danger-50/30 dark:bg-danger-50/10 hover:border-danger/40' : 'border-divider/60 bg-content1'
          }`}
        >
          <p className={`text-[10px] font-bold tracking-widest uppercase ${serverSummary.offline > 0 ? 'text-danger' : 'text-default-400'}`}>离线</p>
          <p className={`text-2xl font-bold font-mono ${serverSummary.offline > 0 ? 'text-danger' : 'text-default-300'}`}>{serverSummary.offline}</p>
        </button>

        {/* Probe type filter */}
        <div className="flex gap-1 ml-2">
          {(['all', 'komari', 'pika'] as const).map(t => (
            <button key={t} onClick={() => setProbeFilter(t)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all cursor-pointer border ${
                probeFilter === t
                  ? 'border-primary bg-primary-50 dark:bg-primary/10 text-primary'
                  : 'border-divider/60 bg-content1 text-default-500 hover:border-primary/40'
              }`}>
              {t === 'all' ? '全部探针' : t === 'komari' ? `Komari (${probeCounts.komari})` : `Pika (${probeCounts.pika})`}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-[200px] ml-auto max-w-xs">
          <Input size="sm" placeholder="搜索服务器、IP、地区、OS..." value={search} onValueChange={setSearch}
            isClearable onClear={() => setSearch('')} className="flex-1" />
        </div>
      </div>

      {/* Region / OS quick filters */}
      <div className="flex flex-wrap items-center gap-3">
        {regionCounts.filter(([r]) => r).length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-bold tracking-widest text-default-400 uppercase mr-0.5">地区:</span>
            <button onClick={() => setRegionFilter('')}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider transition-all border cursor-pointer ${
                !regionFilter ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
              }`}>全部</button>
            {regionCounts.filter(([r]) => r).map(([region, count]) => (
              <button key={region} onClick={() => setRegionFilter(regionFilter === region ? '' : region)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider transition-all border cursor-pointer ${
                  regionFilter === region ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                }`}>{region} ({count})</button>
            ))}
          </div>
        )}
        {osCounts.filter(([o]) => o).length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-bold tracking-widest text-default-400 uppercase mr-0.5">系统:</span>
            <button onClick={() => setOsFilter('')}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
                !osFilter ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
              }`}>全部</button>
            {osCounts.filter(([o]) => o).map(([os, count]) => (
              <button key={os} onClick={() => setOsFilter(osFilter === os ? '' : os)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
                  osFilter === os ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
                }`}>{os} ({count})</button>
            ))}
          </div>
        )}
      </div>

      {/* Tag filter bar */}
      {tagCounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold tracking-widest text-default-400 uppercase mr-1">标签:</span>
          <button
            onClick={() => setTagFilter('')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
              !tagFilter ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
            }`}>
            ALL ({nodes.length})
          </button>
          {tagCounts.map(([tag, count]) => (
            <button key={tag} onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold font-mono tracking-wider transition-all border cursor-pointer ${
                tagFilter === tag ? 'border-primary bg-primary-100/60 text-primary dark:bg-primary/20' : 'border-divider text-default-500 hover:border-primary/40'
              }`}>
              {tag.toUpperCase()} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
      ) : filteredNodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider/60 p-12 text-center">
          <h3 className="text-base font-semibold text-default-600">
            {nodes.length === 0 ? '暂无服务器' : '没有匹配的结果'}
          </h3>
          <p className="mt-2 text-sm text-default-400">
            {nodes.length === 0 ? '添加探针实例并同步后，服务器将显示在此处。' : '尝试调整搜索条件或筛选项。'}
          </p>
        </div>
      ) : (
        /* Server Card Grid */
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredNodes.map((node) => {
            const m = node.latestMetric;
            const isOnline = node.online === 1;
            const cpu = m?.cpuUsage || 0;
            const mem = memPercent(m?.memUsed, m?.memTotal);
            const disk = memPercent(m?.diskUsed, m?.diskTotal);

            return (
              <button
                type="button"
                key={`${node.instanceId}-${node.id}`}
                onClick={() => openDetail(node)}
                className={`rounded-xl border p-3 text-left transition-all hover:shadow-md cursor-pointer ${
                  isOnline
                    ? 'border-divider/60 bg-content1 hover:border-primary/40'
                    : 'border-danger/20 bg-danger-50/20 dark:bg-danger-50/5 hover:border-danger/40'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                        isOnline ? 'bg-success animate-pulse' : 'bg-danger'
                      }`} />
                      <span className="truncate font-semibold text-sm">{node.name || node.remoteNodeUuid?.slice(0, 8)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-default-400 font-mono pl-4">
                      {node.ip || '-'}
                      {node.region ? ` / ${node.region}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    <Chip size="sm" variant="flat" color={node.instanceType === 'pika' ? 'secondary' : 'primary'} className="h-4 text-[9px]">
                      {node.instanceType === 'pika' ? 'Pika' : 'Komari'}
                    </Chip>
                    {node.assetName && (
                      <span className="text-[9px] text-default-400 font-mono truncate max-w-[80px]">{node.assetName}</span>
                    )}
                  </div>
                </div>

                {/* Metrics - compact resource bars */}
                {isOnline && m ? (
                  <div className="space-y-1.5">
                    {/* CPU */}
                    <div className="flex items-center gap-1.5">
                      <span className="w-7 text-[10px] font-bold tracking-wider text-default-400 flex-shrink-0">CPU</span>
                      <div className="flex-1 h-1.5 bg-default-200 dark:bg-default-100 rounded-sm overflow-hidden">
                        <div className={`h-full transition-all duration-700 ease-out rounded-sm ${barColorClass(cpu)}`}
                          style={{ width: `${Math.min(cpu, 100)}%` }} />
                      </div>
                      <span className={`w-9 text-right text-[11px] font-mono font-medium ${cpu > 90 ? 'text-danger' : cpu > 75 ? 'text-warning' : 'text-default-600'}`}>
                        {cpu.toFixed(0)}%
                      </span>
                    </div>
                    {/* MEM */}
                    <div className="flex items-center gap-1.5">
                      <span className="w-7 text-[10px] font-bold tracking-wider text-default-400 flex-shrink-0">MEM</span>
                      <div className="flex-1 h-1.5 bg-default-200 dark:bg-default-100 rounded-sm overflow-hidden">
                        <div className={`h-full transition-all duration-700 ease-out rounded-sm ${barColorClass(mem)}`}
                          style={{ width: `${Math.min(mem, 100)}%` }} />
                      </div>
                      <span className={`w-9 text-right text-[11px] font-mono font-medium ${mem > 90 ? 'text-danger' : mem > 75 ? 'text-warning' : 'text-default-600'}`}>
                        {mem.toFixed(0)}%
                      </span>
                    </div>
                    {/* DISK */}
                    <div className="flex items-center gap-1.5">
                      <span className="w-7 text-[10px] font-bold tracking-wider text-default-400 flex-shrink-0">DISK</span>
                      <div className="flex-1 h-1.5 bg-default-200 dark:bg-default-100 rounded-sm overflow-hidden">
                        <div className={`h-full transition-all duration-700 ease-out rounded-sm ${barColorClass(disk)}`}
                          style={{ width: `${Math.min(disk, 100)}%` }} />
                      </div>
                      <span className={`w-9 text-right text-[11px] font-mono font-medium ${disk > 90 ? 'text-danger' : disk > 75 ? 'text-warning' : 'text-default-600'}`}>
                        {disk.toFixed(0)}%
                      </span>
                    </div>

                    {/* Network + Uptime footer */}
                    <div className="flex items-center justify-between pt-1 border-t border-divider/40 text-[10px] text-default-400 font-mono">
                      <span>
                        <span className="text-success">&#x2193;</span> {formatSpeed(m.netIn)}
                        <span className="mx-1.5 text-default-200">|</span>
                        <span className="text-primary">&#x2191;</span> {formatSpeed(m.netOut)}
                      </span>
                      <span>{formatUptime(m.uptime)}</span>
                    </div>
                    {/* Traffic quota bar */}
                    {node.trafficLimit != null && node.trafficLimit > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] text-default-400 font-mono">
                        <span className="flex-shrink-0">流量</span>
                        <div className="flex-1 h-1 bg-default-200 dark:bg-default-100 rounded-sm overflow-hidden">
                          <div className={`h-full rounded-sm ${(node.trafficUsed || 0) / node.trafficLimit > 0.9 ? 'bg-danger' : 'bg-primary'}`}
                            style={{ width: `${Math.min(((node.trafficUsed || 0) / node.trafficLimit) * 100, 100)}%` }} />
                        </div>
                        <span className="flex-shrink-0">{formatBytes(node.trafficUsed)} / {formatBytes(node.trafficLimit)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-3 text-center">
                    <span className="text-[11px] text-danger font-bold tracking-wider">离线</span>
                    {node.os && <p className="text-[10px] text-default-400 mt-1">{node.os}</p>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Node Detail Modal */}
      <Modal isOpen={isDetailOpen} onClose={onDetailClose} size="3xl" scrollBehavior="inside">
        <ModalContent>
          {selectedNode && (() => {
            const m = selectedNode.latestMetric;
            const isOnline = selectedNode.online === 1;
            const cpu = m?.cpuUsage || 0;
            const mem = memPercent(m?.memUsed, m?.memTotal);
            const swap = memPercent(m?.swapUsed, m?.swapTotal);
            const disk = memPercent(m?.diskUsed, m?.diskTotal);

            return (
              <>
                <ModalHeader className="flex items-center gap-3 pb-2">
                  <span className={`inline-block h-3 w-3 rounded-full ${isOnline ? 'bg-success animate-pulse' : 'bg-danger'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold">{selectedNode.name || selectedNode.remoteNodeUuid?.slice(0, 8)}</p>
                      <Chip size="sm" variant="flat" color={selectedNode.instanceType === 'pika' ? 'secondary' : 'primary'} className="h-5">
                        {selectedNode.instanceType === 'pika' ? 'Pika' : 'Komari'}
                      </Chip>
                    </div>
                    <p className="text-xs font-normal text-default-400 font-mono">
                      {selectedNode.ip || '-'}
                      {selectedNode.ipv6 ? ` / ${selectedNode.ipv6}` : ''}
                      {selectedNode.region ? ` / ${selectedNode.region}` : ''}
                    </p>
                    <p className="text-[10px] font-normal text-default-400 font-mono mt-0.5">
                      同步: {selectedNode.lastSyncAt ? new Date(selectedNode.lastSyncAt).toLocaleString('zh-CN', { hour12: false }) : '-'}
                      {m?.sampledAt ? ` · 采样: ${new Date(m.sampledAt).toLocaleString('zh-CN', { hour12: false })}` : ''}
                    </p>
                  </div>
                </ModalHeader>
                <ModalBody className="space-y-4 pb-6">
                  {/* System Info */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                      <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-1.5">系统</p>
                      <div className="space-y-1 text-xs">
                        <p className="flex justify-between"><span className="text-default-400">操作系统</span><span className="font-mono">{selectedNode.os || '-'}</span></p>
                        <p className="flex justify-between"><span className="text-default-400">内核</span><span className="font-mono text-[11px] truncate ml-2">{selectedNode.kernelVersion || '-'}</span></p>
                        <p className="flex justify-between"><span className="text-default-400">架构</span><span className="font-mono">{selectedNode.arch || '-'}</span></p>
                        <p className="flex justify-between"><span className="text-default-400">虚拟化</span><span className="font-mono">{selectedNode.virtualization || '-'}</span></p>
                        <p className="flex justify-between"><span className="text-default-400">Agent</span><span className="font-mono">v{selectedNode.version || '?'}</span></p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                      <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-1.5">硬件</p>
                      <div className="space-y-1 text-xs">
                        <p className="flex justify-between"><span className="text-default-400">CPU</span><span className="font-mono">{selectedNode.cpuCores || '?'} 核</span></p>
                        <p className="flex justify-between"><span className="text-default-400">内存</span><span className="font-mono">{formatBytes(selectedNode.memTotal)}</span></p>
                        <p className="flex justify-between"><span className="text-default-400">Swap</span><span className="font-mono">{formatBytes(selectedNode.swapTotal)}</span></p>
                        <p className="flex justify-between"><span className="text-default-400">硬盘</span><span className="font-mono">{formatBytes(selectedNode.diskTotal)}</span></p>
                        {selectedNode.gpuName && <p className="flex justify-between"><span className="text-default-400">GPU</span><span className="font-mono truncate ml-2">{selectedNode.gpuName}</span></p>}
                      </div>
                    </div>

                    <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                      <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-1.5">信息</p>
                      <div className="space-y-1 text-xs">
                        {selectedNode.cpuName && <p className="truncate text-default-500 font-mono">{selectedNode.cpuName}</p>}
                        {selectedNode.instanceName && <p className="flex justify-between"><span className="text-default-400">探针</span><span>{selectedNode.instanceName}</span></p>}
                        {selectedNode.assetName && <p className="flex justify-between"><span className="text-default-400">资产</span><Chip size="sm" variant="flat" color="primary" className="h-5 cursor-pointer" onClick={() => { onDetailClose(); navigate('/assets'); }}>{selectedNode.assetName}</Chip></p>}
                        {selectedNode.price != null && <p className="flex justify-between"><span className="text-default-400">价格</span><span className="font-mono">{selectedNode.price} {selectedNode.currency || ''}</span></p>}
                        {selectedNode.trafficLimit != null && selectedNode.trafficLimit > 0 && (
                          <p className="flex justify-between"><span className="text-default-400">流量配额</span><span className="font-mono">{formatBytes(selectedNode.trafficUsed)} / {formatBytes(selectedNode.trafficLimit)}</span></p>
                        )}
                        {selectedNode.trafficResetDay != null && selectedNode.trafficResetDay > 0 && (
                          <p className="flex justify-between"><span className="text-default-400">重置日</span><span className="font-mono">每月{selectedNode.trafficResetDay}日</span></p>
                        )}
                        {selectedNode.expiredAt != null && selectedNode.expiredAt > 0 && (
                          <p className="flex justify-between">
                            <span className="text-default-400">到期</span>
                            <span className={`font-mono ${selectedNode.expiredAt < Date.now() ? 'text-danger' : ''}`}>
                              {new Date(selectedNode.expiredAt).toLocaleDateString('zh-CN')}
                              {selectedNode.expiredAt < Date.now() ? ' (已过期)' : ` (${Math.ceil((selectedNode.expiredAt - Date.now()) / 86400000)}天)`}
                            </span>
                          </p>
                        )}
                        {selectedNode.tags && (() => {
                          try {
                            const tags = JSON.parse(selectedNode.tags);
                            return tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {tags.map((t: string) => <Chip key={t} size="sm" variant="flat" className="h-4 text-[9px]">{t}</Chip>)}
                              </div>
                            );
                          } catch { return null; }
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Real-time Metrics */}
                  {isOnline && m ? (
                    <>
                      <Divider />
                      <div>
                        <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-3">实时指标</p>
                        <div className="space-y-2.5">
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-default-500">CPU</span>
                              <span className="font-semibold font-mono">{cpu.toFixed(1)}%</span>
                            </div>
                            <Progress value={cpu} color={barColor(cpu)} size="sm" aria-label="CPU" />
                          </div>
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-default-500">内存</span>
                              <span className="font-mono text-sm">{mem.toFixed(1)}% <span className="text-xs text-default-400">{formatBytes(m.memUsed)} / {formatBytes(m.memTotal)}</span></span>
                            </div>
                            <Progress value={mem} color={barColor(mem)} size="sm" aria-label="MEM" />
                          </div>
                          {(m.swapTotal ?? 0) > 0 && (
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-default-500">Swap</span>
                                <span className="font-mono text-sm">{swap.toFixed(1)}% <span className="text-xs text-default-400">{formatBytes(m.swapUsed)} / {formatBytes(m.swapTotal)}</span></span>
                              </div>
                              <Progress value={swap} color={barColor(swap)} size="sm" aria-label="Swap" />
                            </div>
                          )}
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-default-500">Disk</span>
                              <span className="font-mono text-sm">{disk.toFixed(1)}% <span className="text-xs text-default-400">{formatBytes(m.diskUsed)} / {formatBytes(m.diskTotal)}</span></span>
                            </div>
                            <Progress value={disk} color={barColor(disk)} size="sm" aria-label="Disk" />
                          </div>
                        </div>
                      </div>

                      {/* Detail stats grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                        <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                          <p className="text-[9px] text-default-400 uppercase tracking-wider">下行速率</p>
                          <p className="text-sm font-semibold font-mono mt-0.5">{formatSpeed(m.netIn)}</p>
                        </div>
                        <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                          <p className="text-[9px] text-default-400 uppercase tracking-wider">上行速率</p>
                          <p className="text-sm font-semibold font-mono mt-0.5">{formatSpeed(m.netOut)}</p>
                        </div>
                        <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                          <p className="text-[9px] text-default-400 uppercase tracking-wider">累计下行</p>
                          <p className="text-sm font-semibold font-mono mt-0.5">{formatBytes(m.netTotalDown)}</p>
                        </div>
                        <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                          <p className="text-[9px] text-default-400 uppercase tracking-wider">累计上行</p>
                          <p className="text-sm font-semibold font-mono mt-0.5">{formatBytes(m.netTotalUp)}</p>
                        </div>
                        <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                          <p className="text-[9px] text-default-400 uppercase tracking-wider">负载 1/5/15</p>
                          <p className="text-sm font-semibold font-mono mt-0.5">{m.load1?.toFixed(2) ?? '-'} / {m.load5?.toFixed(2) ?? '-'} / {m.load15?.toFixed(2) ?? '-'}</p>
                        </div>
                        <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                          <p className="text-[9px] text-default-400 uppercase tracking-wider">运行时间</p>
                          <p className="text-sm font-semibold font-mono mt-0.5">{formatUptime(m.uptime)}</p>
                        </div>
                        <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                          <p className="text-[9px] text-default-400 uppercase tracking-wider">TCP / UDP</p>
                          <p className="text-sm font-semibold font-mono mt-0.5">{m.connections ?? '-'} / {m.connectionsUdp ?? '-'}</p>
                        </div>
                        <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                          <p className="text-[9px] text-default-400 uppercase tracking-wider">进程数</p>
                          <p className="text-sm font-semibold font-mono mt-0.5">{m.processCount ?? '-'}</p>
                        </div>
                        {m.gpuUsage != null && m.gpuUsage > 0 && (
                          <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                            <p className="text-[9px] text-default-400 uppercase tracking-wider">GPU</p>
                            <p className="text-sm font-semibold font-mono mt-0.5">{m.gpuUsage.toFixed(1)}%</p>
                          </div>
                        )}
                        {m.temperature != null && m.temperature > 0 && (
                          <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                            <p className="text-[9px] text-default-400 uppercase tracking-wider">温度</p>
                            <p className="text-sm font-semibold font-mono mt-0.5">{m.temperature.toFixed(1)}°C</p>
                          </div>
                        )}
                      </div>

                      {m.sampledAt && (
                        <p className="text-[10px] text-default-400 text-right font-mono">
                          采样时间: {new Date(m.sampledAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                      )}

                      {/* Historical Charts */}
                      <Divider />
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">历史图表</p>
                          <div className="flex items-center gap-1">
                            {!showCharts ? (
                              <Button size="sm" variant="flat" onPress={() => setShowCharts(true)}>加载图表</Button>
                            ) : (
                              TIME_RANGES.map(r => (
                                <button key={r.value} onClick={() => setChartRange(r.value)}
                                  className={`rounded-md px-2 py-0.5 text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                                    chartRange === r.value
                                      ? 'border-primary bg-primary-50 dark:bg-primary/10 text-primary'
                                      : 'border-divider text-default-400 hover:border-primary/40'
                                  }`}>{r.label}</button>
                              ))
                            )}
                          </div>
                        </div>
                        {showCharts && (
                          <>
                            {/* Current probe charts */}
                            {selectedNode.peerNodeId && (
                              <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-2">
                                {selectedNode.instanceType === 'pika' ? 'Pika' : 'Komari'} 探针
                              </p>
                            )}
                            <NodeCharts nodeId={selectedNode.id} range={chartRange} />

                            {/* Peer probe charts */}
                            {selectedNode.peerNodeId && (
                              <div className="mt-4 pt-4 border-t border-divider/40">
                                <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-2">
                                  {selectedNode.peerInstanceType === 'pika' ? 'Pika' : 'Komari'} 探针
                                </p>
                                <NodeCharts nodeId={selectedNode.peerNodeId} range={chartRange} />
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Single-probe hint */}
                      {!selectedNode.peerNodeId && (
                        <div className="rounded-lg border border-warning/30 bg-warning-50/30 dark:bg-warning/5 p-3 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-warning-600 dark:text-warning">
                              仅部署了 {selectedNode.instanceType === 'pika' ? 'Pika' : 'Komari'} 探针
                            </p>
                            <p className="text-[11px] text-default-400 mt-0.5">
                              建议同时部署双探针以获得更全面的监控数据和冗余保障
                            </p>
                          </div>
                          <Button size="sm" variant="flat" color="warning" onPress={() => { onDetailClose(); navigate('/probe'); }}>
                            部署探针
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-xl border border-danger/20 bg-danger-50/30 p-4 text-center">
                      <span className="text-danger font-mono font-bold">离线</span>
                      <p className="text-xs text-default-400 mt-1">该服务器当前不可达</p>
                    </div>
                  )}
                </ModalBody>
                <ModalFooter className="flex-wrap gap-1">
                  <Button size="sm" variant="flat" color="danger"
                    onPress={async () => {
                      if (!confirm(`确定删除探针节点「${selectedNode.name || selectedNode.remoteNodeUuid?.slice(0, 8)}」？此操作会同时解除与资产的绑定。`)) return;
                      try {
                        const res = await deleteMonitorNode(selectedNode.id);
                        if (res.code === 0) {
                          toast.success('已删除探针节点');
                          onDetailClose();
                          fetchData(false);
                        } else {
                          toast.error(res.msg || '删除失败');
                        }
                      } catch { toast.error('删除失败'); }
                    }}>
                    删除此节点
                  </Button>
                  {(selectedNode.instanceType || 'komari') === 'komari' && isOnline && (
                    <Button size="sm" variant="flat" color="secondary"
                      onPress={async () => {
                        if (!confirm(`即将打开「${selectedNode.name || selectedNode.ip}」的远程终端。\n\n注意：这将获得服务器的完整命令行访问权限，请确保操作安全。`)) return;
                        try {
                          const res = await getTerminalAccessUrl(selectedNode.id);
                          if (res.code === 0 && res.data) {
                            window.open((res.data as any).terminalUrl, '_blank');
                          } else {
                            toast.error(res.msg || '获取终端地址失败');
                          }
                        } catch { toast.error('获取终端地址失败'); }
                      }}>
                      远程终端
                    </Button>
                  )}
                  <Button size="sm" variant="flat" onPress={() => { onDetailClose(); navigate('/assets'); }}>资产</Button>
                  <Button size="sm" color="primary" onPress={onDetailClose}>关闭</Button>
                </ModalFooter>
              </>
            );
          })()}
        </ModalContent>
      </Modal>
    </div>
  );
}
