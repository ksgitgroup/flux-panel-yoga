import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from 'react-hot-toast';
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Progress } from "@heroui/progress";
import { Spinner } from "@heroui/spinner";
import {
  AssetHost,
  getAssetList,
  getConfigs,
  getDiagnosisRuntimeStatus,
  getDiagnosisSummary,
  getMonitorList,
  getNodeList,
  getUserPackageInfo,
  MonitorInstance,
  getRecentAlertLogs,
} from "@/api";
import { formatFlow, formatRelativeTime, getRegionFlag, barColor } from '@/utils/formatters';
import { siteConfig } from "@/config/site";
import HealthGauge from "@/components/HealthGauge";

interface UserInfo {
  flow: number;
  inFlow: number;
  outFlow: number;
  num: number;
}

interface DiagnosisSummary {
  totalCount: number;
  successCount: number;
  failCount: number;
  healthRate: number;
  avgLatency?: number;
  lastRunTime?: number;
  recentFailures: { id: number; targetType: string; targetName: string; averageTime?: number; packetLoss?: number; createdTime: number }[];
}

interface DiagnosisRuntimeStatus {
  running: boolean;
  totalCount: number;
  completedCount: number;
  progressPercent: number;
  currentTargetName?: string;
}

interface DashboardNode {
  id: number;
  name: string;
  status: number;
}

const normalizeSummary = (data: any): DiagnosisSummary => ({
  totalCount: Number(data?.totalCount ?? 0),
  successCount: Number(data?.successCount ?? 0),
  failCount: Number(data?.failCount ?? 0),
  healthRate: Number(data?.healthRate ?? 100),
  avgLatency: data?.avgLatency ?? undefined,
  lastRunTime: data?.lastRunTime ?? undefined,
  recentFailures: Array.isArray(data?.recentFailures) ? data.recentFailures : [],
});

const normalizeRuntime = (data: any): DiagnosisRuntimeStatus => ({
  running: Boolean(data?.running),
  totalCount: Number(data?.totalCount ?? 0),
  completedCount: Number(data?.completedCount ?? 0),
  progressPercent: Number(data?.progressPercent ?? 0),
  currentTargetName: data?.currentTargetName ?? undefined,
});

/* ─── Infrastructure metric cell ─── */
const InfraCell = ({ label, value, suffix, color, subtext, onClick }: {
  label: string; value: string; suffix?: string; color: string; subtext?: string; onClick?: () => void;
}) => (
  <div
    className={`rounded-2xl border border-default-200 bg-white/80 dark:bg-black/20 px-4 py-3 transition-shadow hover:shadow-md${onClick ? ' cursor-pointer' : ''}`}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
  >
    <p className="text-[10px] font-bold uppercase tracking-widest text-default-400">{label}</p>
    <p className="mt-1.5 flex items-baseline gap-1">
      <span className={`text-2xl font-extrabold font-mono ${color}`}>{value}</span>
      {suffix && <span className="text-sm font-semibold text-default-400">{suffix}</span>}
    </p>
    {subtext && <p className="mt-0.5 text-[11px] text-default-500">{subtext}</p>}
  </div>
);

