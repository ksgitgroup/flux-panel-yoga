import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from 'react-hot-toast';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Progress } from "@heroui/progress";
import { getDiagnosisRuntimeStatus, getDiagnosisSummary, getNodeList, getUserPackageInfo } from "@/api";
import { siteConfig } from "@/config/site";

interface UserInfo {
  flow: number;
  inFlow: number;
  outFlow: number;
  num: number;
  expTime?: string;
  flowResetTime?: number;
}

interface DiagnosisBatchItem {
  id: number;
  targetType: string;
  targetId: number;
  targetName: string;
  overallSuccess: boolean;
  averageTime?: number;
  packetLoss?: number;
  createdTime: number;
}

interface DiagnosisSummary {
  totalCount: number;
  successCount: number;
  failCount: number;
  healthRate: number;
  avgLatency?: number;
  lastRunTime?: number;
  recentFailures: DiagnosisBatchItem[];
}

interface DiagnosisRuntimeItem {
  targetType: string;
  targetId: number;
  targetName: string;
  success: boolean;
  averageTime?: number;
  packetLoss?: number;
  errorMessage?: string;
  finishedAt: number;
}

interface DiagnosisRuntimeStatus {
  running: boolean;
  triggerSource: string;
  startedAt?: number;
  finishedAt?: number;
  totalCount: number;
  completedCount: number;
  successCount: number;
  failCount: number;
  currentTargetType?: string;
  currentTargetId?: number;
  currentTargetName?: string;
  progressPercent: number;
  recentItems: DiagnosisRuntimeItem[];
}

interface DashboardNode {
  id: number;
  name: string;
  status: number;
}

const formatFlow = (value: number, unit: string = 'bytes'): string => {
  if (value === 99999) return '无限制';
  if (unit === 'gb') return `${value || 0} GB`;
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(2)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDateTime = (ts?: number) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
};

const formatRelativeTime = (ts?: number) => {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
};

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
  triggerSource: data?.triggerSource || 'idle',
  startedAt: data?.startedAt ?? undefined,
  finishedAt: data?.finishedAt ?? undefined,
  totalCount: Number(data?.totalCount ?? 0),
  completedCount: Number(data?.completedCount ?? 0),
  successCount: Number(data?.successCount ?? 0),
  failCount: Number(data?.failCount ?? 0),
  currentTargetType: data?.currentTargetType ?? undefined,
  currentTargetId: data?.currentTargetId ?? undefined,
  currentTargetName: data?.currentTargetName ?? undefined,
  progressPercent: Number(data?.progressPercent ?? 0),
  recentItems: Array.isArray(data?.recentItems) ? data.recentItems : [],
});

const OverviewCard = ({
  label,
  value,
  subtitle,
  tone = 'default',
}: {
  label: string;
  value: string;
  subtitle: string;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}) => (
  <Card className="border border-default-200 bg-white/85 shadow-sm dark:bg-black/20">
    <CardBody className="gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.18em] text-default-400">{label}</p>
        <Chip size="sm" variant="flat" color={tone}>{label}</Chip>
      </div>
      <div>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        <p className="mt-1 text-xs leading-5 text-default-500">{subtitle}</p>
      </div>
    </CardBody>
  </Card>
);

const QuickEntry = ({
  title,
  description,
  to,
  tone = 'default',
}: {
  title: string;
  description: string;
  to: string;
  tone?: 'default' | 'primary' | 'success' | 'warning';
}) => (
  <Card className="border border-default-200 bg-white/85 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md dark:bg-black/20">
    <CardBody className="gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <Chip size="sm" variant="flat" color={tone}>{title}</Chip>
      </div>
      <p className="text-sm leading-6 text-default-500">{description}</p>
      <Button as={Link} to={to} size="sm" variant="flat" color="primary">
        打开
      </Button>
    </CardBody>
  </Card>
);

