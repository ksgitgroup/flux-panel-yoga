import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { Select, SelectItem } from "@heroui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { AssetHost, getAssetList } from '@/api';
import { getRegionFlag } from '@/utils/formatters';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b', '#f97316', '#14b8a6'];

function parseCost(asset: AssetHost): number {
  if (!asset.monthlyCost) return 0;
  const v = parseFloat(asset.monthlyCost);
  return isNaN(v) ? 0 : v;
}

function toMonthlyCNY(cost: number, currency?: string | null, cycle?: number | null): number {
  // 简单汇率估算（实际应该用API，这里先硬编码）
  let cny = cost;
  if (currency === 'USD' || currency === '$') cny = cost * 7.2;
  else if (currency === 'EUR') cny = cost * 7.8;
  else if (currency === 'JPY') cny = cost * 0.048;
  // 换算为月费
  if (cycle && cycle > 0 && cycle !== 30) {
    cny = (cny / cycle) * 30;
  }
  return cny;
}

export default function CostAnalysisPage() {
  const [assets, setAssets] = useState<AssetHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewCurrency, setViewCurrency] = useState<'CNY' | 'USD'>('CNY');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await getAssetList();
        if (res.code === 0) setAssets(res.data || []);
      } finally { setLoading(false); }
    })();
  }, []);

  // 汇总数据
  const summary = useMemo(() => {
    let totalMonthly = 0;
    let totalAnnual = 0;
    let expiringSoon = 0; // 30天内到期
    let expired = 0;
    const now = Date.now();

    assets.forEach(a => {
      const cost = parseCost(a);
      if (cost > 0) {
        const monthly = toMonthlyCNY(cost, a.currency, a.billingCycle);
        totalMonthly += monthly;
      }
      if (a.expireDate) {
        const days = (a.expireDate - now) / 86400000;
        if (days < 0) expired++;
        else if (days <= 30) expiringSoon++;
      }
    });
    totalAnnual = totalMonthly * 12;

    const rate = viewCurrency === 'USD' ? 1 / 7.2 : 1;
    const symbol = viewCurrency === 'USD' ? '$' : '¥';
    return {
      totalMonthly: (totalMonthly * rate).toFixed(0),
      totalAnnual: (totalAnnual * rate).toFixed(0),
      expiringSoon, expired, totalServers: assets.length, symbol,
      avgMonthly: assets.length > 0 ? ((totalMonthly * rate) / assets.length).toFixed(1) : '0',
    };
  }, [assets, viewCurrency]);

  // 按地区分布
  const byRegion = useMemo(() => {
    const map: Record<string, number> = {};
    assets.forEach(a => {
      const cost = parseCost(a);
      if (cost > 0) {
        const monthly = toMonthlyCNY(cost, a.currency, a.billingCycle);
        const region = a.region || '未设置';
        map[region] = (map[region] || 0) + monthly;
      }
    });
    const rate = viewCurrency === 'USD' ? 1 / 7.2 : 1;
    return Object.entries(map)
      .map(([name, value]) => ({ name: `${getRegionFlag(name)}${name}`, value: Math.round(value * rate) }))
      .sort((a, b) => b.value - a.value);
  }, [assets, viewCurrency]);

  // 按供应商分布
  const byProvider = useMemo(() => {
    const map: Record<string, number> = {};
    assets.forEach(a => {
      const cost = parseCost(a);
      if (cost > 0) {
        const monthly = toMonthlyCNY(cost, a.currency, a.billingCycle);
        const provider = a.provider || '未设置';
        map[provider] = (map[provider] || 0) + monthly;
      }
    });
    const rate = viewCurrency === 'USD' ? 1 / 7.2 : 1;
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value * rate) }))
      .sort((a, b) => b.value - a.value);
  }, [assets, viewCurrency]);

  // 到期日历（未来90天）
  const expiryList = useMemo(() => {
    const now = Date.now();
    return assets
      .filter(a => a.expireDate && a.expireDate > 0)
      .map(a => ({
        ...a,
        daysLeft: Math.ceil((a.expireDate! - now) / 86400000),
        monthlyCNY: toMonthlyCNY(parseCost(a), a.currency, a.billingCycle),
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .filter(a => a.daysLeft <= 90);
  }, [assets]);

  // 剩余价值汇总
  const remainingValue = useMemo(() => {
    const now = Date.now();
    let total = 0;
    assets.forEach(a => {
      if (!a.expireDate || !a.monthlyCost || a.expireDate <= now) return;
      const cost = parseCost(a);
      if (cost <= 0) return;
      const daysLeft = (a.expireDate - now) / 86400000;
      const dailyCost = toMonthlyCNY(cost, a.currency, a.billingCycle) / 30;
      total += dailyCost * daysLeft;
    });
    const rate = viewCurrency === 'USD' ? 1 / 7.2 : 1;
    return Math.round(total * rate);
  }, [assets, viewCurrency]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">成本分析</h1>
          <p className="mt-0.5 text-sm text-default-500">服务器资产成本概览与到期预警</p>
        </div>
        <Select size="sm" className="w-24" selectedKeys={[viewCurrency]}
          onSelectionChange={(keys) => setViewCurrency(Array.from(keys)[0] as 'CNY' | 'USD')}>
          <SelectItem key="CNY">CNY</SelectItem>
          <SelectItem key="USD">USD</SelectItem>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card className="border border-divider/60"><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">月度总费用</p>
          <p className="text-xl font-bold font-mono mt-1">{summary.symbol}{summary.totalMonthly}</p>
        </CardBody></Card>
        <Card className="border border-divider/60"><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">年度预估</p>
          <p className="text-xl font-bold font-mono mt-1">{summary.symbol}{summary.totalAnnual}</p>
        </CardBody></Card>
        <Card className="border border-divider/60"><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">平均月费/台</p>
          <p className="text-xl font-bold font-mono mt-1">{summary.symbol}{summary.avgMonthly}</p>
        </CardBody></Card>
        <Card className="border border-divider/60"><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">剩余价值</p>
          <p className="text-xl font-bold font-mono text-primary mt-1">{summary.symbol}{remainingValue}</p>
        </CardBody></Card>
        <Card className={`border ${summary.expiringSoon > 0 ? 'border-warning/40 bg-warning-50/20' : 'border-divider/60'}`}><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-warning uppercase">即将到期</p>
          <p className={`text-xl font-bold font-mono mt-1 ${summary.expiringSoon > 0 ? 'text-warning' : ''}`}>{summary.expiringSoon}</p>
        </CardBody></Card>
        <Card className={`border ${summary.expired > 0 ? 'border-danger/40 bg-danger-50/20' : 'border-divider/60'}`}><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-danger uppercase">已过期</p>
          <p className={`text-xl font-bold font-mono mt-1 ${summary.expired > 0 ? 'text-danger' : ''}`}>{summary.expired}</p>
        </CardBody></Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* By Region */}
        <Card className="border border-divider/60">
          <CardBody className="p-4">
            <p className="text-sm font-semibold mb-3">按地区分布 ({summary.symbol}/月)</p>
            {byRegion.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byRegion} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [`${summary.symbol}${value}`, '月费']} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-default-400 text-center py-8">暂无成本数据</p>
            )}
          </CardBody>
        </Card>

        {/* By Provider */}
        <Card className="border border-divider/60">
          <CardBody className="p-4">
            <p className="text-sm font-semibold mb-3">按供应商分布 ({summary.symbol}/月)</p>
            {byProvider.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={byProvider} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={100} label={({ name, value }) => `${name} ${summary.symbol}${value}`}
                    labelLine={{ strokeWidth: 1 }}>
                    {byProvider.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => [`${summary.symbol}${value}`, '月费']} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-default-400 text-center py-8">暂无成本数据</p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Expiry Timeline */}
      <Card className="border border-divider/60">
        <CardBody className="p-4">
          <p className="text-sm font-semibold mb-3">到期预警 (未来90天)</p>
          {expiryList.length > 0 ? (
            <div className="space-y-1.5">
              {expiryList.map(a => (
                <div key={a.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                  a.daysLeft < 0 ? 'bg-danger-50/40 dark:bg-danger-50/10' :
                  a.daysLeft <= 7 ? 'bg-warning-50/40 dark:bg-warning-50/10' :
                  'bg-default-50/60 dark:bg-default-50/10'
                }`}>
                  <span className="w-16 flex-shrink-0 text-right font-mono font-bold">
                    {a.daysLeft < 0 ? (
                      <span className="text-danger">已过期</span>
                    ) : a.daysLeft === 0 ? (
                      <span className="text-danger">今天</span>
                    ) : (
                      <span className={a.daysLeft <= 7 ? 'text-warning' : 'text-default-600'}>{a.daysLeft}天</span>
                    )}
                  </span>
                  <span className="flex-1 font-medium truncate">
                    {getRegionFlag(a.region)}{a.name}
                  </span>
                  <span className="text-xs text-default-400 font-mono flex-shrink-0">
                    {a.expireDate ? new Date(a.expireDate).toLocaleDateString('zh-CN') : '-'}
                  </span>
                  {a.provider && <Chip size="sm" variant="flat" className="h-5 text-[10px]">{a.provider}</Chip>}
                  <span className="text-xs text-default-500 font-mono w-20 text-right flex-shrink-0">
                    {a.monthlyCost ? `${a.currency || ''}${a.monthlyCost}` : '-'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-default-400 text-center py-8">未来90天内没有到期的服务器</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
