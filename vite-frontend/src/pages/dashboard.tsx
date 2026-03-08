import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from 'react-hot-toast';
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Progress } from "@heroui/progress";
import { Spinner } from "@heroui/spinner";
import {
  AssetHost,
  getAssetList,
  getDiagnosisRuntimeStatus,
  getDiagnosisSummary,
  getMonitorList,
  getNodeList,
  getUserPackageInfo,
  MonitorInstance,
} from "@/api";
import { formatFlow, formatRelativeTime, getRegionFlag, barColor } from '@/utils/formatters';
import { siteConfig } from "@/config/site";

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

export default function DashboardPage() {
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

  const loadHome = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
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
      }
      const [packageResp, summaryResp, runtimeResp, nodeResp, monitorResp, assetResp] = await Promise.all(promises);

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
    } catch {
      if (!silent) toast.error('加载首页失败');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [admin]);

  useEffect(() => { void loadHome(); }, [loadHome]);
  useEffect(() => {
    const interval = window.setInterval(() => void loadHome(true), runtime?.running ? 2500 : 60000);
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
    let expiringSoon = 0, expired = 0, totalMonthly = 0;
    const regionMap: Record<string, number> = {};
    assets.forEach(a => {
      if (a.expireDate) {
        const days = (a.expireDate - now) / 86400000;
        if (days < 0) expired++;
        else if (days <= 30) expiringSoon++;
      }
      const region = a.region || '未设置';
      regionMap[region] = (regionMap[region] || 0) + 1;
      if (a.monthlyCost) {
        const v = parseFloat(a.monthlyCost);
        if (!isNaN(v)) totalMonthly += v;
      }
    });
    // Top 5 regions
    const topRegions = Object.entries(regionMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    return { total: assets.length, expiringSoon, expired, totalMonthly, topRegions };
  }, [assets]);

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

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Diagnosis running banner */}
      {runtime?.running && (
        <Card className="border border-primary/30 bg-primary-50/30 dark:bg-primary-900/10">
          <CardBody className="flex flex-row items-center gap-4 p-3">
            <Spinner size="sm" color="primary" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">诊断执行中 · {runtime.completedCount}/{runtime.totalCount}</p>
              {runtime.currentTargetName && <p className="text-xs text-default-500 truncate">正在诊断: {runtime.currentTargetName}</p>}
            </div>
            <Progress size="sm" value={runtime.progressPercent} color="primary" className="w-32" />
            <Link to="/monitor" className="text-xs text-primary font-semibold hover:underline flex-shrink-0">查看详情</Link>
          </CardBody>
        </Card>
      )}

      {/* Key metrics row */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {/* Health */}
        <Card className={`border ${summary?.failCount ? 'border-warning/40 bg-warning-50/20' : 'border-success/30 bg-success-50/20'}`}>
          <CardBody className="p-3">
            <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">诊断健康率</p>
            <p className={`text-2xl font-bold font-mono mt-1 ${summary?.failCount ? 'text-warning' : 'text-success'}`}>{healthRate.toFixed(1)}%</p>
            <p className="text-[11px] text-default-500 mt-0.5">
              {summary?.failCount ? `${summary.failCount} 个异常` : '系统稳定'}
              {summary?.lastRunTime ? ` · ${formatRelativeTime(summary.lastRunTime)}` : ''}
            </p>
          </CardBody>
        </Card>

        {/* Forwards & Tunnels */}
        <Card className="border border-divider/60">
          <CardBody className="p-3">
            <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">转发 / 隧道</p>
            <p className="text-2xl font-bold font-mono mt-1">{forwardCount} <span className="text-sm text-default-400">/</span> {tunnelCount}</p>
            <p className="text-[11px] text-default-500 mt-0.5">
              {summary?.totalCount ?? 0} 个纳入诊断
            </p>
          </CardBody>
        </Card>

        {/* Nodes */}
        {admin && (
          <Card className="border border-divider/60">
            <CardBody className="p-3">
              <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">
                {probeSummary.total > 0 ? '探针节点' : 'GOST 节点'}
              </p>
              <p className="text-2xl font-bold font-mono mt-1">
                {probeSummary.total > 0
                  ? <><span className="text-success">{probeSummary.online}</span> <span className="text-sm text-default-400">/</span> {probeSummary.total}</>
                  : <><span className={onlineNodes === nodes.length && nodes.length > 0 ? 'text-success' : 'text-warning'}>{onlineNodes}</span> <span className="text-sm text-default-400">/</span> {nodes.length}</>
                }
              </p>
              <p className="text-[11px] text-default-500 mt-0.5">
                {probeSummary.total > 0 ? `${probeSummary.instances} 个探针实例` : '节点在线状态'}
              </p>
            </CardBody>
          </Card>
        )}

        {/* Flow usage (non-admin) */}
        {!admin && (
          <Card className="border border-divider/60">
            <CardBody className="p-3">
              <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">流量使用</p>
              <p className="text-2xl font-bold font-mono mt-1">
                {userInfo.flow === 99999 ? '不限' : `${flowPct.toFixed(1)}%`}
              </p>
              <p className="text-[11px] text-default-500 mt-0.5">{formatFlow(usedFlow)} / {userInfo.flow === 99999 ? '无限制' : `${userInfo.flow || 0} GB`}</p>
              {userInfo.flow !== 99999 && <Progress size="sm" value={flowPct} color={barColor(flowPct)} className="mt-1.5" />}
            </CardBody>
          </Card>
        )}

        {/* Assets */}
        {admin && assets.length > 0 && (
          <Card className="border border-divider/60">
            <CardBody className="p-3">
              <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">服务器资产</p>
              <p className="text-2xl font-bold font-mono mt-1">{assetStats.total}</p>
              <p className="text-[11px] text-default-500 mt-0.5">
                {assetStats.expiringSoon > 0 && <span className="text-warning">{assetStats.expiringSoon} 即将到期 · </span>}
                {assetStats.expired > 0 && <span className="text-danger">{assetStats.expired} 已过期 · </span>}
                {assetStats.topRegions.length > 0 && `${assetStats.topRegions.length} 个地区`}
              </p>
            </CardBody>
          </Card>
        )}

        {/* Monthly cost */}
        {admin && assetStats.totalMonthly > 0 && (
          <Card className="border border-divider/60">
            <CardBody className="p-3">
              <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">月度成本</p>
              <p className="text-2xl font-bold font-mono mt-1">¥{assetStats.totalMonthly.toFixed(0)}</p>
              <p className="text-[11px] text-default-500 mt-0.5">
                平均 ¥{assetStats.total > 0 ? (assetStats.totalMonthly / assetStats.total).toFixed(0) : 0}/台
              </p>
            </CardBody>
          </Card>
        )}

        {/* Version */}
        <Card className="border border-divider/60">
          <CardBody className="p-3">
            <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">版本</p>
            <p className="text-lg font-bold mt-1">{siteConfig.release_version}</p>
            <p className="text-[11px] text-default-500 mt-0.5">{siteConfig.environment_name} · {siteConfig.build_revision}</p>
          </CardBody>
        </Card>
      </div>

      {/* Main content: two columns */}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Left: failures + region overview */}
        <div className="space-y-4">
          {/* Recent failures */}
          <Card className="border border-divider/60">
            <CardBody className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">异常资源</p>
                <Link to="/monitor" className="text-xs text-primary font-medium hover:underline">诊断看板</Link>
              </div>
              {summary?.recentFailures?.length ? (
                <div className="space-y-2">
                  {summary.recentFailures.slice(0, 5).map(r => (
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

          {/* Region distribution */}
          {admin && assetStats.topRegions.length > 0 && (
            <Card className="border border-divider/60">
              <CardBody className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold">地区分布</p>
                  <Link to="/assets" className="text-xs text-primary font-medium hover:underline">服务器资产</Link>
                </div>
                <div className="space-y-1.5">
                  {assetStats.topRegions.map(([region, count]) => (
                    <div key={region} className="flex items-center gap-3 text-sm">
                      <span className="w-32 truncate">{getRegionFlag(region)}{region}</span>
                      <Progress size="sm" value={(count / assetStats.total) * 100} color="primary" className="flex-1" />
                      <span className="text-xs font-mono text-default-500 w-8 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        {/* Right sidebar: quick nav */}
        <div className="space-y-4">
          {/* Quick nav grid */}
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
                    { to: '/node', label: '节点监控', count: nodes.length, color: 'success' as const },
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