export default function DashboardPage() {
  const admin = localStorage.getItem('admin') === 'true';
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo>({} as UserInfo);
  const [forwardCount, setForwardCount] = useState(0);
  const [tunnelCount, setTunnelCount] = useState(0);
  const [summary, setSummary] = useState<DiagnosisSummary | null>(null);
  const [runtime, setRuntime] = useState<DiagnosisRuntimeStatus | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [onlineNodeCount, setOnlineNodeCount] = useState(0);

  const loadHome = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [packageResp, summaryResp, runtimeResp, nodeResp] = await Promise.all([
        getUserPackageInfo(),
        getDiagnosisSummary().catch(() => null),
        getDiagnosisRuntimeStatus().catch(() => null),
        admin ? getNodeList().catch(() => null) : Promise.resolve(null),
      ]);

      if (packageResp.code !== 0) {
        if (!silent) toast.error(packageResp.msg || '加载首页失败');
        return;
      }

      const packageData = packageResp.data || {};
      setUserInfo(packageData.userInfo || ({} as UserInfo));
      setForwardCount(Array.isArray(packageData.forwards) ? packageData.forwards.length : 0);
      setTunnelCount(Array.isArray(packageData.tunnelPermissions) ? packageData.tunnelPermissions.length : 0);

      if (summaryResp?.code === 0) {
        setSummary(normalizeSummary(summaryResp.data));
      }
      if (runtimeResp?.code === 0) {
        setRuntime(normalizeRuntime(runtimeResp.data));
      }
      if (admin && nodeResp?.code === 0) {
        const nodes: DashboardNode[] = Array.isArray(nodeResp.data) ? nodeResp.data : [];
        setNodeCount(nodes.length);
        setOnlineNodeCount(nodes.filter((node) => node.status === 1).length);
      }
    } catch (error) {
      console.error('load home error', error);
      if (!silent) toast.error('加载首页失败');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [admin]);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadHome(true);
    }, runtime?.running ? 2500 : 60000);
    return () => window.clearInterval(interval);
  }, [loadHome, runtime?.running]);

  const usedFlow = useMemo(() => (userInfo.inFlow || 0) + (userInfo.outFlow || 0), [userInfo.inFlow, userInfo.outFlow]);
  const flowUsage = useMemo(() => {
    if (!userInfo.flow || userInfo.flow === 99999) return 0;
    const totalBytes = userInfo.flow * 1024 * 1024 * 1024;
    return totalBytes > 0 ? Math.min((usedFlow / totalBytes) * 100, 100) : 0;
  }, [usedFlow, userInfo.flow]);
  const healthRate = summary?.healthRate ?? 100;

  const overviewCards = admin
    ? [
        {
          label: '诊断健康率',
          value: `${healthRate.toFixed(1)}%`,
          subtitle: summary?.failCount ? `${summary.failCount} 个资源需要排查` : '当前未发现告警资源',
          tone: summary?.failCount ? 'warning' as const : 'success' as const,
        },
        {
          label: '最近诊断',
          value: summary?.lastRunTime ? formatRelativeTime(summary.lastRunTime) : '未执行',
          subtitle: summary?.lastRunTime ? formatDateTime(summary.lastRunTime) : '请到诊断看板手动触发',
          tone: 'primary' as const,
        },
        {
          label: '在线节点',
          value: `${onlineNodeCount}/${nodeCount}`,
          subtitle: nodeCount > 0 ? '详细带宽曲线已移到诊断看板' : '当前未检测到节点数据',
          tone: onlineNodeCount === nodeCount && nodeCount > 0 ? 'success' as const : 'warning' as const,
        },
        {
          label: '纳入诊断资源',
          value: `${summary?.totalCount ?? 0}`,
          subtitle: `${forwardCount} 条转发，${tunnelCount} 条隧道`,
          tone: 'default' as const,
        },
      ]
    : [
        {
          label: '诊断健康率',
          value: `${healthRate.toFixed(1)}%`,
          subtitle: summary?.failCount ? `${summary.failCount} 个资源需要排查` : '当前未发现告警资源',
          tone: summary?.failCount ? 'warning' as const : 'success' as const,
        },
        {
          label: '流量使用',
          value: userInfo.flow === 99999 ? '无限制' : `${flowUsage.toFixed(1)}%`,
          subtitle: `${formatFlow(usedFlow)} / ${formatFlow(userInfo.flow || 0, 'gb')}`,
          tone: flowUsage >= 85 ? 'warning' as const : 'primary' as const,
        },
        {
          label: '当前转发',
          value: `${forwardCount}`,
          subtitle: `${tunnelCount} 条隧道正在承载`,
          tone: 'default' as const,
        },
        {
          label: '最近诊断',
          value: summary?.lastRunTime ? formatRelativeTime(summary.lastRunTime) : '未执行',
          subtitle: summary?.lastRunTime ? formatDateTime(summary.lastRunTime) : '请到诊断看板查看详情',
          tone: 'primary' as const,
        },
      ];

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 text-default-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-default-200 border-t-default-500" />
          <span>正在加载首页...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 py-2">
      <Card className="overflow-hidden border border-default-200 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,252,0.96))] shadow-sm dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.16),transparent_26%),linear-gradient(180deg,rgba(9,9,11,0.96),rgba(15,23,42,0.94))]">
        <CardBody className="gap-5 p-5 lg:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Chip size="sm" variant="flat" color="primary">{siteConfig.environment_name}</Chip>
                <Chip size="sm" variant="flat" color={summary?.failCount ? 'warning' : 'success'}>
                  {summary?.failCount ? `${summary.failCount} 个异常待处理` : '系统整体稳定'}
                </Chip>
                <Chip size="sm" variant="flat">{siteConfig.release_version} · {siteConfig.build_revision}</Chip>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">首页</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-default-600">
                这里只保留最核心的信息和入口：系统是否稳定、最近一次诊断何时完成、有没有异常需要立刻处理。所有详细图表、流量曲线和链路诊断都放到诊断看板，避免首页继续膨胀。
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button as={Link} to="/monitor" color="primary">进入诊断看板</Button>
                <Button as={Link} to="/forward" variant="flat" color="primary">转发管理</Button>
                <Button as={Link} to={admin ? '/node' : '/tunnel'} variant="light">
                  {admin ? '节点监控' : '隧道管理'}
                </Button>
                <Button as={Link} to={admin ? '/config?section=basic' : '/profile'} variant="light">
                  {admin ? '系统配置' : '个人中心'}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:w-[420px]">
              <div className="rounded-3xl border border-white/60 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                <p className="text-xs uppercase tracking-[0.2em] text-default-400">当前版本</p>
                <p className="mt-3 text-lg font-semibold text-foreground">{siteConfig.release_version}</p>
                <p className="mt-1 text-xs text-default-500">{siteConfig.build_revision}</p>
              </div>
              <div className="rounded-3xl border border-white/60 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                <p className="text-xs uppercase tracking-[0.2em] text-default-400">最近诊断</p>
                <p className="mt-3 text-lg font-semibold text-foreground">{summary?.lastRunTime ? formatRelativeTime(summary.lastRunTime) : '暂未执行'}</p>
                <p className="mt-1 text-xs text-default-500">{summary?.lastRunTime ? formatDateTime(summary.lastRunTime) : '去诊断看板手动触发'}</p>
              </div>
              <div className="rounded-3xl border border-white/60 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/5 sm:col-span-2">
                <p className="text-xs uppercase tracking-[0.2em] text-default-400">首页职责</p>
                <p className="mt-3 text-sm leading-7 text-default-600">
                  首页只负责回答“现在稳不稳、要不要马上处理、应该点去哪里”；真正的图表、诊断执行进度和流量拆分都在诊断看板里。
                </p>
              </div>
            </div>
          </div>

          {runtime?.running && (
            <div className="rounded-[28px] border border-primary/20 bg-primary/5 p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip size="sm" variant="flat" color="primary">手动诊断执行中</Chip>
                    <Chip size="sm" variant="flat" color="default">{runtime.completedCount}/{runtime.totalCount || '--'}</Chip>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {runtime.currentTargetName ? `当前正在诊断：${runtime.currentTargetName}` : '正在准备诊断队列'}
                  </p>
                  <p className="mt-1 text-xs text-default-500">
                    详细执行过程和最近完成的资源，直接到诊断看板查看。
                  </p>
                </div>
                <Button as={Link} to="/monitor" size="sm" color="primary">查看执行详情</Button>
              </div>
              <Progress aria-label="诊断进度" value={runtime.progressPercent} color="primary" className="mt-4" />
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {overviewCards.map((item) => (
              <OverviewCard key={item.label} {...item} />
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.95fr)]">
        <Card className="border border-default-200 shadow-sm">
          <CardHeader className="pb-0">
            <div>
              <p className="text-sm font-semibold text-foreground">当前待处理项</p>
              <p className="text-xs text-default-500">这里只保留最新异常摘要，详细链路、趋势和流量图都在诊断看板。</p>
            </div>
          </CardHeader>
          <CardBody className="space-y-3 pt-5">
            {summary?.recentFailures?.length ? summary.recentFailures.slice(0, 4).map((record) => (
              <div key={record.id} className="rounded-3xl border border-danger-200 bg-danger-50/60 p-4 shadow-sm dark:border-danger-800/40 dark:bg-danger-900/10">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip size="sm" variant="flat" color="danger">{record.targetType === 'tunnel' ? '隧道异常' : '转发异常'}</Chip>
                      <span className="text-sm font-semibold text-foreground">{record.targetName}</span>
                    </div>
                    <p className="mt-2 text-xs text-default-500">
                      {formatDateTime(record.createdTime)} · 最近更新 {formatRelativeTime(record.createdTime)}
                    </p>
                  </div>
                  <div className="grid min-w-[190px] grid-cols-2 gap-3 lg:max-w-[220px]">
                    <div className="rounded-2xl border border-danger-200 bg-white/80 px-3 py-3 dark:bg-black/20">
                      <p className="text-xs text-default-400">延迟</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{record.averageTime ? `${record.averageTime} ms` : '--'}</p>
                    </div>
                    <div className="rounded-2xl border border-danger-200 bg-white/80 px-3 py-3 dark:bg-black/20">
                      <p className="text-xs text-default-400">丢包</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{record.packetLoss !== undefined && record.packetLoss !== null ? `${record.packetLoss}%` : '--'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[28px] border border-dashed border-success-300 bg-success-50/50 text-center dark:border-success-800/50 dark:bg-success-900/10">
                <div className="rounded-full bg-success-100 p-4 text-success dark:bg-success-900/20">
                  <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="mt-4 text-lg font-medium text-foreground">当前没有待处理异常</p>
                <p className="mt-2 text-sm text-default-500">如果需要确认趋势和流量热点，去诊断看板看详细图表。</p>
              </div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card className="border border-default-200 shadow-sm">
            <CardHeader className="pb-0">
              <div>
                <p className="text-sm font-semibold text-foreground">快捷入口</p>
                <p className="text-xs text-default-500">首页只保留操作入口，不再重复堆详细看板。</p>
              </div>
            </CardHeader>
            <CardBody className="grid gap-3 pt-5 sm:grid-cols-2 xl:grid-cols-1">
              <QuickEntry title="诊断看板" description="查看实时诊断进度、节点流量、隧道/转发流量排行与链路明细。" to="/monitor" tone="primary" />
              {admin ? (
                <QuickEntry title="自定义导航" description="集中打开探针、x-ui、服务器后台等常用外部入口，后续会继续扩展统一运维入口。" to="/portal" tone="warning" />
              ) : null}
              <QuickEntry title="转发管理" description="集中处理筛选、列表/卡片视图、批量操作和单条诊断。" to="/forward" tone="success" />
              <QuickEntry title={admin ? '节点监控' : '隧道管理'} description={admin ? '查看节点在线状态和节点侧信息。' : '查看隧道资源和最近诊断结果。'} to={admin ? '/node' : '/tunnel'} tone="warning" />
              <QuickEntry title={admin ? '系统工作台' : '个人中心'} description={admin ? '网站配置、安全登录、诊断配置与告警通知都在系统工作台左侧导航内。' : '查看个人资料、密码与二步验证。'} to={admin ? '/config?section=basic' : '/profile'} tone="default" />
            </CardBody>
          </Card>

          <Card className="border border-default-200 shadow-sm">
            <CardHeader className="pb-0">
              <div>
                <p className="text-sm font-semibold text-foreground">当前快照</p>
                <p className="text-xs text-default-500">这块只留最必要的解释，避免首页继续失控变成第二个监控页。</p>
              </div>
            </CardHeader>
            <CardBody className="space-y-3 pt-5">
              <div className="rounded-3xl border border-default-200 bg-white/80 p-4 shadow-sm dark:bg-black/20">
                <p className="text-xs uppercase tracking-[0.18em] text-default-400">版本与环境</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{siteConfig.release_version}</p>
                <p className="mt-1 text-xs text-default-500">{siteConfig.environment_name} · {siteConfig.build_revision}</p>
              </div>
              <div className="rounded-3xl border border-default-200 bg-white/80 p-4 shadow-sm dark:bg-black/20">
                <p className="text-xs uppercase tracking-[0.18em] text-default-400">资源规模</p>
                <p className="mt-2 text-sm leading-7 text-default-600">
                  当前纳入首页摘要的资源共有 {summary?.totalCount ?? 0} 个，其中 {forwardCount} 条转发、{tunnelCount} 条隧道。详细图表和流量拆解已统一迁移到诊断看板。
                </p>
              </div>
              {!admin && (
                <div className="rounded-3xl border border-default-200 bg-white/80 p-4 shadow-sm dark:bg-black/20">
                  <p className="text-xs uppercase tracking-[0.18em] text-default-400">套餐使用</p>
                  <p className="mt-2 text-sm leading-7 text-default-600">
                    已使用 {formatFlow(usedFlow)}，{userInfo.flow === 99999 ? '当前套餐不限流量。' : `占总额度 ${flowUsage.toFixed(1)}%。`}
                  </p>
                </div>
              )}
              {admin && (
                <div className="rounded-3xl border border-default-200 bg-white/80 p-4 shadow-sm dark:bg-black/20">
                  <p className="text-xs uppercase tracking-[0.18em] text-default-400">节点概览</p>
                  <p className="mt-2 text-sm leading-7 text-default-600">
                    当前在线 {onlineNodeCount}/{nodeCount} 个节点。实时带宽、节点走势和服务流量排行已集中放到诊断看板，首页不再重复放图。
                  </p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
