import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Progress } from "@heroui/progress";
import { Spinner } from "@heroui/spinner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { AssetHost, getAssetList } from '@/api';
import { formatFlow, getRegionFlag, barColor } from '@/utils/formatters';

export default function TrafficAnalysisPage() {
  const [assets, setAssets] = useState<AssetHost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await getAssetList();
        if (res.code === 0) setAssets(res.data || []);
      } finally { setLoading(false); }
    })();
  }, []);

  // 有流量配额的资产
  const trafficAssets = useMemo(() => {
    return assets
      .filter(a => a.probeTrafficLimit && a.probeTrafficLimit > 0)
      .map(a => {
        const used = a.probeTrafficUsed || 0;
        const limit = a.probeTrafficLimit!;
        const pct = (used / limit) * 100;
        return { ...a, used, limit, pct };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [assets]);

  // 汇总
  const summary = useMemo(() => {
    let totalUsed = 0;
    let totalLimit = 0;
    let overUsed = 0;
    let warning = 0; // >80%
    trafficAssets.forEach(a => {
      totalUsed += a.used;
      totalLimit += a.limit;
      if (a.pct >= 100) overUsed++;
      else if (a.pct >= 80) warning++;
    });
    return {
      totalUsed, totalLimit,
      totalPct: totalLimit > 0 ? (totalUsed / totalLimit * 100) : 0,
      trackedCount: trafficAssets.length,
      overUsed, warning,
      noQuota: assets.length - trafficAssets.length,
    };
  }, [assets, trafficAssets]);

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
        used: v.used / (1024 * 1024 * 1024), // GB
        limit: v.limit / (1024 * 1024 * 1024),
        pct: v.limit > 0 ? (v.used / v.limit * 100) : 0,
      }))
      .sort((a, b) => b.used - a.used);
  }, [trafficAssets]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">流量分析</h1>
        <p className="mt-0.5 text-sm text-default-500">服务器流量使用概览与配额预警</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
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

      {/* Region Traffic Distribution */}
      {byRegion.length > 0 && (
        <Card className="border border-divider/60">
          <CardBody className="p-4">
            <p className="text-sm font-semibold mb-3">按地区流量分布 (GB)</p>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={byRegion} margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [`${Number(value).toFixed(1)} GB`]} />
                <Bar dataKey="used" name="已用" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="limit" name="配额" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
    </div>
  );
}