export default function DashboardPage() {
  const navigate = useNavigate();
  const admin = localStorage.getItem('admin') === 'true';
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo>({} as UserInfo);
  const [forwardCount, setForwardCount] = useState(0);
  const [tunnelCount, setTunnelCount] = useState(0);
  const [summary, setSummary] = useState<DiagnosisSummary | null>(null);
  const [runtime, setRuntime] = useState<DiagnosisRuntimeStatus | null>(null);
  const [nodes, setNodes] = useState<DashboardNode[]>([]);
  const [probeInstances, setProbeInstances] = useState<MonitorInstance[]>([]);
  const [assets, setAssets] = useState<AssetHost[]>([]);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({
    CNY: 1, USD: 7.24, EUR: 7.88, GBP: 9.15, JPY: 0.048,
    HKD: 0.93, TWD: 0.22, KRW: 0.0053, RUB: 0.078, CAD: 5.28,
    AUD: 4.72, SGD: 5.42, MYR: 1.55, THB: 0.20, INR: 0.086,
    TRY: 0.19, BRL: 1.25,
  });

  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);

  const loadHome = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    // 加载最近告警（独立于主数据，不阻塞）
    getRecentAlertLogs(8).then(res => {
      if (res.code === 0 && res.data) setRecentAlerts(Array.isArray(res.data) ? res.data : []);
    }).catch(() => {});
    try {
      const promises: Promise<any>[] = [
        getUserPackageInfo(),
        getDiagnosisSummary().catch(() => null),
        getDiagnosisRuntimeStatus().catch(() => null),
      ];
      if (admin) {
        promises.push(getNodeList().catch(() => null));
        promises.push(getMonitorList().catch(() => null));
        promises.push(getAssetList().catch(() => null));
        promises.push(getConfigs().catch(() => null));
      }
      const [packageResp, summaryResp, runtimeResp, nodeResp, monitorResp, assetResp, configResp] = await Promise.all(promises);

      if (packageResp.code !== 0) {
        if (!silent) toast.error(packageResp.msg || '加载失败');
        return;
      }

      const pkg = packageResp.data || {};
      setUserInfo(pkg.userInfo || ({} as UserInfo));
      setForwardCount(Array.isArray(pkg.forwards) ? pkg.forwards.length : 0);
      setTunnelCount(Array.isArray(pkg.tunnelPermissions) ? pkg.tunnelPermissions.length : 0);

      if (summaryResp?.code === 0) setSummary(normalizeSummary(summaryResp.data));
      if (runtimeResp?.code === 0) setRuntime(normalizeRuntime(runtimeResp.data));
      if (admin && nodeResp?.code === 0) setNodes(Array.isArray(nodeResp.data) ? nodeResp.data : []);
      if (admin && monitorResp?.code === 0) setProbeInstances(Array.isArray(monitorResp.data) ? monitorResp.data : []);
      if (admin && assetResp?.code === 0) setAssets(Array.isArray(assetResp.data) ? assetResp.data : []);
      if (admin && configResp?.code === 0 && configResp.data?.exchange_rates) {
        try { setExchangeRates(JSON.parse(configResp.data.exchange_rates)); } catch { /* use fallback */ }
      }
    } catch {
      if (!silent) toast.error('加载首页失败');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [admin]);

  useEffect(() => { void loadHome(); }, [loadHome]);
  useEffect(() => {
    const interval = window.setInterval(() => void loadHome(true), runtime?.running ? 5000 : 120000);
    return () => window.clearInterval(interval);
  }, [loadHome, runtime?.running]);

  // Computed
  const onlineNodes = useMemo(() => nodes.filter(n => n.status === 1).length, [nodes]);
  const probeSummary = useMemo(() => {
    const total = probeInstances.reduce((s, i) => s + (i.nodeCount || 0), 0);
    const online = probeInstances.reduce((s, i) => s + (i.onlineNodeCount || 0), 0);
    return { total, online, instances: probeInstances.length };
  }, [probeInstances]);

  const usedFlow = useMemo(() => (userInfo.inFlow || 0) + (userInfo.outFlow || 0), [userInfo]);
  const flowPct = useMemo(() => {
    if (!userInfo.flow || userInfo.flow === 99999) return 0;
    return Math.min((usedFlow / (userInfo.flow * 1024 * 1024 * 1024)) * 100, 100);
  }, [usedFlow, userInfo.flow]);

  // Asset stats
  const assetStats = useMemo(() => {
    const now = Date.now();
    let expiringSoon = 0, expired = 0, totalMonthlyCNY = 0;
    const costByCurrency: Record<string, number> = {};
    const regionMap: Record<string, number> = {};
    const osMap: Record<string, number> = {};
    const providerMap: Record<string, number> = {};
    const offlineAssets: AssetHost[] = [];
    const rates = exchangeRates;
    assets.forEach(a => {
      if (a.expireDate && a.expireDate !== -1) {
        const days = (a.expireDate - now) / 86400000;
        if (days < 0) expired++;
        else if (days <= 30) expiringSoon++;
      }
      const region = a.region || '未设置';
      regionMap[region] = (regionMap[region] || 0) + 1;
      const os = a.osCategory || a.os || '未知';
      osMap[os] = (osMap[os] || 0) + 1;
      const provider = a.provider || '未设置';
      providerMap[provider] = (providerMap[provider] || 0) + 1;
      if ((a.monitorNodeUuid || a.pikaNodeId) && a.monitorOnline !== 1) {
        offlineAssets.push(a);
      }
      if (a.monthlyCost && a.billingCycle && a.billingCycle > 0) {
        const v = parseFloat(a.monthlyCost);
        if (!isNaN(v) && v > 0) {
          const monthlyEquiv = (v / a.billingCycle) * 30; // normalize to monthly
          const cur = a.currency || 'CNY';
          costByCurrency[cur] = (costByCurrency[cur] || 0) + monthlyEquiv;
          const rate = rates[cur] || 1;
          totalMonthlyCNY += monthlyEquiv * rate;
        }
      }
    });
    const topRegions = Object.entries(regionMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    const topOs = Object.entries(osMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6);
    const topProviders = Object.entries(providerMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6);
    return { total: assets.length, expiringSoon, expired, totalMonthlyCNY, costByCurrency, topRegions, topOs, topProviders, offlineAssets };
  }, [assets, exchangeRates]);

  // Traffic warning assets
  const trafficWarnings = useMemo(() =>
    assets
      .filter(a => a.probeTrafficLimit && a.probeTrafficLimit > 0 && a.probeTrafficUsed)
      .map(a => ({ ...a, pct: ((a.probeTrafficUsed || 0) / a.probeTrafficLimit!) * 100 }))
      .filter(a => a.pct >= 80)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5),
    [assets]
  );

  const healthRate = summary?.healthRate ?? 100;

  // Compute an overall composite score for the health gauge
  const overallScore = useMemo(() => {
    if (!admin || assets.length === 0) return healthRate;
    // Weighted: 40% diagnosis health, 30% probe online, 20% no-expiry, 10% completeness
    const probeTotal = Math.max(probeSummary.total, 1);
    const probeOnlineRate = (probeSummary.online / probeTotal) * 100;
    const noExpiredRate = assets.length > 0 ? ((assets.length - assetStats.expired) / assets.length) * 100 : 100;
    const probeBindRate = assets.length > 0 ? ((assets.length - assets.filter(a => !a.monitorNodeUuid && !a.pikaNodeId).length) / assets.length) * 100 : 100;
    return Math.max(0, Math.min(100, healthRate * 0.4 + probeOnlineRate * 0.3 + noExpiredRate * 0.2 + probeBindRate * 0.1));
  }, [admin, healthRate, probeSummary, assetStats, assets]);

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* ═══════════════════════ Hero Header ═══════════════════════ */}
      <Card className="overflow-hidden border border-default-200 shadow-sm bg-[radial-gradient(ellipse_at_top_left,rgba(37,99,235,0.08),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(16,185,129,0.06),transparent_50%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(37,99,235,0.15),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(16,185,129,0.1),transparent_50%)]">
        <CardBody className="p-5 lg:p-6">
          {/* Diagnosis running banner */}
          {runtime?.running && (
            <div className="mb-4 flex items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
              <Spinner size="sm" color="primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">诊断执行中 · {runtime.completedCount}/{runtime.totalCount}</p>
                {runtime.currentTargetName && <p className="text-xs text-default-500 truncate">正在诊断: {runtime.currentTargetName}</p>}
              </div>
              <Progress size="sm" value={runtime.progressPercent} color="primary" className="w-20 sm:w-32" />
              <Link to="/monitor" className="text-xs text-primary font-semibold hover:underline flex-shrink-0">查看详情</Link>
            </div>
          )}

          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            {/* Left: Health Gauge */}
            <div className="flex flex-col items-center gap-1 md:mr-2">
              <HealthGauge
                score={overallScore}
                size={admin ? 140 : 120}
                strokeWidth={10}
                sublabel={summary?.lastRunTime ? formatRelativeTime(summary.lastRunTime) : undefined}
                onClick={() => navigate('/monitor')}
              />
            </div>

            {/* Right: Info cards grid (like Sub2API 3x2) */}
            <div className="flex-1 grid gap-3 grid-cols-2 lg:grid-cols-3">
              {/* Diagnosis health */}
              <InfraCell
                label="诊断健康率"
                value={healthRate.toFixed(1)}
                suffix="%"
                color={summary?.failCount ? 'text-warning' : 'text-success'}
                subtext={summary?.failCount ? `${summary.failCount} 个异常` : '全部通过'}
                onClick={() => navigate('/monitor')}
              />

              {/* Forwards / Tunnels */}
              <InfraCell
                label="转发 / 隧道"
                value={`${forwardCount}`}
                suffix={`/ ${tunnelCount}`}
                color="text-foreground"
                subtext={`${summary?.totalCount ?? 0} 个纳入诊断`}
                onClick={() => navigate('/forward')}
              />

              {/* Probe / Node online */}
              {admin && (
                <InfraCell
                  label={probeSummary.total > 0 ? '探针节点' : 'GOST 节点'}
                  value={probeSummary.total > 0 ? `${probeSummary.online}` : `${onlineNodes}`}
                  suffix={`/ ${probeSummary.total > 0 ? probeSummary.total : nodes.length}`}
                  color={(() => {
                    const online = probeSummary.total > 0 ? probeSummary.online : onlineNodes;
                    const total = probeSummary.total > 0 ? probeSummary.total : nodes.length;
                    return online === total && total > 0 ? 'text-success' : 'text-warning';
                  })()}
                  subtext={probeSummary.total > 0 ? `${probeSummary.instances} 个实例` : '节点在线状态'}
                  onClick={() => navigate(probeSummary.total > 0 ? '/probe' : '/node')}
                />
              )}

              {/* Server assets */}
              {admin && assets.length > 0 && (
                <InfraCell
                  label="服务器资产"
                  value={`${assetStats.total}`}
                  suffix="台"
                  color="text-foreground"
                  subtext={[
                    assetStats.expired > 0 ? `${assetStats.expired} 已过期` : '',
                    assetStats.expiringSoon > 0 ? `${assetStats.expiringSoon} 即将到期` : '',
                    assetStats.expired === 0 && assetStats.expiringSoon === 0 ? `${assetStats.topRegions.length} 个地区` : '',
                  ].filter(Boolean).join(' · ')}
                  onClick={() => navigate('/assets')}
                />
              )}

              {/* Monthly cost (converted to CNY) */}
              {admin && assetStats.totalMonthlyCNY > 0 && (
                <InfraCell
                  label="月度成本"
                  value={`¥${assetStats.totalMonthlyCNY.toFixed(0)}`}
                  color="text-foreground"
                  subtext={Object.keys(assetStats.costByCurrency).length > 1
                    ? `${Object.keys(assetStats.costByCurrency).length}种币 · 均¥${assetStats.total > 0 ? (assetStats.totalMonthlyCNY / assetStats.total).toFixed(0) : 0}/台`
                    : `均 ¥${assetStats.total > 0 ? (assetStats.totalMonthlyCNY / assetStats.total).toFixed(0) : 0}/台`}
                  onClick={() => navigate('/cost')}
                />
              )}

              {/* Flow usage (non-admin) */}
              {!admin && (
                <InfraCell
                  label="流量使用"
                  value={userInfo.flow === 99999 ? '不限' : `${flowPct.toFixed(1)}%`}
                  color={flowPct >= 80 ? 'text-danger' : flowPct >= 60 ? 'text-warning' : 'text-foreground'}
                  subtext={`${formatFlow(usedFlow)} / ${userInfo.flow === 99999 ? '无限制' : `${userInfo.flow || 0} GB`}`}
                />
              )}

              {/* Version */}
              <InfraCell
                label="版本"
                value={siteConfig.release_version}
                color="text-foreground"
                subtext={`${siteConfig.environment_name} · ${siteConfig.build_revision}`}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ═══════════════════════ Infrastructure Status Row ═══════════════════════ */}
      {admin && assets.length > 0 && (
        <div className="grid gap-3 grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-default-200 bg-white/80 dark:bg-black/20 px-3 py-2.5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-default-400">在线率</p>
            <p className={`text-xl font-extrabold font-mono mt-1 ${
              probeSummary.total > 0
                ? (probeSummary.online === probeSummary.total ? 'text-success' : 'text-warning')
                : 'text-default-400'
            }`}>
              {probeSummary.total > 0 ? `${((probeSummary.online / probeSummary.total) * 100).toFixed(0)}%` : '-'}
            </p>
          </div>
          <div className="rounded-2xl border border-default-200 bg-white/80 dark:bg-black/20 px-3 py-2.5 text-center cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/alert')}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-default-400">活跃告警</p>
            <p className={`text-xl font-extrabold font-mono mt-1 ${assetStats.offlineAssets.length > 0 || (summary?.failCount || 0) > 0 ? 'text-danger' : 'text-success'}`}>
              {assetStats.offlineAssets.length + (summary?.failCount || 0)}
            </p>
          </div>
          <div className="rounded-2xl border border-default-200 bg-white/80 dark:bg-black/20 px-3 py-2.5 text-center cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/traffic')}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-default-400">流量预警</p>
            <p className={`text-xl font-extrabold font-mono mt-1 ${trafficWarnings.length > 0 ? 'text-warning' : 'text-success'}`}>
              {trafficWarnings.length}
            </p>
          </div>
          <div className="rounded-2xl border border-default-200 bg-white/80 dark:bg-black/20 px-3 py-2.5 text-center cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/cost')}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-default-400">即将到期</p>
            <p className={`text-xl font-extrabold font-mono mt-1 ${assetStats.expiringSoon > 0 ? 'text-warning' : assetStats.expired > 0 ? 'text-danger' : 'text-success'}`}>
              {assetStats.expiringSoon + assetStats.expired}
            </p>
          </div>
          <div className="rounded-2xl border border-default-200 bg-white/80 dark:bg-black/20 px-3 py-2.5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-default-400">延迟均值</p>
            <p className={`text-xl font-extrabold font-mono mt-1 ${
              summary?.avgLatency ? (summary.avgLatency > 150 ? 'text-danger' : summary.avgLatency > 80 ? 'text-warning' : 'text-success') : 'text-default-400'
            }`}>
              {summary?.avgLatency ? `${summary.avgLatency.toFixed(0)}ms` : '-'}
            </p>
          </div>
          <div className="rounded-2xl border border-default-200 bg-white/80 dark:bg-black/20 px-3 py-2.5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-default-400">探针覆盖</p>
            <p className={`text-xl font-extrabold font-mono mt-1 ${
              assets.filter(a => !a.monitorNodeUuid && !a.pikaNodeId).length > 0 ? 'text-warning' : 'text-success'
            }`}>
              {assets.length > 0 ? `${((1 - assets.filter(a => !a.monitorNodeUuid && !a.pikaNodeId).length / assets.length) * 100).toFixed(0)}%` : '-'}
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════ Main Content ═══════════════════════ */}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Left column */}
        <div className="space-y-4">
          {/* Failures & offline */}
          <Card className="border border-divider/60">
            <CardBody className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">异常资源</p>
                <Link to="/monitor" className="text-xs text-primary font-medium hover:underline">诊断看板</Link>
              </div>
              {(summary?.recentFailures?.length || assetStats.offlineAssets.length > 0) ? (
                <div className="space-y-2">
                  {admin && assetStats.offlineAssets.slice(0, 5).map(a => (
                    <div key={`offline-${a.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-danger-50/40 dark:bg-danger-50/10 text-sm cursor-pointer hover:bg-danger-50/60 transition-colors" onClick={() => navigate(`/assets?viewId=${a.id}`)}>
                      <Chip size="sm" variant="flat" color="danger" className="h-5 text-[10px]">服务器</Chip>
                      <span className="flex-1 font-medium truncate">{getRegionFlag(a.region)}{a.name}</span>
                      <span className="text-xs text-default-500 font-mono">{a.primaryIp}</span>
                      <span className="text-[11px] text-danger font-semibold">离线</span>
                    </div>
                  ))}
                  {summary?.recentFailures?.slice(0, 5).map(r => (
                    <div key={r.id} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-danger-50/40 dark:bg-danger-50/10 text-sm">
                      <Chip size="sm" variant="flat" color="danger" className="h-5 text-[10px]">
                        {r.targetType === 'tunnel' ? '隧道' : '转发'}
                      </Chip>
                      <span className="flex-1 font-medium truncate">{r.targetName}</span>
                      {r.averageTime != null && <span className="text-xs text-default-500 font-mono">{r.averageTime}ms</span>}
                      {r.packetLoss != null && <span className="text-xs text-danger font-mono">{r.packetLoss}%丢包</span>}
                      <span className="text-[11px] text-default-400">{formatRelativeTime(r.createdTime)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 text-sm text-success">
                  <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  当前没有异常资源
                </div>
              )}
            </CardBody>
          </Card>

          {/* Recent alerts */}
          {admin && recentAlerts.length > 0 && (
            <Card className="border border-divider/60">
              <CardBody className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold">最近告警</p>
                  <div className="flex gap-2">
                    <Link to="/notification" className="text-xs text-primary font-medium hover:underline">通知中心</Link>
                    <Link to="/alert" className="text-xs text-primary font-medium hover:underline">告警配置</Link>
                  </div>
                </div>
                <div className="space-y-1">
                  {recentAlerts.slice(0, 5).map((log: any) => (
                    <div key={log.id} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${
                      log.message?.includes('[CRITICAL]') ? 'bg-danger-50/40 dark:bg-danger-50/10' :
                      log.message?.includes('[WARNING]') ? 'bg-warning-50/40 dark:bg-warning-50/10' :
                      'bg-default-50'
                    }`}>
                      <Chip size="sm" variant="flat" className="h-4 text-[9px] flex-shrink-0"
                        color={log.message?.includes('[CRITICAL]') ? 'danger' : log.message?.includes('[WARNING]') ? 'warning' : 'primary'}>
                        {log.message?.includes('[CRITICAL]') ? '严重' : log.message?.includes('[WARNING]') ? '警告' : '提示'}
                      </Chip>
                      <span className="flex-1 truncate text-xs">{log.message}</span>
                      <span className="text-[10px] text-default-400 flex-shrink-0">
                        {log.createdTime ? new Date(log.createdTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Traffic warnings */}
          {admin && trafficWarnings.length > 0 && (
            <Card className="border border-warning/30">
              <CardBody className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold">流量预警</p>
                  <Link to="/traffic" className="text-xs text-primary font-medium hover:underline">流量分析</Link>
                </div>
                <div className="space-y-2">
                  {trafficWarnings.map(a => (
                    <div key={a.id} className="flex items-center gap-3 text-sm">
                      <span className="w-32 truncate font-medium">{getRegionFlag(a.region)}{a.name}</span>
                      <Progress size="sm" value={Math.min(a.pct, 100)} color={a.pct >= 100 ? 'danger' : 'warning'} className="flex-1" />
                      <span className="text-xs font-mono text-default-500 w-24 text-right">
                        {formatFlow(a.probeTrafficUsed || 0)} / {formatFlow(a.probeTrafficLimit || 0)}
                      </span>
                      <span className={`text-xs font-bold font-mono w-12 text-right ${a.pct >= 100 ? 'text-danger' : 'text-warning'}`}>
                        {a.pct.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {/* ═══════════ Distribution cards (3-column compact) ═══════════ */}
          {admin && (assetStats.topRegions.length > 0 || assetStats.topOs.length > 1 || assetStats.topProviders.length > 1) && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {/* Region */}
              {assetStats.topRegions.length > 0 && (
                <Card className="border border-divider/60">
                  <CardBody className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold">地区分布</p>
                      <Link to="/assets" className="text-xs text-primary font-medium hover:underline">全部</Link>
                    </div>
                    <div className="space-y-1.5">
                      {assetStats.topRegions.map(([region, count]) => (
                        <div key={region} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-default-100 rounded-lg px-1 -mx-1 transition-colors" onClick={() => navigate(`/assets?filterRegion=${encodeURIComponent(region)}`)}>
                          <span className="w-24 truncate text-xs">{getRegionFlag(region)}{region}</span>
                          <Progress size="sm" value={(count / assetStats.total) * 100} color="primary" className="flex-1" />
                          <span className="text-xs font-mono text-default-500 w-6 text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* OS */}
              {assetStats.topOs.length > 1 && (
                <Card className="border border-divider/60">
                  <CardBody className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold">操作系统</p>
                      <Link to="/assets" className="text-xs text-primary font-medium hover:underline">全部</Link>
                    </div>
                    <div className="space-y-1.5">
                      {assetStats.topOs.map(([os, count]) => (
                        <div key={os} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-default-100 rounded-lg px-1 -mx-1 transition-colors" onClick={() => navigate(`/assets?filterOs=${encodeURIComponent(os)}`)}>
                          <span className="w-24 truncate text-xs">{os}</span>
                          <Progress size="sm" value={(count / assetStats.total) * 100} color="secondary" className="flex-1" />
                          <span className="text-xs font-mono text-default-500 w-6 text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* Provider */}
              {assetStats.topProviders.length > 1 && (
                <Card className="border border-divider/60">
                  <CardBody className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold">厂商分布</p>
                      <Link to="/assets" className="text-xs text-primary font-medium hover:underline">全部</Link>
                    </div>
                    <div className="space-y-1.5">
                      {assetStats.topProviders.map(([provider, count]) => (
                        <div key={provider} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-default-100 rounded-lg px-1 -mx-1 transition-colors" onClick={() => navigate(`/assets?filterProvider=${encodeURIComponent(provider)}`)}>
                          <span className="w-24 truncate text-xs">{provider}</span>
                          <Progress size="sm" value={(count / assetStats.total) * 100} color="warning" className="flex-1" />
                          <span className="text-xs font-mono text-default-500 w-6 text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Quick nav */}
          <Card className="border border-divider/60">
            <CardBody className="p-4">
              <p className="text-sm font-semibold mb-3">快捷导航</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { to: '/forward', label: '转发管理', count: forwardCount, color: 'primary' as const },
                  { to: '/tunnel', label: '隧道管理', count: tunnelCount, color: 'secondary' as const },
                  ...(admin ? [
                    { to: '/server-dashboard', label: '服务器看板', count: probeSummary.total || nodes.length, color: 'success' as const },
                    { to: '/monitor', label: '诊断看板', count: summary?.totalCount ?? 0, color: 'warning' as const },
                    { to: '/assets', label: '服务器资产', count: assetStats.total, color: 'primary' as const },
                    { to: '/node', label: 'GOST 节点', count: nodes.length, color: 'success' as const },
                    { to: '/cost', label: '成本分析', count: null, color: 'warning' as const },
                    { to: '/traffic', label: '流量分析', count: null, color: 'secondary' as const },
                  ] : [
                    { to: '/profile', label: '个人中心', count: null, color: 'secondary' as const },
                  ]),
                ].map(item => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="flex items-center gap-2 rounded-xl border border-divider/60 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-default-100 dark:hover:bg-default-100/10"
                  >
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.count != null && (
                      <Chip size="sm" variant="flat" color={item.color} className="h-5 text-[10px] min-w-[24px]">{item.count}</Chip>
                    )}
                  </Link>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Probe instances */}
          {admin && probeInstances.length > 0 && (
            <Card className="border border-divider/60">
              <CardBody className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold">探针实例</p>
                  <Link to="/probe" className="text-xs text-primary font-medium hover:underline">探针配置</Link>
                </div>
                <div className="space-y-2">
                  {probeInstances.map(inst => (
                    <div key={inst.id} className="flex items-center gap-2 text-sm">
                      <Chip size="sm" variant="dot" color={inst.onlineNodeCount === inst.nodeCount ? 'success' : 'warning'} className="h-5 text-[10px]">
                        {inst.type || 'probe'}
                      </Chip>
                      <span className="flex-1 truncate font-medium">{inst.name}</span>
                      <span className="text-xs font-mono text-default-500">
                        {inst.onlineNodeCount}/{inst.nodeCount}
                      </span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Non-admin flow card */}
          {!admin && (
            <Card className="border border-divider/60">
              <CardBody className="p-4">
                <p className="text-sm font-semibold mb-3">套餐信息</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-default-500">已用流量</span>
                    <span className="font-mono">{formatFlow(usedFlow)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-default-500">总额度</span>
                    <span className="font-mono">{userInfo.flow === 99999 ? '无限制' : `${userInfo.flow || 0} GB`}</span>
                  </div>
                  {userInfo.flow !== 99999 && <Progress size="sm" value={flowPct} color={barColor(flowPct)} />}
                  <div className="flex justify-between">
                    <span className="text-default-500">转发数</span>
                    <span className="font-mono">{forwardCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-default-500">隧道数</span>
                    <span className="font-mono">{tunnelCount}</span>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Expiring soon */}
          {admin && assetStats.expiringSoon > 0 && (
            <Card className="border border-warning/30">
              <CardBody className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-warning">即将到期</p>
                  <Link to="/cost" className="text-xs text-primary font-medium hover:underline">成本分析</Link>
                </div>
                <div className="space-y-1.5">
                  {assets
                    .filter(a => a.expireDate && (a.expireDate - Date.now()) / 86400000 <= 30 && (a.expireDate - Date.now()) / 86400000 >= 0)
                    .sort((a, b) => (a.expireDate || 0) - (b.expireDate || 0))
                    .slice(0, 5)
                    .map(a => {
                      const days = Math.ceil(((a.expireDate || 0) - Date.now()) / 86400000);
                      return (
                        <div key={a.id} className="flex items-center gap-2 text-sm">
                          <span className={`w-10 text-right font-mono font-bold ${days <= 7 ? 'text-danger' : 'text-warning'}`}>{days}天</span>
                          <span className="flex-1 truncate">{getRegionFlag(a.region)}{a.name}</span>
                          {a.provider && <span className="text-[11px] text-default-400">{a.provider}</span>}
                        </div>
                      );
                    })}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
