import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Progress } from "@heroui/progress";
import { Spinner } from "@heroui/spinner";
import { Select, SelectItem } from "@heroui/select";
import { Tabs, Tab } from "@heroui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line,
} from 'recharts';
import {
  AssetHost, getAssetList,
  getTrafficOverview, getTrafficTopForwards, getTrafficTopUsers, getTrafficTrend, getTrafficPeakHours,
} from '@/api';
import { formatFlow, getRegionFlag, barColor } from '@/utils/formatters';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b', '#f97316', '#14b8a6'];

type TrafficSource = 'auto' | 'probe' | 'asset';

/** Resolve effective traffic limit (bytes). Returns -1 for unlimited, 0 for unknown. */
function resolveTrafficLimit(a: AssetHost, source: TrafficSource): number {
  if (source === 'probe') return a.probeTrafficLimit || 0;
  if (source === 'asset') {
    if (!a.monthlyTrafficGb) return 0;
    if (a.monthlyTrafficGb === -1) return -1;
    return a.monthlyTrafficGb * 1024 * 1024 * 1024;
  }
  // auto: prefer probe data, fallback to asset field
  if (a.probeTrafficLimit && a.probeTrafficLimit > 0) return a.probeTrafficLimit;
  if (a.monthlyTrafficGb) {
    if (a.monthlyTrafficGb === -1) return -1;
    return a.monthlyTrafficGb * 1024 * 1024 * 1024;
  }
  return 0;
}

