import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { Select, SelectItem } from "@heroui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { AssetHost, getAssetList, getConfigs } from '@/api';
import { getRegionFlag } from '@/utils/formatters';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b', '#f97316', '#14b8a6'];

const FALLBACK_RATES: Record<string, number> = {
  CNY: 1, USD: 7.24, EUR: 7.88, GBP: 9.15, JPY: 0.048,
  HKD: 0.93, TWD: 0.22, KRW: 0.0053, RUB: 0.078, CAD: 5.28,
  AUD: 4.72, SGD: 5.42, MYR: 1.55, THB: 0.20, INR: 0.086,
  TRY: 0.19, BRL: 1.25,
};

const VIEW_CURRENCIES = [
  { key: 'CNY', symbol: '¥' }, { key: 'USD', symbol: '$' }, { key: 'EUR', symbol: '€' },
  { key: 'GBP', symbol: '£' }, { key: 'JPY', symbol: '¥' },
];

function parseCost(asset: AssetHost): number {
  if (!asset.monthlyCost) return 0;
  const v = parseFloat(asset.monthlyCost);
  return isNaN(v) ? 0 : v;
}

function toMonthlyCNY(cost: number, currency: string | null | undefined, cycle: number | null | undefined, rates: Record<string, number>): number {
  const cur = currency || 'CNY';
  const rate = rates[cur] || 1;
  let cny = cost * rate;
  if (cycle && cycle > 0 && cycle !== 30) {
    cny = (cny / cycle) * 30;
  }
  return cny;
}

