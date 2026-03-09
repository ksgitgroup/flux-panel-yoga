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
  KomariPingTaskDetail,
  MonitorNodeSnapshot,
  MonitorNodeProviderDetail,
  MonitorRecordSeries,
  getMonitorDashboard,
  getMonitorNodeProviderDetail,
  getMonitorRecords,
  getKomariPingTaskDetail,
  deleteMonitorNode,
  getTerminalAccessUrl,
} from '@/api';
import { hasPermission } from '@/utils/auth';
import { useNavigate } from 'react-router-dom';
import {
  formatFlow as formatBytes, formatSpeedBits as formatSpeed, formatUptime,
  barColor, barColorClass, memPercent, getRegionFlag,
} from '@/utils/formatters';

// ===================== Chart Helpers =====================

const CHART_COLORS = {
  cpu: '#3b82f6',
  ram: '#10b981', ram_total: '#6ee7b7',
  swap: '#f59e0b', swap_total: '#fcd34d',
  disk: '#8b5cf6', disk_total: '#c4b5fd',
  net_in: '#06b6d4', net_out: '#f43f5e',
  load: '#ec4899',
  connections: '#6366f1',
  temp: '#ef4444',
  gpu: '#a855f7',
  process: '#64748b',
  // Pika naming
  cpu_usage: '#3b82f6',
  memory_usage: '#10b981',
  network_upload: '#f43f5e', network_download: '#06b6d4',
  disk_usage: '#8b5cf6',
  temperature_temperature: '#ef4444',
};

const CHART_LABELS: Record<string, string> = {
  cpu: 'CPU %', ram: '已用内存', ram_total: '总内存',
  swap: '已用 Swap', swap_total: '总 Swap',
  disk: '已用磁盘', disk_total: '总磁盘',
  net_in: '下行 B/s', net_out: '上行 B/s',
  load: '负载', connections: 'TCP 连接数',
  temp: '温度 °C', gpu: 'GPU %', process: '进程数',
  cpu_usage: 'CPU %', memory_usage: '内存 %',
  network_upload: '上行 B/s', network_download: '下行 B/s',
  disk_usage: '磁盘 %',
  temperature_temperature: '温度 °C',
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
    const tempSeries = allSeries.filter(s => s.name.startsWith('temperature_'));
    if (tempSeries.length > 0) groups.push({ title: '温度', unit: '°C', series: tempSeries });
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
    if (has('temp'))
      groups.push({ title: '温度', unit: '°C', series: allSeries.filter(s => s.name === 'temp') });
    if (has('gpu'))
      groups.push({ title: 'GPU', unit: '%', series: allSeries.filter(s => s.name === 'gpu'), domain: [0, 100] });
    if (has('process'))
      groups.push({ title: '进程数', unit: '', series: allSeries.filter(s => s.name === 'process') });
  }
  return groups;
}

function formatChartTime(ts: number, range: string): string {
  const d = new Date(ts);
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  const hh = d.getHours().toString().padStart(2, '0');
  const mi = d.getMinutes().toString().padStart(2, '0');
  // Always show date for clarity; short format for <=6h
  if (['1h', '3h', '6h'].includes(range)) {
    return `${mm}/${dd} ${hh}:${mi}`;
  }
  return `${mm}/${dd} ${hh}:${mi}`;
}