export default function TrafficAnalysisPage() {
  const [assets, setAssets] = useState<AssetHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [trafficSource, setTrafficSource] = useState<TrafficSource>('auto');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await getAssetList();
        if (res.code === 0) setAssets(res.data || []);
      } finally { setLoading(false); }
    })();
  }, []);

  // 有限流量配额的资产
  const trafficAssets = useMemo(() => {
    return assets
      .filter(a => {
        const limit = resolveTrafficLimit(a, trafficSource);
        return limit > 0; // exclude unlimited (-1) and unknown (0)
      })
      .map(a => {
        const used = a.probeTrafficUsed || 0;
        const limit = resolveTrafficLimit(a, trafficSource);
        const pct = limit > 0 ? (used / limit) * 100 : 0;
        return { ...a, used, limit, pct };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [assets, trafficSource]);

  // 不限量流量的资产
  const unlimitedAssets = useMemo(() => {
    return assets.filter(a => {
      const limit = resolveTrafficLimit(a, trafficSource);
      return limit === -1;
    }).map(a => ({
      ...a,
      used: a.probeTrafficUsed || 0,
    })).sort((a, b) => b.used - a.used);
  }, [assets, trafficSource]);

  // 无配额信息的资产
  const noQuotaAssets = useMemo(() => {
    return assets.filter(a => {
      const limit = resolveTrafficLimit(a, trafficSource);
      return limit === 0;
    });
  }, [assets, trafficSource]);

  // 汇总
  const summary = useMemo(() => {
    let totalUsed = 0;
    let totalLimit = 0;
    let overUsed = 0;
    let warning = 0; // >80%
    let unlimitedUsed = 0;
    trafficAssets.forEach(a => {
      totalUsed += a.used;
      totalLimit += a.limit;
      if (a.pct >= 100) overUsed++;
      else if (a.pct >= 80) warning++;
    });
    unlimitedAssets.forEach(a => { unlimitedUsed += a.used; });
    return {
      totalUsed, totalLimit,
      totalPct: totalLimit > 0 ? (totalUsed / totalLimit * 100) : 0,
      trackedCount: trafficAssets.length,
      unlimitedCount: unlimitedAssets.length,
      unlimitedUsed,
      overUsed, warning,
      noQuota: noQuotaAssets.length,
    };
  }, [trafficAssets, unlimitedAssets, noQuotaAssets]);

  // 按地区流量分布
  const byRegion = useMemo(() => {
    const map: Record<string, { used: number; limit: number }> = {};
    trafficAssets.forEach(a => {
      const region = a.region || '未设置';
      if (!map[region]) map[region] = { used: 0, limit: 0 };
      map[region].used += a.used;
      map[region].limit += a.limit;
    });
    return Object.entries(map)
      .map(([name, v]) => ({
        name: `${getRegionFlag(name)}${name}`,
        used: Math.round(v.used / (1024 * 1024 * 1024) * 10) / 10,
        limit: Math.round(v.limit / (1024 * 1024 * 1024) * 10) / 10,
        pct: v.limit > 0 ? (v.used / v.limit * 100) : 0,
      }))
      .sort((a, b) => b.used - a.used);
  }, [trafficAssets]);

  // 按供应商流量分布
  const byProvider = useMemo(() => {
    const map: Record<string, number> = {};
    [...trafficAssets, ...unlimitedAssets].forEach(a => {
      const provider = a.provider || '未设置';
      map[provider] = (map[provider] || 0) + (a.probeTrafficUsed || 0);
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value / (1024 * 1024 * 1024) * 10) / 10 }))
      .filter(v => v.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [trafficAssets, unlimitedAssets]);

  // 带宽分布
  const bandwidthDist = useMemo(() => {
    const map: Record<string, number> = {};
    assets.forEach(a => {
      if (a.bandwidthMbps && a.bandwidthMbps > 0) {
        let label: string;
        if (a.bandwidthMbps <= 100) label = '≤100M';
        else if (a.bandwidthMbps <= 500) label = '100M-500M';
        else if (a.bandwidthMbps <= 1000) label = '500M-1G';
        else if (a.bandwidthMbps <= 10000) label = '1G-10G';
        else label = '10G+';
        map[label] = (map[label] || 0) + 1;
      }
    });
    const order = ['≤100M', '100M-500M', '500M-1G', '1G-10G', '10G+'];
    return order
      .filter(k => map[k])
      .map(name => ({ name, value: map[name] }));
  }, [assets]);

  const [activeTab, setActiveTab] = useState('server');

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">流量分析</h1>
          <p className="mt-0.5 text-sm text-default-500">服务器流量使用概览与配额预警</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'server' && (
            <Select size="sm" className="w-36" selectedKeys={[trafficSource]}
              onSelectionChange={(keys) => setTrafficSource(Array.from(keys)[0] as TrafficSource || 'auto')}>
              <SelectItem key="auto">自动匹配</SelectItem>
              <SelectItem key="probe">探针数据</SelectItem>
              <SelectItem key="asset">资产配置</SelectItem>
            </Select>
          )}
        </div>
      </div>

      <Tabs selectedKey={activeTab} onSelectionChange={k => setActiveTab(k as string)} variant="underlined" size="sm">
        <Tab key="server" title="服务器流量" />
        <Tab key="proxy" title="代理流量" />
      </Tabs>

      {activeTab === 'proxy' ? <ProxyTrafficTab /> : (<>
      {/* ====== Server Traffic Tab ====== */}

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card className="border border-divider/60"><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">总已用 / 总配额</p>
          <p className="text-lg font-bold font-mono mt-1">
            {formatFlow(summary.totalUsed)} / {formatFlow(summary.totalLimit)}
          </p>
          <Progress size="sm" value={summary.totalPct} color={barColor(summary.totalPct)} className="mt-1.5" />
        </CardBody></Card>
        <Card className="border border-divider/60"><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">有配额服务器</p>
          <p className="text-xl font-bold font-mono mt-1">{summary.trackedCount}</p>
        </CardBody></Card>
        <Card className="border border-divider/60"><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">不限量</p>
          <p className="text-xl font-bold font-mono text-primary mt-1">{summary.unlimitedCount}</p>
          {summary.unlimitedUsed > 0 && (
            <p className="text-[10px] text-default-400 mt-0.5">已用 {formatFlow(summary.unlimitedUsed)}</p>
          )}
        </CardBody></Card>
        <Card className="border border-divider/60"><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">无配额</p>
          <p className="text-xl font-bold font-mono text-default-400 mt-1">{summary.noQuota}</p>
        </CardBody></Card>
        <Card className={`border ${summary.warning > 0 ? 'border-warning/40 bg-warning-50/20' : 'border-divider/60'}`}><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-warning uppercase">接近上限 (&gt;80%)</p>
          <p className={`text-xl font-bold font-mono mt-1 ${summary.warning > 0 ? 'text-warning' : ''}`}>{summary.warning}</p>
        </CardBody></Card>
        <Card className={`border ${summary.overUsed > 0 ? 'border-danger/40 bg-danger-50/20' : 'border-divider/60'}`}><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-danger uppercase">已超额</p>
          <p className={`text-xl font-bold font-mono mt-1 ${summary.overUsed > 0 ? 'text-danger' : ''}`}>{summary.overUsed}</p>
        </CardBody></Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Region Traffic Distribution */}
        <Card className="border border-divider/60">
          <CardBody className="p-4">
            <p className="text-sm font-semibold mb-3">按地区流量分布 (GB)</p>
            {byRegion.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byRegion} margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [`${Number(value).toFixed(1)} GB`]} />
                  <Bar dataKey="used" name="已用" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="limit" name="配额" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-default-400 text-center py-8">暂无流量数据</p>
            )}
          </CardBody>
        </Card>

        {/* Provider Traffic Distribution */}
        <Card className="border border-divider/60">
          <CardBody className="p-4">
            <p className="text-sm font-semibold mb-3">按供应商流量分布 (GB)</p>
            {byProvider.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={byProvider} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={100} label={({ name, value }) => `${name} ${value}GB`}
                    labelLine={{ strokeWidth: 1 }}>
                    {byProvider.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} GB`, '已用流量']} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-default-400 text-center py-8">暂无流量数据</p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Bandwidth Distribution */}
      {bandwidthDist.length > 0 && (
        <Card className="border border-divider/60">
          <CardBody className="p-4">
            <p className="text-sm font-semibold mb-3">带宽分布</p>
            <div className="flex gap-3 flex-wrap">
              {bandwidthDist.map(d => (
                <div key={d.name} className="flex items-center gap-2 bg-default-50 dark:bg-default-50/10 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium">{d.name}</span>
                  <Chip size="sm" variant="flat" className="h-5 text-[10px]">{d.value}台</Chip>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Per-server traffic list */}
      <Card className="border border-divider/60">
        <CardBody className="p-4">
          <p className="text-sm font-semibold mb-3">服务器流量使用排行</p>
          {trafficAssets.length > 0 ? (
            <div className="space-y-2">
              {trafficAssets.map(a => (
                <div key={a.id} className="flex items-center gap-3 text-sm">
                  <div className="w-40 min-w-0 flex-shrink-0 truncate">
                    <span className="font-medium">{getRegionFlag(a.region)}{a.name}</span>
                  </div>
                  <div className="flex-1">
                    <Progress
                      size="sm"
                      value={Math.min(a.pct, 100)}
                      color={a.pct >= 100 ? 'danger' : a.pct >= 80 ? 'warning' : 'primary'}
                    />
                  </div>
                  <span className="w-28 text-right font-mono text-xs flex-shrink-0 text-default-500">
                    {formatFlow(a.used)} / {formatFlow(a.limit)}
                  </span>
                  <span className={`w-14 text-right font-mono text-xs font-bold flex-shrink-0 ${
                    a.pct >= 100 ? 'text-danger' : a.pct >= 80 ? 'text-warning' : 'text-default-600'
                  }`}>
                    {a.pct.toFixed(1)}%
                  </span>
                  {a.provider && <Chip size="sm" variant="flat" className="h-5 text-[10px] flex-shrink-0">{a.provider}</Chip>}
                  {a.pct >= 100 && <Chip size="sm" variant="flat" color="danger" className="h-5 text-[10px]">超额</Chip>}
                  {a.pct >= 80 && a.pct < 100 && <Chip size="sm" variant="flat" color="warning" className="h-5 text-[10px]">预警</Chip>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-default-400 text-center py-8">暂无有流量配额的服务器</p>
          )}
        </CardBody>
      </Card>

      {/* Unlimited traffic servers */}
      {unlimitedAssets.length > 0 && (
        <Card className="border border-divider/60">
          <CardBody className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm font-semibold">不限量流量服务器</p>
              <Chip size="sm" variant="flat" color="primary" className="h-5 text-[10px]">{unlimitedAssets.length}台</Chip>
            </div>
            <div className="space-y-1.5">
              {unlimitedAssets.map(a => (
                <div key={a.id} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm bg-default-50/60 dark:bg-default-50/10">
                  <span className="flex-1 font-medium truncate">
                    {getRegionFlag(a.region)}{a.name}
                  </span>
                  <span className="text-xs text-default-500 font-mono flex-shrink-0">
                    已用 {formatFlow(a.used)}
                  </span>
                  {a.bandwidthMbps && a.bandwidthMbps > 0 && (
                    <Chip size="sm" variant="flat" className="h-5 text-[10px] flex-shrink-0">
                      {a.bandwidthMbps >= 1000 ? `${(a.bandwidthMbps / 1000).toFixed(0)}Gbps` : `${a.bandwidthMbps}Mbps`}
                    </Chip>
                  )}
                  {a.provider && <Chip size="sm" variant="flat" className="h-5 text-[10px] flex-shrink-0">{a.provider}</Chip>}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
      </>)}
    </div>
  );
}

/** ====== Proxy Traffic Tab (GOST per-forward/per-user) ====== */
function ProxyTrafficTab() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<{ totalUpload24h: number; totalDownload24h: number; peakRate24h: number; unacknowledgedAnomalies: number } | null>(null);
  const [topForwards, setTopForwards] = useState<{ dimensionId: number; dimensionName?: string; totalBytes: number }[]>([]);
  const [topUsers, setTopUsers] = useState<{ dimensionId: number; dimensionName?: string; totalBytes: number }[]>([]);
  const [trend, setTrend] = useState<{ hourKey: string; uploadBytes: number; downloadBytes: number }[]>([]);
  const [peakHours, setPeakHours] = useState<{ hour: number; totalBytes: number }[]>([]);
  const [range, setRange] = useState('24h');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [ovRes, fwdRes, usrRes, trendRes, peakRes] = await Promise.all([
          getTrafficOverview().catch(() => null),
          getTrafficTopForwards(range, 10).catch(() => null),
          getTrafficTopUsers(range, 10).catch(() => null),
          getTrafficTrend({ range }).catch(() => null),
          getTrafficPeakHours(range).catch(() => null),
        ]);
        if (ovRes?.code === 0) setOverview(ovRes.data);
        if (fwdRes?.code === 0) setTopForwards(fwdRes.data || []);
        if (usrRes?.code === 0) setTopUsers(usrRes.data || []);
        if (trendRes?.code === 0) setTrend(trendRes.data || []);
        if (peakRes?.code === 0) setPeakHours(peakRes.data || []);
      } finally { setLoading(false); }
    })();
  }, [range]);

  if (loading) return <div className="flex h-32 items-center justify-center"><Spinner size="sm" /></div>;

  const hasData = overview && (overview.totalUpload24h > 0 || overview.totalDownload24h > 0);

  return (
    <div className="space-y-5">
      {/* Range selector */}
      <div className="flex justify-end">
        <Select size="sm" className="w-28" selectedKeys={[range]}
          onSelectionChange={keys => setRange(Array.from(keys)[0] as string || '24h')}>
          <SelectItem key="1h">1小时</SelectItem>
          <SelectItem key="6h">6小时</SelectItem>
          <SelectItem key="24h">24小时</SelectItem>
          <SelectItem key="7d">7天</SelectItem>
          <SelectItem key="30d">30天</SelectItem>
        </Select>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card className="border border-divider/60"><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">上传总量</p>
          <p className="text-xl font-bold font-mono mt-1">{formatFlow(overview?.totalUpload24h || 0)}</p>
        </CardBody></Card>
        <Card className="border border-divider/60"><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">下载总量</p>
          <p className="text-xl font-bold font-mono mt-1">{formatFlow(overview?.totalDownload24h || 0)}</p>
        </CardBody></Card>
        <Card className="border border-divider/60"><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">峰值速率</p>
          <p className="text-xl font-bold font-mono mt-1">{overview?.peakRate24h ? formatFlow(overview.peakRate24h) + '/s' : '-'}</p>
        </CardBody></Card>
        <Card className={`border ${(overview?.unacknowledgedAnomalies || 0) > 0 ? 'border-warning/40 bg-warning-50/20' : 'border-divider/60'}`}><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-warning uppercase">未确认异常</p>
          <p className={`text-xl font-bold font-mono mt-1 ${(overview?.unacknowledgedAnomalies || 0) > 0 ? 'text-warning' : ''}`}>{overview?.unacknowledgedAnomalies || 0}</p>
        </CardBody></Card>
      </div>

      {!hasData ? (
        <Card className="border border-divider/60">
          <CardBody className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="rounded-full bg-default-100 p-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-default-300">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <p className="text-sm font-medium text-default-500">暂无代理流量数据</p>
            <p className="text-xs text-default-400 max-w-sm text-center">GOST 节点有转发流量后，系统每小时自动聚合一次统计数据。请确认节点已上线且存在活跃转发规则。</p>
          </CardBody>
        </Card>
      ) : (<>
        {/* Trend Chart */}
        {trend.length > 0 && (
          <Card className="border border-divider/60">
            <CardBody className="p-4">
              <p className="text-sm font-semibold mb-3">流量趋势</p>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={trend.map(t => ({
                  hour: t.hourKey.length > 10 ? t.hourKey.substring(11) + ':00' : t.hourKey,
                  upload: Math.round(t.uploadBytes / (1024 * 1024)),
                  download: Math.round(t.downloadBytes / (1024 * 1024)),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => [`${v} MB`]} />
                  <Line type="monotone" dataKey="upload" name="上传" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="download" name="下载" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Top Forwards */}
          <Card className="border border-divider/60">
            <CardBody className="p-4">
              <p className="text-sm font-semibold mb-3">转发流量排行 Top 10</p>
              {topForwards.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={topForwards.map(f => ({
                    name: f.dimensionName || `#${f.dimensionId}`,
                    value: Math.round(f.totalBytes / (1024 * 1024 * 1024) * 100) / 100,
                  }))} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => [`${v} GB`, '流量']} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-default-400 text-center py-8">暂无数据</p>}
            </CardBody>
          </Card>

          {/* Top Users */}
          <Card className="border border-divider/60">
            <CardBody className="p-4">
              <p className="text-sm font-semibold mb-3">用户流量排行 Top 10</p>
              {topUsers.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={topUsers.map(u => ({
                      name: u.dimensionName || `用户#${u.dimensionId}`,
                      value: Math.round(u.totalBytes / (1024 * 1024 * 1024) * 100) / 100,
                    }))} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      outerRadius={100} label={({ name, value }) => `${name} ${value}GB`}
                      labelLine={{ strokeWidth: 1 }}>
                      {topUsers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v} GB`, '流量']} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-default-400 text-center py-8">暂无数据</p>}
            </CardBody>
          </Card>
        </div>

        {/* Peak Hours */}
        {peakHours.length > 0 && (
          <Card className="border border-divider/60">
            <CardBody className="p-4">
              <p className="text-sm font-semibold mb-3">高峰时段分布</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={peakHours.map(h => ({
                  hour: `${String(h.hour).padStart(2, '0')}:00`,
                  value: Math.round(h.totalBytes / (1024 * 1024)),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => [`${v} MB`, '流量']} />
                  <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        )}
      </>)}
    </div>
  );
}