export default function CostAnalysisPage() {
  const [assets, setAssets] = useState<AssetHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewCurrency, setViewCurrency] = useState('CNY');
  const [rates, setRates] = useState<Record<string, number>>(FALLBACK_RATES);
  const [ratesUpdated, setRatesUpdated] = useState<number>(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [assetRes, configRes] = await Promise.all([
          getAssetList(),
          getConfigs().catch(() => null),
        ]);
        if (assetRes.code === 0) setAssets(assetRes.data || []);
        if (configRes?.code === 0 && configRes.data?.exchange_rates) {
          try {
            setRates(JSON.parse(configRes.data.exchange_rates));
            if (configRes.data.exchange_rates_updated) setRatesUpdated(Number(configRes.data.exchange_rates_updated));
          } catch { /* use fallback */ }
        }
      } finally { setLoading(false); }
    })();
  }, []);

  const viewSymbol = VIEW_CURRENCIES.find(c => c.key === viewCurrency)?.symbol || viewCurrency;

  // Convert CNY amount to view currency
  const toView = (cny: number) => {
    const viewRate = rates[viewCurrency] || 1;
    return viewRate > 0 ? cny / viewRate : cny;
  };

  // 汇总数据
  const summary = useMemo(() => {
    let totalMonthlyCNY = 0;
    let expiringSoon = 0;
    let expired = 0;
    const costByCurrency: Record<string, number> = {};
    const now = Date.now();

    assets.forEach(a => {
      const cost = parseCost(a);
      if (cost > 0) {
        const monthly = toMonthlyCNY(cost, a.currency, a.billingCycle, rates);
        totalMonthlyCNY += monthly;
        const cur = a.currency || 'CNY';
        costByCurrency[cur] = (costByCurrency[cur] || 0) + monthly;
      }
      if (a.expireDate && a.expireDate !== -1) {
        const days = (a.expireDate - now) / 86400000;
        if (days < 0) expired++;
        else if (days <= 30) expiringSoon++;
      }
    });

    const totalView = toView(totalMonthlyCNY);
    return {
      totalMonthly: totalView.toFixed(0),
      totalAnnual: (totalView * 12).toFixed(0),
      expiringSoon, expired, totalServers: assets.length,
      avgMonthly: assets.length > 0 ? (totalView / assets.length).toFixed(1) : '0',
      currencyCount: Object.keys(costByCurrency).length,
    };
  }, [assets, viewCurrency, rates]);

  // 按地区分布
  const byRegion = useMemo(() => {
    const map: Record<string, number> = {};
    assets.forEach(a => {
      const cost = parseCost(a);
      if (cost > 0) {
        const monthly = toMonthlyCNY(cost, a.currency, a.billingCycle, rates);
        const region = a.region || '未设置';
        map[region] = (map[region] || 0) + monthly;
      }
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name: `${getRegionFlag(name)}${name}`, value: Math.round(toView(value)) }))
      .sort((a, b) => b.value - a.value);
  }, [assets, viewCurrency, rates]);

  // 按供应商分布
  const byProvider = useMemo(() => {
    const map: Record<string, number> = {};
    assets.forEach(a => {
      const cost = parseCost(a);
      if (cost > 0) {
        const monthly = toMonthlyCNY(cost, a.currency, a.billingCycle, rates);
        const provider = a.provider || '未设置';
        map[provider] = (map[provider] || 0) + monthly;
      }
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(toView(value)) }))
      .sort((a, b) => b.value - a.value);
  }, [assets, viewCurrency, rates]);

  // 到期日历（未来90天，排除永不到期）
  const expiryList = useMemo(() => {
    const now = Date.now();
    return assets
      .filter(a => a.expireDate && a.expireDate > 0 && a.expireDate !== -1)
      .map(a => ({
        ...a,
        daysLeft: Math.ceil((a.expireDate! - now) / 86400000),
        monthlyCNY: toMonthlyCNY(parseCost(a), a.currency, a.billingCycle, rates),
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .filter(a => a.daysLeft <= 90);
  }, [assets, rates]);

  // 剩余价值汇总（永不到期资产不参与计算）
  const remainingValue = useMemo(() => {
    const now = Date.now();
    let total = 0;
    assets.forEach(a => {
      if (!a.expireDate || a.expireDate === -1 || !a.monthlyCost || a.expireDate <= now) return;
      const cost = parseCost(a);
      if (cost <= 0) return;
      const daysLeft = (a.expireDate - now) / 86400000;
      const dailyCost = toMonthlyCNY(cost, a.currency, a.billingCycle, rates) / 30;
      total += dailyCost * daysLeft;
    });
    return Math.round(toView(total));
  }, [assets, viewCurrency, rates]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">成本分析</h1>
          <p className="mt-0.5 text-sm text-default-500">
            服务器资产成本概览与到期预警
            {summary.currencyCount > 1 && <span className="ml-2 text-default-400">({summary.currencyCount}种币种已折算)</span>}
          </p>
          {ratesUpdated > 0 && (
            <p className="text-[10px] text-default-300 mt-0.5">
              汇率来源: open.er-api.com · 更新于 {new Date(ratesUpdated).toLocaleDateString('zh-CN')}
            </p>
          )}
        </div>
        <Select size="sm" className="w-28" selectedKeys={[viewCurrency]}
          onSelectionChange={(keys) => setViewCurrency(Array.from(keys)[0] as string || 'CNY')}>
          {VIEW_CURRENCIES.map(c => <SelectItem key={c.key}>{c.symbol} {c.key}</SelectItem>)}
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card className="border border-divider/60"><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">月度总费用</p>
          <p className="text-xl font-bold font-mono mt-1">{viewSymbol}{summary.totalMonthly}</p>
        </CardBody></Card>
        <Card className="border border-divider/60"><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">年度预估</p>
          <p className="text-xl font-bold font-mono mt-1">{viewSymbol}{summary.totalAnnual}</p>
        </CardBody></Card>
        <Card className="border border-divider/60"><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">平均月费/台</p>
          <p className="text-xl font-bold font-mono mt-1">{viewSymbol}{summary.avgMonthly}</p>
        </CardBody></Card>
        <Card className="border border-divider/60"><CardBody className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">剩余价值</p>
          <p className="text-xl font-bold font-mono text-primary mt-1">{viewSymbol}{remainingValue}</p>
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
            <p className="text-sm font-semibold mb-3">按地区分布 ({viewSymbol}/月)</p>
            {byRegion.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byRegion} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [`${viewSymbol}${value}`, '月费']} />
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
            <p className="text-sm font-semibold mb-3">按供应商分布 ({viewSymbol}/月)</p>
            {byProvider.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={byProvider} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={100} label={({ name, value }) => `${name} ${viewSymbol}${value}`}
                    labelLine={{ strokeWidth: 1 }}>
                    {byProvider.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => [`${viewSymbol}${value}`, '月费']} />
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