function formatChartValue(v: number, unit: string): string {
  if (unit === 'bytes' || unit === 'B/s') {
    if (v < 1024) return v.toFixed(0) + ' B';
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
    if (v < 1024 * 1024 * 1024) return (v / (1024 * 1024)).toFixed(1) + ' MB';
    return (v / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
  if (unit === '%') return v.toFixed(1) + '%';
  if (unit === '°C') return v.toFixed(1) + '°C';
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

// ===================== Merged Server type =====================

/** A unified "server" entry that merges dual-probe nodes into one row */
interface MergedServer {
  /** Primary node (prefers Komari, or whichever has online=1) */
  primary: MonitorNodeSnapshot;
  /** Peer node from the other probe type (if dual-probe) */
  peer?: MonitorNodeSnapshot;
  /** Display name */
  name: string;
  ip: string;
  region: string;
  os: string;
  assetId?: number | null;
  assetName?: string | null;
  isOnline: boolean;
  isDual: boolean;
  /** Best metric (prefer online node) */
  cpu: number;
  mem: number;
  disk: number;
  netIn: number;
  netOut: number;
  uptime: number;
  trafficUsed: number;
  trafficLimit: number;
  tags: string;
}

type SortKey = 'name' | 'cpu' | 'mem' | 'disk' | 'traffic' | 'uptime';
type ViewMode = 'card' | 'list';

function mergeNodes(nodes: MonitorNodeSnapshot[]): MergedServer[] {
  // Group by assetId; unlinked nodes are standalone
  const byAsset = new Map<string, MonitorNodeSnapshot[]>();
  nodes.forEach(n => {
    const key = n.assetId ? `asset-${n.assetId}` : `solo-${n.instanceId}-${n.id}`;
    const group = byAsset.get(key) || [];
    group.push(n);
    byAsset.set(key, group);
  });

  const servers: MergedServer[] = [];
  byAsset.forEach(group => {
    // Pick primary: prefer online, then komari
    const sorted = [...group].sort((a, b) => {
      if ((a.online ?? 0) !== (b.online ?? 0)) return (b.online ?? 0) - (a.online ?? 0);
      if ((a.instanceType || 'komari') === 'komari' && (b.instanceType || 'komari') !== 'komari') return -1;
      return 0;
    });
    const primary = sorted[0];
    const peer = sorted.length >= 2 ? sorted[1] : undefined;
    const m = primary.latestMetric;
    const pm = peer?.latestMetric;
    // Use best metrics from either probe
    const bestM = (primary.online === 1 ? m : pm) || m || pm;

    servers.push({
      primary,
      peer,
      name: primary.assetName || primary.name || primary.ip || primary.remoteNodeUuid?.slice(0, 8) || '-',
      ip: primary.ip || peer?.ip || '-',
      region: primary.region || peer?.region || '',
      os: primary.os || peer?.os || '',
      assetId: primary.assetId,
      assetName: primary.assetName,
      isOnline: primary.online === 1 || (peer?.online === 1),
      isDual: !!peer,
      cpu: bestM?.cpuUsage || 0,
      mem: memPercent(bestM?.memUsed, bestM?.memTotal),
      disk: memPercent(bestM?.diskUsed, bestM?.diskTotal),
      netIn: bestM?.netIn || 0,
      netOut: bestM?.netOut || 0,
      uptime: bestM?.uptime || 0,
      trafficUsed: primary.trafficUsed || peer?.trafficUsed || 0,
      trafficLimit: primary.trafficLimit || peer?.trafficLimit || 0,
      tags: primary.tags || peer?.tags || '',
    });
  });
  return servers;
}

// ===================== Component =====================

export default function ServerDashboardPage() {
  const navigate = useNavigate();
  const canViewServerDashboard = hasPermission('server_dashboard.read');
  const canViewAssets = hasPermission('asset.read');
  const canViewProbe = hasPermission('probe.read');
  const canViewAlerts = hasPermission('alert.read');
  const [nodes, setNodes] = useState<MonitorNodeSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [probeFilter, setProbeFilter] = useState<'all' | 'komari' | 'pika' | 'dual'>('all');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [regionFilter, setRegionFilter] = useState<string>('');
  const [osFilter, setOsFilter] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cardProviderDetails, setCardProviderDetails] = useState<Record<number, MonitorNodeProviderDetail>>({});
  const [cardLoadingIds, setCardLoadingIds] = useState<Record<number, boolean>>({});

  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure();
  const [selectedNode, setSelectedNode] = useState<MonitorNodeSnapshot | null>(null);
  const [providerDetail, setProviderDetail] = useState<MonitorNodeProviderDetail | null>(null);
  const [providerDetailLoading, setProviderDetailLoading] = useState(false);
  const [providerDetailError, setProviderDetailError] = useState('');
  const [selectedPingTaskId, setSelectedPingTaskId] = useState<number | null>(null);
  const [pingTaskDetail, setPingTaskDetail] = useState<KomariPingTaskDetail | null>(null);
  const [pingTaskLoading, setPingTaskLoading] = useState(false);
  const [pingTaskError, setPingTaskError] = useState('');
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
    setProviderDetail(null);
    setProviderDetailError('');
    setSelectedPingTaskId(null);
    setPingTaskDetail(null);
    setPingTaskError('');
    setShowCharts(false);
    setChartRange('1h');
    onDetailOpen();
  };

  useEffect(() => {
    if (!isDetailOpen || !selectedNode) return;
    let cancelled = false;
    setProviderDetailLoading(true);
    setProviderDetailError('');
    getMonitorNodeProviderDetail(selectedNode.id)
      .then(res => {
        if (cancelled) return;
        if (res.code === 0 && res.data) {
          setProviderDetail(res.data as MonitorNodeProviderDetail);
          setProviderDetailError((res.data as MonitorNodeProviderDetail)?.error || '');
        } else {
          setProviderDetail(null);
          setProviderDetailError(res.msg || '获取探针专属详情失败');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProviderDetail(null);
          setProviderDetailError('获取探针专属详情失败');
        }
      })
      .finally(() => {
        if (!cancelled) setProviderDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [isDetailOpen, selectedNode]);

  const loadPingTaskDetail = useCallback(async (taskId: number) => {
    if (!selectedNode) return;
    setSelectedPingTaskId(taskId);
    setPingTaskLoading(true);
    setPingTaskError('');
    try {
      const res = await getKomariPingTaskDetail(selectedNode.id, taskId, 12);
      if (res.code === 0 && res.data) {
        setPingTaskDetail(res.data as KomariPingTaskDetail);
      } else {
        setPingTaskDetail(null);
        setPingTaskError(res.msg || '获取 Ping 记录失败');
      }
    } catch {
      setPingTaskDetail(null);
      setPingTaskError('获取 Ping 记录失败');
    } finally {
      setPingTaskLoading(false);
    }
  }, [selectedNode]);

  // Merge nodes into unified servers (dual-probe = 1 server)
  const allServers = useMemo(() => mergeNodes(nodes), [nodes]);

  const serverSummary = useMemo(() => {
    const total = allServers.length;
    const online = allServers.filter(s => s.isOnline).length;
    return { total, online, offline: total - online };
  }, [allServers]);

  // Collect all unique tags with counts (from merged servers)
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allServers.forEach(s => {
      if (s.tags) {
        try { JSON.parse(s.tags).forEach((t: string) => { counts[t] = (counts[t] || 0) + 1; }); } catch { /* ignore */ }
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allServers]);

  // Count by probe type (based on merged servers)
  const probeCounts = useMemo(() => {
    const counts = { komari: 0, pika: 0, dual: 0 };
    allServers.forEach(s => {
      if (s.isDual) counts.dual++;
      else if ((s.primary.instanceType || 'komari') === 'pika') counts.pika++;
      else counts.komari++;
    });
    return counts;
  }, [allServers]);

  // Region counts from servers
  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allServers.forEach(s => { const r = s.region || ''; counts[r] = (counts[r] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allServers]);

  // OS counts from servers
  const osCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allServers.forEach(s => {
      let cat = '';
      const os = (s.os || '').toLowerCase();
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
  }, [allServers]);

  // Filter and sort merged servers
  const filteredServers = useMemo(() => {
    let list = allServers;
    if (statusFilter === 'online') list = list.filter(s => s.isOnline);
    else if (statusFilter === 'offline') list = list.filter(s => !s.isOnline);
    if (probeFilter === 'dual') list = list.filter(s => s.isDual);
    else if (probeFilter === 'komari') list = list.filter(s => !s.isDual && (s.primary.instanceType || 'komari') === 'komari');
    else if (probeFilter === 'pika') list = list.filter(s => !s.isDual && s.primary.instanceType === 'pika');
    if (regionFilter) {
      list = list.filter(s => regionFilter === '_empty' ? !s.region : s.region === regionFilter);
    }
    if (osFilter) {
      const q = osFilter.toLowerCase();
      list = list.filter(s => {
        if (osFilter === '_empty') return !s.os;
        const os = (s.os || '').toLowerCase();
        if (q === 'other') return os && !['ubuntu','debian','centos','alma','rocky','fedora','alpine','arch','windows','macos','darwin'].some(k => os.includes(k));
        return os.includes(q);
      });
    }
    if (tagFilter) {
      list = list.filter(s => {
        if (!s.tags) return false;
        try { return JSON.parse(s.tags).includes(tagFilter); } catch { return false; }
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.ip.toLowerCase().includes(q) ||
        s.region.toLowerCase().includes(q) ||
        s.os.toLowerCase().includes(q) ||
        (s.assetName || '').toLowerCase().includes(q) ||
        (s.primary.instanceName || '').toLowerCase().includes(q) ||
        s.tags.toLowerCase().includes(q)
      );
    }
    // Sort
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'cpu': cmp = a.cpu - b.cpu; break;
        case 'mem': cmp = a.mem - b.mem; break;
        case 'disk': cmp = a.disk - b.disk; break;
        case 'traffic': {
          const aPct = a.trafficLimit > 0 ? a.trafficUsed / a.trafficLimit : 0;
          const bPct = b.trafficLimit > 0 ? b.trafficUsed / b.trafficLimit : 0;
          cmp = aPct - bPct;
          break;
        }
        case 'uptime': cmp = a.uptime - b.uptime; break;
        default: cmp = a.name.localeCompare(b.name, 'zh-CN');
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [allServers, search, statusFilter, probeFilter, tagFilter, regionFilter, osFilter, sortKey, sortAsc]);

  useEffect(() => {
    const candidates = filteredServers
      .slice(0, 12)
      .map((s) => s.primary.id)
      .filter((id) => !cardProviderDetails[id] && !cardLoadingIds[id]);
    if (candidates.length === 0) return;
    let cancelled = false;
    candidates.forEach((id) => {
      setCardLoadingIds((prev) => ({ ...prev, [id]: true }));
      getMonitorNodeProviderDetail(id)
        .then((res) => {
          if (cancelled || res.code !== 0 || !res.data) return;
          setCardProviderDetails((prev) => ({ ...prev, [id]: res.data as MonitorNodeProviderDetail }));
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) {
            setCardLoadingIds((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
          }
        });
    });
    return () => { cancelled = true; };
  }, [filteredServers, cardLoadingIds, cardProviderDetails]);

  if (!canViewServerDashboard) {
    return (
      <Card className="border border-danger/20 bg-danger-50/60">
        <CardBody className="p-6"><h1 className="text-xl font-semibold text-danger">缺少服务器看板查看权限</h1></CardBody>
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
          {canViewAssets && <Button size="sm" variant="flat" onPress={() => navigate('/assets')}>资产管理</Button>}
          {canViewProbe && <Button size="sm" variant="flat" onPress={() => navigate('/probe')}>探针配置</Button>}
          {canViewAlerts && <Button size="sm" variant="flat" onPress={() => navigate('/alert')}>告警管理</Button>}
        </div>
      </div>

      {/* Summary Bar */}
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
          {(['all', 'komari', 'pika', 'dual'] as const).map(t => (
            <button key={t} onClick={() => setProbeFilter(t)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all cursor-pointer border ${
                probeFilter === t
                  ? 'border-primary bg-primary-50 dark:bg-primary/10 text-primary'
                  : 'border-divider/60 bg-content1 text-default-500 hover:border-primary/40'
              }`}>
              {t === 'all' ? '全部' : t === 'komari' ? `K(${probeCounts.komari})` : t === 'pika' ? `P(${probeCounts.pika})` : `双探针(${probeCounts.dual})`}
            </button>
          ))}
        </div>

        {/* View toggle + Sort */}
        <div className="flex gap-1 ml-2">
          <button onClick={() => setViewMode('card')}
            className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all cursor-pointer border ${viewMode === 'card' ? 'border-primary bg-primary-50 dark:bg-primary/10 text-primary' : 'border-divider/60 text-default-500 hover:border-primary/40'}`}
            title="卡片视图">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M3 4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm8 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V4zM3 12a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1v-4zm8 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
          </button>
          <button onClick={() => setViewMode('list')}
            className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all cursor-pointer border ${viewMode === 'list' ? 'border-primary bg-primary-50 dark:bg-primary/10 text-primary' : 'border-divider/60 text-default-500 hover:border-primary/40'}`}
            title="列表视图">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
          </button>
        </div>

        {/* Sort */}
        <div className="flex gap-1">
          {([
            ['name', '名称'],
            ['cpu', 'CPU'],
            ['mem', '内存'],
            ['disk', '磁盘'],
            ['traffic', '流量'],
            ['uptime', '运行'],
          ] as [SortKey, string][]).map(([key, label]) => (
            <button key={key}
              onClick={() => { if (sortKey === key) setSortAsc(!sortAsc); else { setSortKey(key); setSortAsc(key === 'name'); } }}
              className={`rounded-lg px-2 py-1 text-[10px] font-bold tracking-wider transition-all cursor-pointer border ${
                sortKey === key ? 'border-primary bg-primary-50 dark:bg-primary/10 text-primary' : 'border-divider/60 text-default-400 hover:border-primary/40'
              }`}>
              {label}{sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}
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
                }`}>{getRegionFlag(region)}{region} ({count})</button>
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
            ALL ({allServers.length})
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
      ) : filteredServers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider/60 p-12 text-center">
          <h3 className="text-base font-semibold text-default-600">
            {allServers.length === 0 ? '暂无服务器' : '没有匹配的结果'}
          </h3>
          <p className="mt-2 text-sm text-default-400">
            {allServers.length === 0 ? '添加探针实例并同步后，服务器将显示在此处。' : '尝试调整搜索条件或筛选项。'}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        /* ========== List/Table View ========== */
        <div className="rounded-xl border border-divider/60 bg-content1 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-divider/60 bg-default-50/60">
                <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-widest text-default-400 uppercase">状态</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-widest text-default-400 uppercase">名称 / IP</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-widest text-default-400 uppercase">探针</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-widest text-default-400 uppercase">CPU</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-widest text-default-400 uppercase">内存</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-widest text-default-400 uppercase">磁盘</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-widest text-default-400 uppercase">网络</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-widest text-default-400 uppercase">运行</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold tracking-widest text-default-400 uppercase">地区</th>
              </tr>
            </thead>
            <tbody>
              {filteredServers.map(server => {
                const m = server.primary.latestMetric;
                return (
                  <tr key={`${server.primary.instanceId}-${server.primary.id}`}
                    onClick={() => openDetail(server.primary)}
                    className={`border-b border-divider/30 cursor-pointer transition-colors ${server.isOnline ? 'hover:bg-default-50' : 'bg-danger-50/10 hover:bg-danger-50/20'}`}
                  >
                    <td className="px-3 py-2">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${server.isOnline ? 'bg-success animate-pulse' : 'bg-danger'}`} />
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-sm truncate max-w-[200px]">{server.name}</p>
                      <p className="text-[11px] text-default-400 font-mono">{server.ip}</p>
                    </td>
                    <td className="px-3 py-2">
                      {server.isDual ? (
                        <div className="flex gap-1">
                          <Chip size="sm" variant="flat" color="primary" className="h-4 text-[9px]">K</Chip>
                          <Chip size="sm" variant="flat" color="secondary" className="h-4 text-[9px]">P</Chip>
                        </div>
                      ) : (
                        <Chip size="sm" variant="flat" color={server.primary.instanceType === 'pika' ? 'secondary' : 'primary'} className="h-4 text-[9px]">
                          {server.primary.instanceType === 'pika' ? 'Pika' : 'Komari'}
                        </Chip>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {server.isOnline ? (
                        <div className="flex items-center gap-1.5 min-w-[80px]">
                          <div className="flex-1 h-1.5 bg-default-200 dark:bg-default-100 rounded-sm overflow-hidden">
                            <div className={`h-full rounded-sm ${barColorClass(server.cpu)}`} style={{ width: `${Math.min(server.cpu, 100)}%` }} />
                          </div>
                          <span className={`text-[11px] font-mono ${server.cpu > 90 ? 'text-danger' : server.cpu > 75 ? 'text-warning' : 'text-default-600'}`}>{server.cpu.toFixed(0)}%</span>
                        </div>
                      ) : <span className="text-[11px] text-default-300">-</span>}
                    </td>
                    <td className="px-3 py-2">
                      {server.isOnline ? (
                        <div className="flex items-center gap-1.5 min-w-[80px]">
                          <div className="flex-1 h-1.5 bg-default-200 dark:bg-default-100 rounded-sm overflow-hidden">
                            <div className={`h-full rounded-sm ${barColorClass(server.mem)}`} style={{ width: `${Math.min(server.mem, 100)}%` }} />
                          </div>
                          <span className={`text-[11px] font-mono ${server.mem > 90 ? 'text-danger' : server.mem > 75 ? 'text-warning' : 'text-default-600'}`}>{server.mem.toFixed(0)}%</span>
                        </div>
                      ) : <span className="text-[11px] text-default-300">-</span>}
                    </td>
                    <td className="px-3 py-2">
                      {server.isOnline ? (
                        <div className="flex items-center gap-1.5 min-w-[80px]">
                          <div className="flex-1 h-1.5 bg-default-200 dark:bg-default-100 rounded-sm overflow-hidden">
                            <div className={`h-full rounded-sm ${barColorClass(server.disk)}`} style={{ width: `${Math.min(server.disk, 100)}%` }} />
                          </div>
                          <span className={`text-[11px] font-mono ${server.disk > 90 ? 'text-danger' : server.disk > 75 ? 'text-warning' : 'text-default-600'}`}>{server.disk.toFixed(0)}%</span>
                        </div>
                      ) : <span className="text-[11px] text-default-300">-</span>}
                    </td>
                    <td className="px-3 py-2 text-[10px] font-mono text-default-500">
                      {server.isOnline && m ? (
                        <>
                          <span className="text-success">↓</span>{formatSpeed(m.netIn)}
                          <span className="mx-1 text-default-200">|</span>
                          <span className="text-primary">↑</span>{formatSpeed(m.netOut)}
                        </>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-mono text-default-500">
                      {server.isOnline && m ? formatUptime(m.uptime) : '-'}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-default-500">
                      {server.region ? `${getRegionFlag(server.region)}${server.region}` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ========== Card Grid View ========== */
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredServers.map((server) => {
            const node = server.primary;
            const m = node.latestMetric;
            const cardDetail = cardProviderDetails[node.id];
            const cardLoading = !!cardLoadingIds[node.id];

            return (
              <button
                type="button"
                key={`${node.instanceId}-${node.id}`}
                onClick={() => openDetail(node)}
                className={`rounded-xl border p-3 text-left transition-all hover:shadow-md cursor-pointer ${
                  server.isOnline
                    ? 'border-divider/60 bg-content1 hover:border-primary/40'
                    : 'border-danger/20 bg-danger-50/20 dark:bg-danger-50/5 hover:border-danger/40'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                        server.isOnline ? 'bg-success animate-pulse' : 'bg-danger'
                      }`} />
                      <span className="truncate font-semibold text-sm">{server.name}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-default-400 font-mono pl-4">
                      {server.ip}
                      {server.region ? ` / ${getRegionFlag(server.region)}${server.region}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    {server.isDual ? (
                      <div className="flex gap-0.5">
                        <Chip size="sm" variant="flat" color="primary" className="h-4 text-[9px]">K</Chip>
                        <Chip size="sm" variant="flat" color="secondary" className="h-4 text-[9px]">P</Chip>
                      </div>
                    ) : (
                      <Chip size="sm" variant="flat" color={node.instanceType === 'pika' ? 'secondary' : 'primary'} className="h-4 text-[9px]">
                        {node.instanceType === 'pika' ? 'Pika' : 'Komari'}
                      </Chip>
                    )}
                  </div>
                </div>

                {/* Metrics - compact resource bars */}
                {server.isOnline && m ? (
                  <div className="space-y-1.5">
                    {/* CPU */}
                    <div className="flex items-center gap-1.5">
                      <span className="w-7 text-[10px] font-bold tracking-wider text-default-400 flex-shrink-0">CPU</span>
                      <div className="flex-1 h-1.5 bg-default-200 dark:bg-default-100 rounded-sm overflow-hidden">
                        <div className={`h-full transition-all duration-700 ease-out rounded-sm ${barColorClass(server.cpu)}`}
                          style={{ width: `${Math.min(server.cpu, 100)}%` }} />
                      </div>
                      <span className={`w-9 text-right text-[11px] font-mono font-medium ${server.cpu > 90 ? 'text-danger' : server.cpu > 75 ? 'text-warning' : 'text-default-600'}`}>
                        {server.cpu.toFixed(0)}%
                      </span>
                    </div>
                    {/* MEM */}
                    <div className="flex items-center gap-1.5">
                      <span className="w-7 text-[10px] font-bold tracking-wider text-default-400 flex-shrink-0">MEM</span>
                      <div className="flex-1 h-1.5 bg-default-200 dark:bg-default-100 rounded-sm overflow-hidden">
                        <div className={`h-full transition-all duration-700 ease-out rounded-sm ${barColorClass(server.mem)}`}
                          style={{ width: `${Math.min(server.mem, 100)}%` }} />
                      </div>
                      <span className={`w-9 text-right text-[11px] font-mono font-medium ${server.mem > 90 ? 'text-danger' : server.mem > 75 ? 'text-warning' : 'text-default-600'}`}>
                        {server.mem.toFixed(0)}%
                      </span>
                    </div>
                    {/* DISK */}
                    <div className="flex items-center gap-1.5">
                      <span className="w-7 text-[10px] font-bold tracking-wider text-default-400 flex-shrink-0">DISK</span>
                      <div className="flex-1 h-1.5 bg-default-200 dark:bg-default-100 rounded-sm overflow-hidden">
                        <div className={`h-full transition-all duration-700 ease-out rounded-sm ${barColorClass(server.disk)}`}
                          style={{ width: `${Math.min(server.disk, 100)}%` }} />
                      </div>
                      <span className={`w-9 text-right text-[11px] font-mono font-medium ${server.disk > 90 ? 'text-danger' : server.disk > 75 ? 'text-warning' : 'text-default-600'}`}>
                        {server.disk.toFixed(0)}%
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
                    {server.trafficLimit > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] text-default-400 font-mono">
                        <span className="flex-shrink-0">流量</span>
                        <div className="flex-1 h-1 bg-default-200 dark:bg-default-100 rounded-sm overflow-hidden">
                          <div className={`h-full rounded-sm ${server.trafficUsed / server.trafficLimit > 0.9 ? 'bg-danger' : 'bg-primary'}`}
                            style={{ width: `${Math.min((server.trafficUsed / server.trafficLimit) * 100, 100)}%` }} />
                        </div>
                        <span className="flex-shrink-0">{formatBytes(server.trafficUsed)} / {formatBytes(server.trafficLimit)}</span>
                      </div>
                    )}

                    <div className="rounded-lg bg-default-50 dark:bg-default-100/5 px-2.5 py-2">
                      {cardLoading ? (
                        <p className="text-[10px] text-default-400 font-mono">加载探针摘要...</p>
                      ) : node.instanceType === 'pika' ? (
                        cardDetail?.pikaSecurity ? (
                          <div className="space-y-1 text-[10px] text-default-500 font-mono">
                            <p>
                              安全: 端口 {cardDetail.pikaSecurity.publicListeningPortCount ?? 0}
                              <span className="mx-1 text-default-300">·</span>
                              进程 {cardDetail.pikaSecurity.suspiciousProcessCount ?? 0}
                            </p>
                            <p>
                              防篡改 {cardDetail.pikaSecurity.tamperEnabled ? 'on' : 'off'}
                              {cardDetail.pikaSecurity.auditEndTime ? ` · 审计 ${new Date(cardDetail.pikaSecurity.auditEndTime).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}` : ''}
                            </p>
                          </div>
                        ) : (
                          <p className="text-[10px] text-default-400 font-mono">点击查看安全详情</p>
                        )
                      ) : (
                        cardDetail?.komariOperations ? (
                          <div className="space-y-1 text-[10px] text-default-500 font-mono">
                            <p>
                              任务: Ping {cardDetail.komariOperations.pingTasks?.length ?? 0}
                              <span className="mx-1 text-default-300">·</span>
                              负载 {cardDetail.komariOperations.loadNotifications?.length ?? 0}
                            </p>
                            <p>
                              离线 {cardDetail.komariOperations.offlineNotifications?.length ?? 0}
                              <span className="mx-1 text-default-300">·</span>
                              公开 {cardDetail.komariOperations.publicVisible ? 'yes' : 'no'}
                            </p>
                          </div>
                        ) : (
                          <p className="text-[10px] text-default-400 font-mono">点击查看任务详情</p>
                        )
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="py-3 text-center">
                    <span className="text-[11px] text-danger font-bold tracking-wider">离线</span>
                    {server.os && <p className="text-[10px] text-default-400 mt-1">{server.os}</p>}
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
                      {selectedNode.region ? ` / ${getRegionFlag(selectedNode.region)}${selectedNode.region}` : ''}
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
                        {selectedNode.assetName && <p className="flex justify-between"><span className="text-default-400">资产</span><Chip size="sm" variant="flat" color="primary" className="h-5 cursor-pointer" onClick={() => { onDetailClose(); navigate(selectedNode.assetId ? `/assets?viewId=${selectedNode.assetId}` : '/assets'); }}>{selectedNode.assetName}</Chip></p>}
                        {selectedNode.provider && <p className="flex justify-between"><span className="text-default-400">厂商</span><span>{selectedNode.provider}</span></p>}
                        {selectedNode.label && <p className="flex justify-between"><span className="text-default-400">标签</span><span>{selectedNode.label}</span></p>}
                        {selectedNode.price != null && <p className="flex justify-between"><span className="text-default-400">价格</span><span className="font-mono">{selectedNode.price} {selectedNode.currency || ''}{selectedNode.billingCycle ? ` / ${selectedNode.billingCycle}天` : ''}</span></p>}
                        {selectedNode.monthlyCost && selectedNode.monthlyCost !== '0' && <p className="flex justify-between"><span className="text-default-400">月费</span><span className="font-mono">{selectedNode.monthlyCost} {selectedNode.currency || ''}</span></p>}
                        {selectedNode.bandwidthMbps != null && selectedNode.bandwidthMbps > 0 && <p className="flex justify-between"><span className="text-default-400">带宽</span><span className="font-mono">{selectedNode.bandwidthMbps} Mbps</span></p>}
                        {selectedNode.sshPort != null && selectedNode.sshPort > 0 && <p className="flex justify-between"><span className="text-default-400">SSH</span><span className="font-mono">{selectedNode.sshPort}</span></p>}
                        {selectedNode.purchaseDate != null && selectedNode.purchaseDate > 0 && <p className="flex justify-between"><span className="text-default-400">购买日</span><span className="font-mono">{new Date(selectedNode.purchaseDate).toLocaleDateString('zh-CN')}</span></p>}
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
                        {selectedNode.panelUrl && (
                          <p className="flex justify-between"><span className="text-default-400">1Panel</span><a href={selectedNode.panelUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate ml-2">{selectedNode.panelUrl.replace(/^https?:\/\//, '')}</a></p>
                        )}
                        {selectedNode.remark && <p className="text-default-500 mt-1 break-all">{selectedNode.remark}</p>}
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

                      <Divider />
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">探针专属详情</p>
                          <Chip size="sm" variant="flat" color={selectedNode.instanceType === 'pika' ? 'secondary' : 'primary'} className="h-5">
                            {selectedNode.instanceType === 'pika' ? 'Pika Security' : 'Komari Tasks'}
                          </Chip>
                        </div>

                        {providerDetailLoading ? (
                          <div className="flex justify-center py-6"><Spinner size="sm" /></div>
                        ) : providerDetailError ? (
                          <div className="rounded-lg border border-warning/30 bg-warning-50/30 dark:bg-warning/5 p-3">
                            <p className="text-xs text-warning-700 dark:text-warning">{providerDetailError}</p>
                          </div>
                        ) : selectedNode.instanceType === 'pika' ? (
                          (() => {
                            const pika = providerDetail?.pikaSecurity;
                            return pika ? (
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                                  <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                                    <p className="text-[9px] text-default-400 uppercase tracking-wider">公开端口</p>
                                    <p className="text-sm font-semibold font-mono mt-0.5">{pika.publicListeningPortCount ?? 0}</p>
                                  </div>
                                  <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                                    <p className="text-[9px] text-default-400 uppercase tracking-wider">可疑进程</p>
                                    <p className="text-sm font-semibold font-mono mt-0.5">{pika.suspiciousProcessCount ?? 0}</p>
                                  </div>
                                  <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                                    <p className="text-[9px] text-default-400 uppercase tracking-wider">防篡改</p>
                                    <p className="text-sm font-semibold font-mono mt-0.5">{pika.tamperEnabled ? '已启用' : '未启用'}</p>
                                  </div>
                                  <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                                    <p className="text-[9px] text-default-400 uppercase tracking-wider">最近审计</p>
                                    <p className="text-xs font-semibold font-mono mt-0.5">
                                      {pika.auditEndTime ? new Date(pika.auditEndTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                                    </p>
                                  </div>
                                </div>

                                {!!pika.auditWarnings?.length && (
                                  <div className="rounded-lg border border-warning/30 bg-warning-50/30 dark:bg-warning/5 p-3">
                                    <p className="text-xs font-semibold text-warning-700 dark:text-warning mb-1">采集告警</p>
                                    <div className="flex flex-wrap gap-1">
                                      {pika.auditWarnings.map((item, idx) => (
                                        <Chip key={`${item}-${idx}`} size="sm" variant="flat" color="warning" className="h-5 text-[10px] max-w-full">
                                          {item}
                                        </Chip>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                                    <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-2">公开监听端口</p>
                                    <div className="space-y-1.5">
                                      {pika.publicListeningPorts?.length ? pika.publicListeningPorts.map((port, idx) => (
                                        <div key={`${port.protocol}-${port.port}-${idx}`} className="rounded-lg bg-content1 px-2.5 py-2 text-xs">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="font-mono">{port.protocol || 'tcp'}://{port.address || '0.0.0.0'}:{port.port ?? '-'}</span>
                                            {port.processName && <Chip size="sm" variant="flat" color="secondary" className="h-4 text-[9px]">{port.processName}</Chip>}
                                          </div>
                                        </div>
                                      )) : <p className="text-xs text-default-400">未发现公开监听端口</p>}
                                    </div>
                                  </div>

                                  <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                                    <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-2">可疑进程</p>
                                    <div className="space-y-1.5">
                                      {pika.suspiciousProcesses?.length ? pika.suspiciousProcesses.map((proc, idx) => (
                                        <div key={`${proc.pid}-${idx}`} className="rounded-lg bg-content1 px-2.5 py-2 text-xs">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="font-mono">{proc.name || 'unknown'}#{proc.pid ?? '-'}</span>
                                            <span className="text-default-400">{proc.username || '-'}</span>
                                          </div>
                                          {(proc.cpuPercent != null || proc.memPercent != null) && (
                                            <p className="mt-1 text-[11px] text-default-400 font-mono">
                                              CPU {proc.cpuPercent != null ? proc.cpuPercent.toFixed(1) : '0.0'}% · MEM {proc.memPercent != null ? proc.memPercent.toFixed(1) : '0.0'}%
                                            </p>
                                          )}
                                          {proc.cmdline && <p className="mt-1 truncate text-[11px] text-default-500 font-mono">{proc.cmdline}</p>}
                                        </div>
                                      )) : <p className="text-xs text-default-400">未发现可疑进程</p>}
                                    </div>
                                  </div>

                                  <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                                    <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-2">防篡改</p>
                                    <div className="space-y-2">
                                      <p className="text-xs text-default-500">
                                        状态: <span className="font-mono">{pika.tamperEnabled ? 'enabled' : 'disabled'}</span>
                                        {pika.tamperApplyStatus ? ` · ${pika.tamperApplyStatus}` : ''}
                                      </p>
                                      {!!pika.tamperProtectedPaths?.length && (
                                        <div className="flex flex-wrap gap-1">
                                          {pika.tamperProtectedPaths.map((path, idx) => (
                                            <Chip key={`${path}-${idx}`} size="sm" variant="flat" className="h-5 text-[10px]">{path}</Chip>
                                          ))}
                                        </div>
                                      )}
                                      {!!pika.recentTamperEvents?.length && (
                                        <div className="space-y-1">
                                          {pika.recentTamperEvents.slice(0, 3).map((event, idx) => (
                                            <p key={`${event.path}-${idx}`} className="text-[11px] text-default-500 font-mono">
                                              {event.timestamp ? new Date(event.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'} · {event.operation || 'change'} · {event.path || '-'}
                                            </p>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                                    <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-2">审计批次</p>
                                    <div className="space-y-1.5">
                                      {pika.recentAuditRuns?.length ? pika.recentAuditRuns.map((run, idx) => (
                                        <div key={`${run.startTime}-${idx}`} className="rounded-lg bg-content1 px-2.5 py-2 text-xs">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="font-mono">{run.endTime ? new Date(run.endTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                                            <span className="text-default-400">{run.system || '-'}</span>
                                          </div>
                                          <p className="mt-1 text-[11px] text-default-500 font-mono">
                                            pass {run.passCount ?? 0} · warn {run.warnCount ?? 0} · fail {run.failCount ?? 0}
                                          </p>
                                        </div>
                                      )) : <p className="text-xs text-default-400">暂无历史审计批次</p>}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : <p className="text-xs text-default-400">暂无 Pika 安全详情</p>;
                          })()
                        ) : (
                          (() => {
                            const komari = providerDetail?.komariOperations;
                            return komari ? (
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                                  <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                                    <p className="text-[9px] text-default-400 uppercase tracking-wider">公开节点</p>
                                    <p className="text-sm font-semibold font-mono mt-0.5">{komari.publicVisible ? '公开' : '隐藏'}</p>
                                  </div>
                                  <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                                    <p className="text-[9px] text-default-400 uppercase tracking-wider">Ping 任务</p>
                                    <p className="text-sm font-semibold font-mono mt-0.5">{komari.pingTasks?.length ?? 0}</p>
                                  </div>
                                  <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                                    <p className="text-[9px] text-default-400 uppercase tracking-wider">负载规则</p>
                                    <p className="text-sm font-semibold font-mono mt-0.5">{komari.loadNotifications?.length ?? 0}</p>
                                  </div>
                                  <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                                    <p className="text-[9px] text-default-400 uppercase tracking-wider">离线规则</p>
                                    <p className="text-sm font-semibold font-mono mt-0.5">{komari.offlineNotifications?.length ?? 0}</p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                                    <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-2">公开节点与 Ping 任务</p>
                                    <p className="text-xs text-default-500 mb-2">
                                      {komari.publicVisible
                                        ? `已公开${komari.publicNodeRegion ? ` · ${komari.publicNodeRegion}` : ''}${komari.publicNodeOs ? ` · ${komari.publicNodeOs}` : ''}`
                                        : '当前未公开展示'}
                                    </p>
                                    <div className="space-y-1.5">
                                      {komari.pingTasks?.length ? komari.pingTasks.map((task) => (
                                        <div key={task.taskId} className="rounded-lg bg-content1 px-2.5 py-2 text-xs">
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                              <p className="font-mono truncate">{task.name || `Ping #${task.taskId}`}</p>
                                              <p className="text-[11px] text-default-500 truncate">{task.type || 'icmp'} · {task.target || '-'}</p>
                                            </div>
                                            <Button size="sm" variant={selectedPingTaskId === task.taskId ? 'solid' : 'flat'} color="primary" onPress={() => loadPingTaskDetail(task.taskId)}>
                                              查看记录
                                            </Button>
                                          </div>
                                        </div>
                                      )) : <p className="text-xs text-default-400">该节点未绑定 Ping 任务</p>}
                                    </div>
                                  </div>

                                  <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                                    <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-2">通知规则</p>
                                    <div className="space-y-2">
                                      <div>
                                        <p className="text-[11px] font-semibold text-default-500 mb-1">负载规则</p>
                                        <div className="space-y-1">
                                          {komari.loadNotifications?.length ? komari.loadNotifications.map((rule, idx) => (
                                            <p key={`${rule.name}-${idx}`} className="text-[11px] text-default-500 font-mono">
                                              {rule.name || '负载规则'} · {rule.metric || 'cpu'} &gt; {rule.threshold ?? '-'} · interval {rule.interval ?? '-'}
                                            </p>
                                          )) : <p className="text-xs text-default-400">无负载规则</p>}
                                        </div>
                                      </div>
                                      <Divider />
                                      <div>
                                        <p className="text-[11px] font-semibold text-default-500 mb-1">离线规则</p>
                                        <div className="space-y-1">
                                          {komari.offlineNotifications?.length ? komari.offlineNotifications.map((rule, idx) => (
                                            <p key={`${rule.gracePeriod}-${idx}`} className="text-[11px] text-default-500 font-mono">
                                              {rule.enabled ? 'enabled' : 'disabled'} · grace {rule.gracePeriod ?? 180}s
                                            </p>
                                          )) : <p className="text-xs text-default-400">无离线规则</p>}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {selectedPingTaskId != null && (
                                  <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                      <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">Ping 记录下钻</p>
                                      {pingTaskLoading && <Spinner size="sm" />}
                                    </div>
                                    {pingTaskError ? (
                                      <p className="text-xs text-danger">{pingTaskError}</p>
                                    ) : pingTaskDetail ? (
                                      <div className="space-y-3">
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                          <div className="rounded-lg bg-content1 px-2.5 py-2 text-center">
                                            <p className="text-[9px] text-default-400 uppercase tracking-wider">目标</p>
                                            <p className="text-[11px] font-mono truncate mt-1">{pingTaskDetail.target || '-'}</p>
                                          </div>
                                          <div className="rounded-lg bg-content1 px-2.5 py-2 text-center">
                                            <p className="text-[9px] text-default-400 uppercase tracking-wider">丢包</p>
                                            <p className="text-[11px] font-mono mt-1">{pingTaskDetail.lossPercent?.toFixed(1) ?? '0.0'}%</p>
                                          </div>
                                          <div className="rounded-lg bg-content1 px-2.5 py-2 text-center">
                                            <p className="text-[9px] text-default-400 uppercase tracking-wider">最小</p>
                                            <p className="text-[11px] font-mono mt-1">{pingTaskDetail.minLatency ?? '-'} ms</p>
                                          </div>
                                          <div className="rounded-lg bg-content1 px-2.5 py-2 text-center">
                                            <p className="text-[9px] text-default-400 uppercase tracking-wider">最大</p>
                                            <p className="text-[11px] font-mono mt-1">{pingTaskDetail.maxLatency ?? '-'} ms</p>
                                          </div>
                                          <div className="rounded-lg bg-content1 px-2.5 py-2 text-center">
                                            <p className="text-[9px] text-default-400 uppercase tracking-wider">平均</p>
                                            <p className="text-[11px] font-mono mt-1">{pingTaskDetail.avgLatency?.toFixed(1) ?? '-'} ms</p>
                                          </div>
                                        </div>
                                        <div className="space-y-1.5 max-h-56 overflow-auto pr-1">
                                          {pingTaskDetail.records?.length ? pingTaskDetail.records.map((record, idx) => (
                                            <div key={`${record.time}-${idx}`} className="flex items-center justify-between rounded-lg bg-content1 px-2.5 py-2 text-xs">
                                              <span className="font-mono text-default-500">
                                                {record.time ? new Date(record.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                                              </span>
                                              <Chip size="sm" variant="flat" color={record.loss ? 'danger' : 'success'} className="h-5 text-[10px]">
                                                {record.loss ? 'loss' : `${record.value ?? '-'} ms`}
                                              </Chip>
                                            </div>
                                          )) : <p className="text-xs text-default-400">暂无 Ping 记录</p>}
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-xs text-default-400">选择一个 Ping 任务后查看最近记录</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : <p className="text-xs text-default-400">暂无 Komari 任务详情</p>;
                          })()
                        )}
                      </div>

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
                          selectedNode.peerNodeId ? (
                            /* Dual-probe: side-by-side columns */
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-[10px] font-bold tracking-widest text-primary uppercase mb-2 text-center">
                                  {selectedNode.instanceType === 'pika' ? 'Pika' : 'Komari'}
                                </p>
                                <NodeCharts nodeId={selectedNode.id} range={chartRange} />
                              </div>
                              <div>
                                <p className="text-[10px] font-bold tracking-widest text-secondary uppercase mb-2 text-center">
                                  {selectedNode.peerInstanceType === 'pika' ? 'Pika' : 'Komari'}
                                </p>
                                <NodeCharts nodeId={selectedNode.peerNodeId} range={chartRange} />
                              </div>
                            </div>
                          ) : (
                            /* Single probe: full width */
                            <NodeCharts nodeId={selectedNode.id} range={chartRange} />
                          )
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
                          <Button size="sm" variant="flat" color="warning" onPress={() => { onDetailClose(); navigate(selectedNode.assetId ? `/assets?viewId=${selectedNode.assetId}&deploy=1` : '/assets'); }}>
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
