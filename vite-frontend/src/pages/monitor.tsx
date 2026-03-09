import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Divider } from "@heroui/divider";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { useNavigate } from 'react-router-dom';
import { Progress } from "@heroui/progress";
import { Tabs, Tab } from "@heroui/tabs";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AssetHost,
  MonitorInstance,
  getDiagnosisHistory,
  getDiagnosisRuntimeStatus,
  getDiagnosisSummary,
  getDiagnosisTrend,
  getForwardList,
  getNodeList,
  getAssetList,
  getMonitorList,
  getUserPackageInfo,
  runDiagnosisNow,
} from '@/api';
import { hasPermission } from '@/utils/auth';
import { siteConfig } from '@/config/site';

interface DiagnosisRecord {
  id: number;
  targetType: 'tunnel' | 'forward';
  targetId: number;
  targetName: string;
  overallSuccess: boolean;
  resultsJson: string;
  averageTime?: number;
  packetLoss?: number;
  createdTime: number;
}

interface ResultItem {
  nodeId: number;
  nodeName: string;
  targetIp: string;
  targetPort: number;
  description: string;
  success: boolean;
  message: string;
  averageTime: number;
  packetLoss: number;
  timestamp: number;
}

interface SummaryData {
  totalCount: number;
  successCount: number;
  failCount: number;
  avgLatency?: number;
  lastRunTime?: number;
  records: DiagnosisRecord[];
  recentFailures: DiagnosisRecord[];
  healthRate: number;
}

interface TrendPoint {
  time: number;
  hour: string;
  success: number;
  fail: number;
  total: number;
  avgLatency?: number;
}

interface StatisticsFlowPoint {
  id: number;
  userId: number;
  flow: number;
  totalFlow: number;
  time: string;
  createdTime: number;
}

interface ForwardItem {
  id: number;
  name: string;
  tunnelId: number;
  tunnelName: string;
  inIp: string;
  inPort: number;
  remoteAddr: string;
  inFlow: number;
  outFlow: number;
  status: number;
  createdTime: string;
}

interface NodeRuntimeInfo {
  cpuUsage: number;
  memoryUsage: number;
  uploadTraffic: number;
  downloadTraffic: number;
  uploadSpeed: number;
  downloadSpeed: number;
  uptime: number;
}

interface DashboardNode {
  id: number;
  name: string;
  status: number;
  connectionStatus: 'online' | 'offline';
  systemInfo?: NodeRuntimeInfo | null;
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

interface NodeTrafficSample {
  time: string;
  uploadSpeed: number;
  downloadSpeed: number;
  onlineNodes: number;
}

const formatTime = (ts?: number) => {
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

const formatFlow = (value: number): string => {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(2)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatSpeed = (value: number) => `${formatFlow(value)}/s`;
const formatFlowAxis = (value: number) => {
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}K`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)}M`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)}G`;
};

const parseResults = (resultsJson: string): ResultItem[] => {
  try {
    const data = JSON.parse(resultsJson);
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data)) return data;
    return [];
  } catch {
    return [];
  }
};

const getLatencyColor = (ms?: number) => {
  if (ms === undefined || ms === null || ms < 0) return 'text-gray-400';
  if (ms < 30) return 'text-emerald-500';
  if (ms < 60) return 'text-green-500';
  if (ms < 100) return 'text-blue-500';
  if (ms < 150) return 'text-yellow-500';
  return 'text-red-500';
};

const getLatencyLabel = (ms?: number) => {
  if (ms === undefined || ms === null || ms < 0) return '—';
  return `${ms.toFixed(1)}ms`;
};

const normalizeSummary = (data: any): SummaryData => ({
  totalCount: Number(data?.totalCount ?? 0),
  successCount: Number(data?.successCount ?? 0),
  failCount: Number(data?.failCount ?? 0),
  avgLatency: data?.avgLatency ?? undefined,
  lastRunTime: data?.lastRunTime ?? undefined,
  records: Array.isArray(data?.records) ? data.records : [],
  recentFailures: Array.isArray(data?.recentFailures) ? data.recentFailures : [],
  healthRate: Number(data?.healthRate ?? 100),
});

const normalizeTrend = (data: any): TrendPoint[] => (
  Array.isArray(data)
    ? data.map((item) => ({
        time: Number(item?.time ?? 0),
        hour: item?.hour || '--:--',
        success: Number(item?.success ?? 0),
        fail: Number(item?.fail ?? 0),
        total: Number(item?.total ?? 0),
        avgLatency: item?.avgLatency ?? undefined,
      }))
    : []
);

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

const StatCard = ({ label, value, subtitle, tone }: {
  label: string;
  value: string;
  subtitle: string;
  tone: 'default' | 'primary' | 'success' | 'warning' | 'danger';
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

const RecordRow = ({ record }: { record: DiagnosisRecord }) => {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<DiagnosisRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<DiagnosisRecord | null>(null);

  const loadHistory = async () => {
    if (history.length > 0) return;
    setHistoryLoading(true);
    try {
      const resp = await getDiagnosisHistory({
        targetType: record.targetType,
        targetId: record.targetId,
        limit: 10,
      });
      if (resp.code === 0) setHistory(resp.data || []);
    } catch {
      /* silent */
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleExpand = () => {
    if (!expanded) void loadHistory();
    setExpanded(!expanded);
  };

  const openDetail = (targetRecord: DiagnosisRecord) => {
    setSelectedRecord(targetRecord);
    setDetailOpen(true);
  };

  const results = parseResults(record.resultsJson);
  const latency = record.averageTime ?? (results.length > 0 && results[0]?.averageTime > 0 ? results[0].averageTime : undefined);

  return (
    <>
      <div className={`border rounded-2xl transition-all duration-200 ${record.overallSuccess
        ? 'border-success-200 dark:border-success-700/40 bg-success-50/30 dark:bg-success-900/10'
        : 'border-danger-200 dark:border-danger-700/40 bg-danger-50/30 dark:bg-danger-900/10'
      }`}>
        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={handleExpand}>
          <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${record.overallSuccess ? 'bg-success-500' : 'bg-danger-500 animate-pulse'}`} />
          <Chip size="sm" variant="flat" color={record.targetType === 'tunnel' ? 'secondary' : 'primary'} className="text-xs flex-shrink-0">
            {record.targetType === 'tunnel' ? '隧道' : '转发'}
          </Chip>
          <span className="font-medium text-sm flex-1 truncate">{record.targetName}</span>
          <span className={`text-xs font-mono flex-shrink-0 ${getLatencyColor(latency)}`}>{getLatencyLabel(latency)}</span>
          <Chip size="sm" color={record.overallSuccess ? 'success' : 'danger'} variant="flat">
            {record.overallSuccess ? '正常' : '异常'}
          </Chip>
          {results.length > 0 && (
            <span className="text-xs text-gray-500 hidden sm:block flex-shrink-0">
              {results.filter((r) => r.success).length}/{results.length}
            </span>
          )}
          <span className="text-xs text-gray-400 hidden md:block flex-shrink-0">{formatRelativeTime(record.createdTime)}</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        {expanded && (
          <div className="px-4 pb-3">
            <Divider className="mb-3" />
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-500 mb-2">最新诊断详情</p>
              <div className="space-y-1">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${r.success
                      ? 'bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-400'
                      : 'bg-danger-50 dark:bg-danger-900/20 text-danger-700 dark:text-danger-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{r.description}</span>
                      <span className="text-gray-400 hidden sm:inline truncate">
                        {r.nodeName} → {r.targetIp}:{r.targetPort}
                      </span>
                    </div>
                    <span className="ml-2 flex-shrink-0 font-mono">
                      {r.success
                        ? `✓ ${r.averageTime > 0 ? `${r.averageTime.toFixed(1)}ms` : 'OK'}${r.packetLoss > 0 ? ` | ${r.packetLoss.toFixed(1)}%丢包` : ''}`
                        : `✗ ${r.message || '失败'}`}
                    </span>
                  </div>
                ))}
                {results.length === 0 && <p className="text-xs text-gray-400">暂无详细诊断数据</p>}
              </div>
            </div>

            <p className="text-xs font-semibold text-gray-500 mb-2">最近 10 次历史</p>
            {historyLoading ? (
              <div className="flex justify-center py-2"><Spinner size="sm" /></div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => openDetail(item)}
                    title={`${formatTime(item.createdTime)}${item.averageTime && item.averageTime > 0 ? ` · ${item.averageTime.toFixed(1)}ms` : ''}`}
                    className={`h-7 w-7 rounded-md transition-all hover:scale-110 flex items-center justify-center text-white text-[10px] font-mono ${item.overallSuccess ? 'bg-success-400 dark:bg-success-600' : 'bg-danger-400 dark:bg-danger-600'}`}
                  >
                    {item.averageTime && item.averageTime > 0 ? Math.round(item.averageTime) : (item.overallSuccess ? '✓' : '✗')}
                  </button>
                ))}
                {history.length === 0 && <p className="text-xs text-gray-400">暂无历史数据</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <Modal isOpen={detailOpen} onClose={() => setDetailOpen(false)} size="md">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            诊断详情 — {selectedRecord?.targetName}
            <p className="text-xs font-normal text-gray-500">{formatTime(selectedRecord?.createdTime)}</p>
          </ModalHeader>
          <ModalBody>
            {selectedRecord && parseResults(selectedRecord.resultsJson).map((r, i) => (
              <div key={i} className={`flex flex-col gap-1 p-3 rounded-xl ${r.success ? 'bg-success-50 dark:bg-success-900/20' : 'bg-danger-50 dark:bg-danger-900/20'}`}>
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm">{r.description}</span>
                  <Chip size="sm" color={r.success ? 'success' : 'danger'} variant="flat">{r.success ? '正常' : '失败'}</Chip>
                </div>
                <p className="text-xs text-gray-500">节点: {r.nodeName} → {r.targetIp}:{r.targetPort}</p>
                {r.success && r.averageTime > 0 && (
                  <p className="text-xs">平均延迟: <span className="font-medium">{r.averageTime.toFixed(2)} ms</span> | 丢包率: <span className="font-medium">{r.packetLoss.toFixed(1)}%</span></p>
                )}
                {!r.success && <p className="text-xs text-danger-600 dark:text-danger-400">{r.message}</p>}
              </div>
            ))}
          </ModalBody>
          <ModalFooter>
            <Button color="primary" variant="light" onPress={() => setDetailOpen(false)}>关闭</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

const TrendChart = ({ data }: { data: TrendPoint[] }) => {
  if (!data.length) return null;
  const chartData = data.map((item) => ({
    ...item,
    healthRate: item.total > 0 ? Number(((item.success / item.total) * 100).toFixed(1)) : null,
  }));
  const alertHours = chartData.filter((item) => item.fail > 0).length;
  const worstWindow = [...chartData].sort((a, b) => (b.fail * 1000 + Number(b.avgLatency || 0)) - (a.fail * 1000 + Number(a.avgLatency || 0)))[0];

  return (
    <Card className="border border-default-200 shadow-sm">
      <CardHeader className="pb-2">
        <div className="w-full space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
              <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
            </svg>
            <h2 className="text-base font-semibold">24 小时诊断健康轨迹</h2>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl border border-divider bg-default-50/70 px-3 py-2">
              <div className="text-default-400">告警时段</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{alertHours} 个</div>
            </div>
            <div className="rounded-xl border border-divider bg-default-50/70 px-3 py-2">
              <div className="text-default-400">最差时段</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{worstWindow?.hour || '--'}</div>
            </div>
            <div className="rounded-xl border border-divider bg-default-50/70 px-3 py-2">
              <div className="text-default-400">最近诊断量</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{chartData[chartData.length - 1]?.total || 0}</div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardBody className="pt-0">
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} barGap={0} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }} interval={2} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }} allowDecimals={false} />
              <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const failVal = payload.find((p) => p.dataKey === 'fail')?.value || 0;
                  const totalVal = payload.find((p) => p.dataKey === 'total')?.value || 0;
                  const healthVal = payload.find((p) => p.dataKey === 'healthRate')?.value || 0;
                  const latencyVal = payload.find((p) => p.dataKey === 'avgLatency')?.value || 0;
                  return (
                    <div className="bg-white dark:bg-default-100 border border-default-200 rounded-lg shadow-lg p-3 text-sm">
                      <p className="font-medium mb-1">{label}</p>
                      <p className="text-red-500">失败资源: {String(failVal)}</p>
                      <p className="text-default-600">总诊断数: {String(totalVal)}</p>
                      <p className="text-blue-500">健康率: {Number(healthVal).toFixed(1)}%</p>
                      <p className="text-default-500">平均延时: {latencyVal ? `${Number(latencyVal).toFixed(1)}ms` : '--'}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="fail" fill="#f87171" radius={[3, 3, 0, 0]} opacity={0.85} />
              <Line yAxisId="rate" type="monotone" dataKey="healthRate" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardBody>
    </Card>
  );
};

const LatencyTrendChart = ({ data }: { data: TrendPoint[] }) => {
  const filteredData = data.filter((item) => item.avgLatency !== undefined && item.avgLatency !== null);
  if (!filteredData.length) return null;
  const peakLatency = filteredData.reduce((peak, current) => (Number(current.avgLatency || 0) > Number(peak.avgLatency || 0) ? current : peak), filteredData[0]);
  const averageLatency = filteredData.reduce((sum, current) => sum + Number(current.avgLatency || 0), 0) / filteredData.length;
  const spikeHours = filteredData.filter((item) => Number(item.avgLatency || 0) >= 150).length;

  return (
    <Card className="border border-default-200 shadow-sm">
      <CardHeader className="pb-2">
        <div className="w-full space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h2 className="text-base font-semibold">平均延时波峰图</h2>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl border border-divider bg-default-50/70 px-3 py-2">
              <div className="text-default-400">平均延时</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{averageLatency.toFixed(1)}ms</div>
            </div>
            <div className="rounded-xl border border-divider bg-default-50/70 px-3 py-2">
              <div className="text-default-400">最高时段</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{peakLatency.hour}</div>
            </div>
            <div className="rounded-xl border border-divider bg-default-50/70 px-3 py-2">
              <div className="text-default-400">高延时时段</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{spikeHours} 个</div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardBody className="pt-0">
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredData}>
              <ReferenceArea y1={0} y2={80} fill="#dcfce7" fillOpacity={0.55} />
              <ReferenceArea y1={80} y2={150} fill="#fef3c7" fillOpacity={0.45} />
              <ReferenceArea y1={150} y2={1000} fill="#fee2e2" fillOpacity={0.4} />
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }} interval={2} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }} tickFormatter={(v) => `${v}ms`} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length || payload[0].value === undefined) return null;
                  return (
                    <div className="bg-white dark:bg-default-100 border border-default-200 rounded-lg shadow-lg p-3 text-sm">
                      <p className="font-medium">{label}</p>
                      <p className="text-blue-500">延迟: {Number(payload[0].value).toFixed(1)}ms</p>
                      <p className="text-default-500 mt-1">{Number(payload[0].value) >= 150 ? '属于高延时窗口，建议联动异常资源一起看。' : '延时仍处于可控范围。'}</p>
                    </div>
                  );
                }}
              />
              <defs>
                <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="avgLatency" stroke="#3b82f6" strokeWidth={2} fill="url(#latencyGradient)" dot={false} activeDot={{ r: 4, stroke: '#3b82f6', strokeWidth: 2, fill: '#fff' }} connectNulls />
              <Line type="monotone" dataKey="avgLatency" stroke="#1d4ed8" strokeWidth={1.5} dot={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardBody>
    </Card>
  );
};

export default function MonitorPage() {
  const navigate = useNavigate();
  const canViewMonitor = hasPermission('monitor.read');
  const canManageMonitor = hasPermission('monitor.write');
  const canViewNodes = hasPermission('node.read');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [runtime, setRuntime] = useState<DiagnosisRuntimeStatus | null>(null);
  const [statisticsFlows, setStatisticsFlows] = useState<StatisticsFlowPoint[]>([]);
  const [forwardList, setForwardList] = useState<ForwardItem[]>([]);
  const [nodes, setNodes] = useState<DashboardNode[]>([]);
  const [nodeTrafficSeries, setNodeTrafficSeries] = useState<NodeTrafficSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [filter, setFilter] = useState<'all' | 'success' | 'fail'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'tunnel' | 'forward'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [assets, setAssets] = useState<AssetHost[]>([]);
  const [probeInstances, setProbeInstances] = useState<MonitorInstance[]>([]);

  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const nodesRef = useRef<DashboardNode[]>([]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const loadBoard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [summaryResp, trendResp, runtimeResp, packageResp, forwardResp, nodeResp, assetResp, monitorResp] = await Promise.all([
        getDiagnosisSummary(),
        getDiagnosisTrend({ hours: 24 }),
        getDiagnosisRuntimeStatus().catch(() => null),
        getUserPackageInfo().catch(() => null),
        getForwardList().catch(() => null),
        canViewNodes ? getNodeList().catch(() => null) : Promise.resolve(null),
        getAssetList().catch(() => null),
        getMonitorList().catch(() => null),
      ]);

      if (summaryResp.code === 0) {
        setSummary(normalizeSummary(summaryResp.data));
        setError(null);
      } else {
        setError(summaryResp.msg || '获取诊断数据失败');
      }

      if (trendResp.code === 0) {
        setTrend(normalizeTrend(trendResp.data));
      }

      if (runtimeResp?.code === 0) {
        setRuntime(normalizeRuntime(runtimeResp.data));
      }

      if (packageResp?.code === 0) {
        const data = packageResp.data || {};
        setStatisticsFlows(Array.isArray(data.statisticsFlows) ? data.statisticsFlows : []);
      }

      if (forwardResp?.code === 0) {
        setForwardList(Array.isArray(forwardResp.data) ? forwardResp.data : []);
      }

      if (canViewNodes && nodeResp?.code === 0) {
        setNodes((prev) => (nodeResp.data || []).map((node: any) => {
          const existing = prev.find((item) => item.id === node.id);
          return {
            ...node,
            connectionStatus: node.status === 1 ? 'online' : 'offline',
            systemInfo: existing?.systemInfo || null,
          };
        }));
      }
      if (assetResp?.code === 0) setAssets(Array.isArray(assetResp.data) ? assetResp.data : []);
      if (monitorResp?.code === 0) setProbeInstances(Array.isArray(monitorResp.data) ? monitorResp.data : []);
    } catch (err) {
      console.error('Diagnosis load error:', err);
      setError('网络请求失败，请检查后端服务');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [canViewNodes]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadBoard(true);
    }, runtime?.running ? 2500 : 60000);
    return () => window.clearInterval(timer);
  }, [loadBoard, runtime?.running]);

  useEffect(() => {
    if (!canViewNodes) {
      setNodes([]);
      setNodeTrafficSeries([]);
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
      return;
    }

    let unmounted = false;

    const closeSocket = () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (websocketRef.current) {
        websocketRef.current.onopen = null;
        websocketRef.current.onmessage = null;
        websocketRef.current.onerror = null;
        websocketRef.current.onclose = null;
        websocketRef.current.close();
        websocketRef.current = null;
      }
    };

    const attemptReconnect = () => {
      if (unmounted || reconnectAttemptsRef.current >= 4) return;
      reconnectAttemptsRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(() => {
        initSocket();
      }, reconnectAttemptsRef.current * 2500);
    };

    const handleSocketMessage = (payload: any) => {
      const { id, type, data } = payload || {};
      if (type === 'status') {
        setNodes((prev) => prev.map((node) => (
          node.id == id
            ? {
                ...node,
                connectionStatus: data === 1 ? 'online' : 'offline',
                systemInfo: data === 0 ? null : node.systemInfo,
              }
            : node
        )));
        return;
      }

      if (type === 'info') {
        setNodes((prev) => prev.map((node) => {
          if (node.id != id) return node;
          try {
            const systemInfo = typeof data === 'string' ? JSON.parse(data) : data;
            const currentUpload = parseInt(systemInfo.bytes_transmitted, 10) || 0;
            const currentDownload = parseInt(systemInfo.bytes_received, 10) || 0;
            const currentUptime = parseInt(systemInfo.uptime, 10) || 0;
            let uploadSpeed = 0;
            let downloadSpeed = 0;

            if (node.systemInfo?.uptime) {
              const diff = currentUptime - node.systemInfo.uptime;
              if (diff > 0 && diff <= 10) {
                const uploadDiff = currentUpload - (node.systemInfo.uploadTraffic || 0);
                const downloadDiff = currentDownload - (node.systemInfo.downloadTraffic || 0);
                if (uploadDiff >= 0) uploadSpeed = uploadDiff / diff;
                if (downloadDiff >= 0) downloadSpeed = downloadDiff / diff;
              }
            }

            return {
              ...node,
              connectionStatus: 'online',
              systemInfo: {
                cpuUsage: parseFloat(systemInfo.cpu_usage) || 0,
                memoryUsage: parseFloat(systemInfo.memory_usage) || 0,
                uploadTraffic: currentUpload,
                downloadTraffic: currentDownload,
                uploadSpeed,
                downloadSpeed,
                uptime: currentUptime,
              },
            };
          } catch {
            return node;
          }
        }));
      }
    };

    const initSocket = () => {
      if (unmounted) return;
      if (websocketRef.current && (websocketRef.current.readyState === WebSocket.OPEN || websocketRef.current.readyState === WebSocket.CONNECTING)) {
        return;
      }

      closeSocket();
      const baseUrl = axios.defaults.baseURL || (import.meta.env.VITE_API_BASE ? `${import.meta.env.VITE_API_BASE}/api/v1/` : '/api/v1/');
      const wsUrl = baseUrl.replace(/^http/, 'ws').replace(/\/api\/v1\/$/, '') + `/system-info?type=0&secret=${localStorage.getItem('token')}`;

      try {
        websocketRef.current = new WebSocket(wsUrl);
        websocketRef.current.onopen = () => {
          reconnectAttemptsRef.current = 0;
        };
        websocketRef.current.onmessage = (event) => {
          try {
            handleSocketMessage(JSON.parse(event.data));
          } catch {
            /* silent */
          }
        };
        websocketRef.current.onerror = () => {
          /* silent */
        };
        websocketRef.current.onclose = () => {
          websocketRef.current = null;
          attemptReconnect();
        };
      } catch {
        attemptReconnect();
      }
    };

    initSocket();
    return () => {
      unmounted = true;
      closeSocket();
    };
  }, [canViewNodes]);

  useEffect(() => {
    if (!canViewNodes) return;
    const timer = window.setInterval(() => {
      const snapshot = nodesRef.current;
      const onlineNodes = snapshot.filter((node) => node.connectionStatus === 'online');
      const uploadSpeed = onlineNodes.reduce((sum, node) => sum + (node.systemInfo?.uploadSpeed || 0), 0);
      const downloadSpeed = onlineNodes.reduce((sum, node) => sum + (node.systemInfo?.downloadSpeed || 0), 0);
      const nextPoint: NodeTrafficSample = {
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        uploadSpeed,
        downloadSpeed,
        onlineNodes: onlineNodes.length,
      };
      setNodeTrafficSeries((prev) => [...prev.slice(-17), nextPoint]);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [canViewNodes]);

  const handleRunNow = async () => {
    if (!canManageMonitor) return;
    setTriggering(true);
    try {
      const resp = await runDiagnosisNow();
      if (resp.code === 0) {
        toast.success(resp.msg || '诊断任务已启动');
        if (resp.data) {
          setRuntime(normalizeRuntime(resp.data));
        }
        void loadBoard(true);
      } else {
        toast.error(resp.msg || '启动失败');
      }
    } catch {
      toast.error('请求失败');
    } finally {
      setTriggering(false);
    }
  };

  const filteredRecords = useMemo(() => (
    (summary?.records || []).filter((record) => {
      if (!record) return false;
      if (filter === 'success' && !record.overallSuccess) return false;
      if (filter === 'fail' && record.overallSuccess) return false;
      if (typeFilter !== 'all' && record.targetType !== typeFilter) return false;
      if (searchQuery.trim()) {
        return (record.targetName || '').toLowerCase().includes(searchQuery.trim().toLowerCase());
      }
      return true;
    })
  ), [summary?.records, filter, typeFilter, searchQuery]);

  const tunnelRecords = useMemo(() => (summary?.records || []).filter((record) => record.targetType === 'tunnel'), [summary?.records]);
  const forwardRecords = useMemo(() => (summary?.records || []).filter((record) => record.targetType === 'forward'), [summary?.records]);
  const tunnelFails = tunnelRecords.filter((record) => !record.overallSuccess).length;
  const forwardFails = forwardRecords.filter((record) => !record.overallSuccess).length;
  const healthRate = summary?.healthRate ?? 100;

  const nodeSummary = useMemo(() => {
    const onlineNodes = nodes.filter((node) => node.connectionStatus === 'online');
    const totals = onlineNodes.reduce((acc, node) => {
      acc.uploadSpeed += node.systemInfo?.uploadSpeed || 0;
      acc.downloadSpeed += node.systemInfo?.downloadSpeed || 0;
      return acc;
    }, { uploadSpeed: 0, downloadSpeed: 0 });

    const busiestNodes = [...onlineNodes]
      .sort((a, b) => ((b.systemInfo?.uploadSpeed || 0) + (b.systemInfo?.downloadSpeed || 0)) - ((a.systemInfo?.uploadSpeed || 0) + (a.systemInfo?.downloadSpeed || 0)))
      .slice(0, 4);

    return {
      total: nodes.length,
      online: onlineNodes.length,
      uploadSpeed: totals.uploadSpeed,
      downloadSpeed: totals.downloadSpeed,
      busiestNodes,
    };
  }, [nodes]);

  const statisticsFlowData = useMemo(() => statisticsFlows.map((item) => ({
    time: item.time,
    flow: Number(item.flow || 0),
    createdTime: Number(item.createdTime || 0),
  })), [statisticsFlows]);
  const hasBillingTraffic = useMemo(() => statisticsFlowData.some((item) => item.flow > 0), [statisticsFlowData]);

  const tunnelFlowData = useMemo(() => {
    const grouped = new Map<number, { name: string; flow: number; count: number }>();
    forwardList.forEach((item) => {
      const current = grouped.get(item.tunnelId) || { name: item.tunnelName || `隧道 ${item.tunnelId}`, flow: 0, count: 0 };
      current.flow += (item.inFlow || 0) + (item.outFlow || 0);
      current.count += 1;
      grouped.set(item.tunnelId, current);
    });
    return [...grouped.entries()]
      .map(([id, value]) => ({ id, name: value.name, flow: value.flow, count: value.count }))
      .sort((a, b) => b.flow - a.flow)
      .slice(0, 8);
  }, [forwardList]);

  const forwardFlowData = useMemo(() => (
    [...forwardList]
      .map((item) => ({
        id: item.id,
        name: item.name,
        tunnelName: item.tunnelName,
        flow: (item.inFlow || 0) + (item.outFlow || 0),
      }))
      .sort((a, b) => b.flow - a.flow)
      .slice(0, 8)
  ), [forwardList]);

  // ==================== Server Health Diagnostics ====================
  const serverHealth = useMemo(() => {
    const now = Date.now();
    const probeNodeTotal = probeInstances.reduce((s, i) => s + (i.nodeCount || 0), 0);
    const probeNodeOnline = probeInstances.reduce((s, i) => s + (i.onlineNodeCount || 0), 0);
    const offlineNodes = probeNodeTotal - probeNodeOnline;

    // Asset issues
    const expired: AssetHost[] = [];
    const expiringSoon: AssetHost[] = [];
    const missingRegion: AssetHost[] = [];
    const missingProvider: AssetHost[] = [];
    const missingCost: AssetHost[] = [];
    const noProbe: AssetHost[] = [];
    const trafficWarnings: (AssetHost & { pct: number })[] = [];

    assets.forEach(a => {
      if (a.expireDate) {
        const days = (a.expireDate - now) / 86400000;
        if (days < 0) expired.push(a);
        else if (days <= 30) expiringSoon.push(a);
      }
      if (!a.region) missingRegion.push(a);
      if (!a.provider) missingProvider.push(a);
      if (!a.monthlyCost) missingCost.push(a);
      if (!a.monitorNodeUuid && !a.pikaNodeId) noProbe.push(a);
      if (a.probeTrafficLimit && a.probeTrafficLimit > 0 && a.probeTrafficUsed) {
        const pct = (a.probeTrafficUsed / a.probeTrafficLimit) * 100;
        if (pct >= 80) trafficWarnings.push({ ...a, pct });
      }
    });
    trafficWarnings.sort((a, b) => b.pct - a.pct);

    const totalIssues = expired.length + expiringSoon.length + offlineNodes +
      trafficWarnings.length + missingRegion.length + missingProvider.length + noProbe.length;

    // Compute overall server health score (0-100)
    let score = 100;
    if (assets.length > 0) {
      score -= (expired.length / assets.length) * 30;
      score -= (offlineNodes / Math.max(probeNodeTotal, 1)) * 25;
      score -= (trafficWarnings.length / assets.length) * 15;
      score -= (noProbe.length / assets.length) * 10;
      score -= (expiringSoon.length / assets.length) * 10;
      score -= (missingRegion.length / assets.length) * 5;
      score -= (missingProvider.length / assets.length) * 5;
    }
    score = Math.max(0, Math.min(100, score));

    return {
      score, totalIssues,
      probeNodeTotal, probeNodeOnline, offlineNodes,
      expired, expiringSoon, missingRegion, missingProvider, missingCost, noProbe, trafficWarnings,
    };
  }, [assets, probeInstances]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[420px]">
        <Spinner size="lg" label="正在加载诊断看板..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[420px] gap-4">
        <div className="min-w-[300px] rounded-xl border border-danger-200 bg-danger-50 p-4 text-center text-danger dark:bg-danger-900/10">
          <p className="font-bold">页面初始化失败</p>
          <p className="text-sm opacity-80">{error}</p>
        </div>
        <Button color="primary" variant="flat" onPress={() => loadBoard(false)}>重试</Button>
      </div>
    );
  }

  const noData = !summary || summary.totalCount === 0;

  if (!canViewMonitor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[420px] gap-4">
        <div className="min-w-[300px] rounded-xl border border-danger-200 bg-danger-50 p-4 text-center text-danger dark:bg-danger-900/10">
          <p className="font-bold">缺少诊断看板查看权限</p>
          <p className="text-sm opacity-80">请联系管理员为当前角色分配 `monitor.read`。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 py-2">
      <Card className="overflow-hidden border border-default-200 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.1),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,252,0.96))] shadow-sm dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_28%),linear-gradient(180deg,rgba(9,9,11,0.96),rgba(15,23,42,0.94))]">
        <CardBody className="gap-5 p-5 lg:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Chip size="sm" variant="flat" color="primary">{siteConfig.environment_name}</Chip>
                <Chip size="sm" variant="flat" color={healthRate >= 85 ? 'success' : healthRate >= 70 ? 'warning' : 'danger'}>
                  健康率 {healthRate.toFixed(1)}%
                </Chip>
                <Chip size="sm" variant="flat">{siteConfig.release_version} · {siteConfig.build_revision}</Chip>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">诊断看板</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-default-600">
                这里是诊断集合页：手动触发全量诊断、看当前执行进度、看节点实时流量、看隧道/转发累计流量排行，以及确认最近 24 小时的健康趋势。首页不再堆这些图，全部收口在这里。
              </p>
            </div>

            <div className="flex gap-2 self-start">
              <Button variant="bordered" onPress={() => loadBoard(false)} size="sm">刷新</Button>
              <Button variant="flat" size="sm" onPress={() => navigate('/alert')}>告警配置</Button>
              <Button variant="flat" size="sm" onPress={() => navigate('/server-dashboard')}>服务器看板</Button>
              {canManageMonitor && (
                <Button color="primary" onPress={handleRunNow} isLoading={triggering} size="sm">
                  立即诊断
                </Button>
              )}
            </div>
          </div>

          {runtime && (
            <Card className="border border-primary/20 bg-primary/5 shadow-none">
              <CardBody className="gap-4 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip size="sm" variant="flat" color={runtime.running ? 'primary' : 'default'}>
                        {runtime.running ? '诊断执行中' : '最近一次执行状态'}
                      </Chip>
                      <Chip size="sm" variant="flat" color="default">
                        {runtime.completedCount}/{runtime.totalCount || '--'}
                      </Chip>
                      <Chip size="sm" variant="flat" color={runtime.failCount > 0 ? 'warning' : 'success'}>
                        成功 {runtime.successCount} / 异常 {runtime.failCount}
                      </Chip>
                    </div>
                    <p className="mt-3 text-lg font-semibold text-foreground">
                      {runtime.running
                        ? (runtime.currentTargetName ? `当前正在诊断：${runtime.currentTargetName}` : '正在准备诊断队列')
                        : (runtime.finishedAt ? `最近一次执行完成于 ${formatRelativeTime(runtime.finishedAt)}` : '当前没有运行中的诊断任务')}
                    </p>
                    <p className="mt-1 text-sm text-default-500">
                      {runtime.running
                        ? '这里会直接显示当前跑到哪一条资源，并滚动展示刚完成的隧道或转发。'
                        : '如果你手动点立即诊断，这里会展示执行进度，而不是只弹一个等待提示。'}
                    </p>
                  </div>
                  <div className="grid min-w-[220px] gap-3 sm:grid-cols-2 lg:w-[280px]">
                    <div className="rounded-2xl border border-default-200 bg-white/80 px-3 py-3 dark:bg-black/20">
                      <p className="text-xs text-default-400">开始时间</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{formatTime(runtime.startedAt)}</p>
                    </div>
                    <div className="rounded-2xl border border-default-200 bg-white/80 px-3 py-3 dark:bg-black/20">
                      <p className="text-xs text-default-400">执行来源</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{runtime.triggerSource === 'manual' ? '手动触发' : runtime.triggerSource === 'auto' ? '自动任务' : '空闲'}</p>
                    </div>
                  </div>
                </div>
                <Progress aria-label="诊断进度" value={runtime.progressPercent} color="primary" />
                {!!runtime.recentItems.length && (
                  <div className="grid gap-2 lg:grid-cols-2">
                    {runtime.recentItems.slice(0, 4).map((item, index) => (
                      <div key={`${item.targetType}-${item.targetId}-${index}`} className={`rounded-2xl border px-3 py-3 text-sm ${item.success ? 'border-success-200 bg-success-50/70 dark:border-success-800/40 dark:bg-success-900/10' : 'border-danger-200 bg-danger-50/70 dark:border-danger-800/40 dark:bg-danger-900/10'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{item.targetName}</p>
                            <p className="mt-1 text-xs text-default-500">{item.targetType === 'tunnel' ? '隧道' : '转发'} · {formatRelativeTime(item.finishedAt)}</p>
                          </div>
                          <Chip size="sm" variant="flat" color={item.success ? 'success' : 'danger'}>
                            {item.success ? '完成' : '异常'}
                          </Chip>
                        </div>
                        <p className="mt-2 text-xs text-default-500">
                          {item.success
                            ? `延迟 ${item.averageTime !== undefined && item.averageTime !== null ? `${item.averageTime}ms` : '--'}，丢包 ${item.packetLoss !== undefined && item.packetLoss !== null ? `${item.packetLoss}%` : '--'}`
                            : (item.errorMessage || '执行失败')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {!noData && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <StatCard label="健康率" value={`${healthRate.toFixed(1)}%`} subtitle={`${summary.successCount}/${summary.totalCount} 通过`} tone={healthRate >= 90 ? 'success' : healthRate >= 70 ? 'warning' : 'danger'} />
              <StatCard label="隧道" value={`${tunnelRecords.length - tunnelFails}/${tunnelRecords.length}`} subtitle={tunnelFails > 0 ? `${tunnelFails} 异常` : '全部正常'} tone={tunnelFails > 0 ? 'danger' : 'primary'} />
              <StatCard label="转发" value={`${forwardRecords.length - forwardFails}/${forwardRecords.length}`} subtitle={forwardFails > 0 ? `${forwardFails} 异常` : '全部正常'} tone={forwardFails > 0 ? 'danger' : 'primary'} />
              <StatCard label="平均延迟" value={summary.avgLatency !== null && summary.avgLatency !== undefined ? `${summary.avgLatency}ms` : '—'} subtitle="最新快照均值" tone={summary.avgLatency && summary.avgLatency > 150 ? 'danger' : 'warning'} />
              <StatCard label="最近诊断" value={formatRelativeTime(summary.lastRunTime)} subtitle={formatTime(summary.lastRunTime)} tone="default" />
            </div>
          )}
        </CardBody>
      </Card>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Tabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(key as string)} size="sm" variant="underlined" color="primary">
          <Tab key="overview" title="总览" />
          <Tab key="network" title="网络诊断" />
          <Tab key="server" title="服务器健康" />
          <Tab key="audit" title="资产审计" />
        </Tabs>
      </div>

      {/* ==================== Overview Tab ==================== */}
      {activeTab === 'overview' && (
        <>
          {!noData && trend.length > 0 && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <TrendChart data={trend} />
              <LatencyTrendChart data={trend} />
            </div>
          )}

          {/* Server Health Overview */}
          {assets.length > 0 && (
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
              <StatCard label="服务器健康" value={`${serverHealth.score.toFixed(0)}分`}
                subtitle={serverHealth.totalIssues > 0 ? `${serverHealth.totalIssues} 个问题` : '全部正常'}
                tone={serverHealth.score >= 85 ? 'success' : serverHealth.score >= 60 ? 'warning' : 'danger'} />
              <StatCard label="探针节点" value={`${serverHealth.probeNodeOnline}/${serverHealth.probeNodeTotal}`}
                subtitle={serverHealth.offlineNodes > 0 ? `${serverHealth.offlineNodes} 个离线` : '全部在线'}
                tone={serverHealth.offlineNodes > 0 ? 'warning' : 'success'} />
              <StatCard label="流量预警" value={`${serverHealth.trafficWarnings.length}`}
                subtitle={serverHealth.trafficWarnings.length > 0 ? '超过80%配额' : '无预警'}
                tone={serverHealth.trafficWarnings.length > 0 ? 'warning' : 'success'} />
              <StatCard label="到期预警" value={`${serverHealth.expired.length + serverHealth.expiringSoon.length}`}
                subtitle={serverHealth.expired.length > 0 ? `${serverHealth.expired.length} 已过期` : '30天内到期'}
                tone={serverHealth.expired.length > 0 ? 'danger' : serverHealth.expiringSoon.length > 0 ? 'warning' : 'success'} />
              <StatCard label="资产完整度" value={`${assets.length > 0 ? ((1 - serverHealth.noProbe.length / assets.length) * 100).toFixed(0) : 100}%`}
                subtitle={serverHealth.noProbe.length > 0 ? `${serverHealth.noProbe.length} 无探针` : '全部绑定'}
                tone={serverHealth.noProbe.length > 0 ? 'warning' : 'success'} />
            </div>
          )}

          {/* Quick issue list */}
          {serverHealth.totalIssues > 0 && (
            <Card className="border border-default-200 shadow-sm">
              <CardBody className="p-4">
                <p className="text-sm font-semibold mb-3">待处理问题</p>
                <div className="space-y-1.5">
                  {serverHealth.expired.map(a => (
                    <div key={`exp-${a.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-danger-50/40 dark:bg-danger-50/10 text-sm">
                      <Chip size="sm" variant="flat" color="danger" className="h-5 text-[10px]">已过期</Chip>
                      <span className="flex-1 truncate font-medium">{a.name}</span>
                      <span className="text-xs text-default-400">{a.provider || '-'}</span>
                    </div>
                  ))}
                  {serverHealth.trafficWarnings.slice(0, 3).map(a => (
                    <div key={`traf-${a.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-warning-50/40 dark:bg-warning-50/10 text-sm">
                      <Chip size="sm" variant="flat" color="warning" className="h-5 text-[10px]">流量</Chip>
                      <span className="flex-1 truncate font-medium">{a.name}</span>
                      <span className="text-xs font-mono text-warning">{a.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                  {serverHealth.expiringSoon.slice(0, 3).map(a => {
                    const days = Math.ceil(((a.expireDate || 0) - Date.now()) / 86400000);
                    return (
                      <div key={`soon-${a.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-warning-50/40 dark:bg-warning-50/10 text-sm">
                        <Chip size="sm" variant="flat" color="warning" className="h-5 text-[10px]">{days}天到期</Chip>
                        <span className="flex-1 truncate font-medium">{a.name}</span>
                        <span className="text-xs text-default-400">{a.provider || '-'}</span>
                      </div>
                    );
                  })}
                  {serverHealth.offlineNodes > 0 && (
                    <div className="flex items-center gap-3 rounded-lg px-3 py-2 bg-danger-50/40 dark:bg-danger-50/10 text-sm">
                      <Chip size="sm" variant="flat" color="danger" className="h-5 text-[10px]">离线</Chip>
                      <span className="flex-1 font-medium">{serverHealth.offlineNodes} 个探针节点离线</span>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          )}
        </>
      )}

      {/* ==================== Network Diagnosis Tab ==================== */}
      {activeTab === 'network' && (
        <>
          {!noData && trend.length > 0 && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <TrendChart data={trend} />
              <LatencyTrendChart data={trend} />
            </div>
          )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)]">
        <Card className="border border-default-200 shadow-sm">
          <CardHeader className="pb-0">
            <div>
              <p className="text-sm font-semibold text-foreground">节点实时流量</p>
              <p className="text-xs text-default-500">这里看节点侧瞬时上/下行速度和在线节点数。它解决的是 VPS 实时出口负载，不等于业务计费流量。</p>
            </div>
          </CardHeader>
          <CardBody className="space-y-4 pt-5">
            {canViewNodes ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-default-200 bg-default-50/70 px-4 py-3">
                    <p className="text-xs text-default-400">在线节点</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{nodeSummary.online}/{nodeSummary.total}</p>
                  </div>
                  <div className="rounded-2xl border border-default-200 bg-default-50/70 px-4 py-3">
                    <p className="text-xs text-default-400">当前总上行</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{formatSpeed(nodeSummary.uploadSpeed)}</p>
                  </div>
                  <div className="rounded-2xl border border-default-200 bg-default-50/70 px-4 py-3">
                    <p className="text-xs text-default-400">当前总下行</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{formatSpeed(nodeSummary.downloadSpeed)}</p>
                  </div>
                </div>

                {nodeTrafficSeries.length > 0 ? (
                  <div className="h-64 w-full rounded-[24px] border border-default-200 bg-[linear-gradient(180deg,rgba(37,99,235,0.08),rgba(255,255,255,0.96))] p-3 dark:bg-[linear-gradient(180deg,rgba(37,99,235,0.14),rgba(9,9,11,0.94))]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={nodeTrafficSeries}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="opacity-20" />
                        <XAxis dataKey="time" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
                        <YAxis tickFormatter={formatFlowAxis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="rounded-2xl border border-default-200 bg-white/95 p-3 shadow-lg dark:bg-default-100/95 text-sm">
                                <p className="font-semibold text-foreground">{label}</p>
                                <p className="mt-2 text-blue-500">上行: {formatSpeed(Number(payload.find((item) => item.dataKey === 'uploadSpeed')?.value || 0))}</p>
                                <p className="text-emerald-500">下行: {formatSpeed(Number(payload.find((item) => item.dataKey === 'downloadSpeed')?.value || 0))}</p>
                                <p className="mt-2 text-default-500">在线节点: {Number(payload.find((item) => item.dataKey === 'onlineNodes')?.value || 0)}</p>
                              </div>
                            );
                          }}
                        />
                        <Line type="monotone" dataKey="uploadSpeed" stroke="#2563eb" strokeWidth={2.2} dot={false} />
                        <Line type="monotone" dataKey="downloadSpeed" stroke="#10b981" strokeWidth={2.2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-default-300 bg-default-50/70 px-4 py-6 text-sm text-default-500">
                    节点实时数据还在等待 WebSocket 上报；如果长期为空，请先核对节点在线状态和节点与面板的 WebSocket 通道。
                  </div>
                )}

                <div className="grid gap-3">
                  {nodeSummary.busiestNodes.length > 0 ? nodeSummary.busiestNodes.map((node) => (
                    <div key={node.id} className="rounded-2xl border border-default-200 bg-white/80 px-4 py-3 shadow-sm dark:bg-black/20">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{node.name}</p>
                          <p className="mt-1 text-xs text-default-500">{node.connectionStatus === 'online' ? '在线' : '离线'} · 实时总吞吐 {formatSpeed((node.systemInfo?.uploadSpeed || 0) + (node.systemInfo?.downloadSpeed || 0))}</p>
                        </div>
                        <Chip size="sm" variant="flat" color={node.connectionStatus === 'online' ? 'success' : 'default'}>{node.connectionStatus === 'online' ? '在线' : '离线'}</Chip>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-default-300 bg-default-50/70 px-4 py-6 text-sm text-default-500">
                      当前没有可展示的节点实时样本。
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-default-300 bg-default-50/70 px-4 py-6 text-sm text-default-500">
                当前角色没有节点查看权限。你仍然可以继续查看下方的隧道、转发和诊断结果。
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="border border-default-200 shadow-sm">
          <CardHeader className="pb-0">
            <div>
              <p className="text-sm font-semibold text-foreground">隧道 / 转发累计流量</p>
              <p className="text-xs text-default-500">这里展示的是累计双向流量排行，不是 24 小时历史。当前系统能准确拿到累计值，但还没有每条隧道/转发的逐小时历史表。</p>
            </div>
          </CardHeader>
          <CardBody className="space-y-4 pt-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-default-200 bg-default-50/70 px-4 py-3">
                <p className="text-xs text-default-400">可见隧道</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{tunnelFlowData.length}</p>
              </div>
              <div className="rounded-2xl border border-default-200 bg-default-50/70 px-4 py-3">
                <p className="text-xs text-default-400">可见转发</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{forwardFlowData.length}</p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-[24px] border border-default-200 bg-white/80 p-3 shadow-sm dark:bg-black/20">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">隧道累计流量 Top</p>
                  <Chip size="sm" variant="flat" color="secondary">由转发累计值汇总</Chip>
                </div>
                {tunnelFlowData.length > 0 ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[...tunnelFlowData].reverse()} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="opacity-20" />
                        <XAxis type="number" tickFormatter={formatFlowAxis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const item: any = payload[0].payload;
                            return (
                              <div className="rounded-2xl border border-default-200 bg-white/95 p-3 shadow-lg dark:bg-default-100/95 text-sm">
                                <p className="font-semibold text-foreground">{item.name}</p>
                                <p className="mt-2 text-default-500">累计流量: {formatFlow(item.flow)}</p>
                                <p className="text-default-500">承载转发: {item.count}</p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="flow" radius={[0, 6, 6, 0]} fill="#8b5cf6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-default-300 bg-default-50/70 px-4 py-6 text-sm text-default-500">当前没有可展示的隧道流量。</div>
                )}
              </div>

              <div className="rounded-[24px] border border-default-200 bg-white/80 p-3 shadow-sm dark:bg-black/20">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">转发累计流量 Top</p>
                  <Chip size="sm" variant="flat" color="primary">按可见转发排序</Chip>
                </div>
                {forwardFlowData.length > 0 ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[...forwardFlowData].reverse()} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="opacity-20" />
                        <XAxis type="number" tickFormatter={formatFlowAxis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const item: any = payload[0].payload;
                            return (
                              <div className="rounded-2xl border border-default-200 bg-white/95 p-3 shadow-lg dark:bg-default-100/95 text-sm">
                                <p className="font-semibold text-foreground">{item.name}</p>
                                <p className="mt-2 text-default-500">累计流量: {formatFlow(item.flow)}</p>
                                <p className="text-default-500">所属隧道: {item.tunnelName}</p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="flow" radius={[0, 6, 6, 0]} fill="#2563eb" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-default-300 bg-default-50/70 px-4 py-6 text-sm text-default-500">当前没有可展示的转发流量。</div>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="border border-default-200 shadow-sm">
        <CardHeader className="pb-0">
          <div>
            <p className="text-sm font-semibold text-foreground">24 小时计费流量采样</p>
            <p className="text-xs text-default-500">这是 `statistics_flow` 的账户级整点增量采样。如果这里为空，问题通常不在前端，而在统计任务是否持续写入。</p>
          </div>
        </CardHeader>
        <CardBody className="space-y-4 pt-5">
          {hasBillingTraffic ? (
            <div className="h-64 w-full rounded-[24px] border border-default-200 bg-[linear-gradient(180deg,rgba(15,118,110,0.08),rgba(255,255,255,0.95))] p-3 dark:bg-[linear-gradient(180deg,rgba(15,118,110,0.14),rgba(9,9,11,0.92))]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={statisticsFlowData}>
                  <defs>
                    <linearGradient id="billingGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="opacity-20" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={18} />
                  <YAxis tickFormatter={formatFlowAxis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={60} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-2xl border border-default-200 bg-white/95 p-3 shadow-lg dark:bg-default-100/95 text-sm">
                          <p className="font-semibold text-foreground">{label}</p>
                          <p className="mt-2 text-default-500">整点增量: {formatFlow(Number(payload[0].value || 0))}</p>
                        </div>
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="flow" stroke="#0f766e" strokeWidth={2.2} fill="url(#billingGradient)" dot={false} />
                  <Line type="monotone" dataKey="flow" stroke="#0f766e" strokeWidth={2.2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-default-300 bg-default-50/70 px-4 py-6 text-sm text-default-500">
              最近 24 小时暂未采样到有效计费流量。若你确认业务有流量，这里长期为空，就应检查后台统计任务，而不是继续调图表样式。
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="border border-default-200 shadow-sm">
        <CardHeader className="pb-0">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between w-full">
            <div>
              <p className="text-sm font-semibold text-foreground">资源诊断列表</p>
              <p className="text-xs text-default-500">这里看单条资源的最新状态、链路详情和最近 10 次历史。</p>
            </div>
            <div className="flex flex-1 flex-col sm:flex-row items-center gap-3 lg:max-w-3xl">
              <Input
                value={searchQuery}
                onValueChange={setSearchQuery}
                placeholder="搜索名称..."
                startContent={
                  <svg className="w-4 h-4 text-default-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                }
                size="sm"
                variant="flat"
                radius="lg"
                className="w-full sm:max-w-[280px]"
                isClearable
                onClear={() => setSearchQuery('')}
              />

              <Tabs selectedKey={typeFilter} onSelectionChange={(key) => setTypeFilter(key as any)} size="sm" variant="bordered" radius="lg">
                <Tab key="all" title="全部" />
                <Tab key="tunnel" title="隧道" />
                <Tab key="forward" title="转发" />
              </Tabs>

              <Tabs selectedKey={filter} onSelectionChange={(key) => setFilter(key as any)} size="sm" variant="light" radius="lg" color={filter === 'fail' ? 'danger' : filter === 'success' ? 'success' : 'default'}>
                <Tab key="all" title="全部状态" />
                <Tab key="success" title="正常" />
                <Tab key="fail" title="异常" />
              </Tabs>
            </div>
          </div>
        </CardHeader>
        <CardBody className="space-y-4 pt-5">
          {filteredRecords.length > 0 ? (
            filteredRecords.map((record) => (
              <RecordRow key={`${record.targetType}-${record.targetId}`} record={record} />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-default-300 bg-default-50/70 px-4 py-10 text-center text-sm text-default-500">
              当前筛选条件下没有诊断记录。
            </div>
          )}
        </CardBody>
      </Card>
        </>
      )}

      {/* ==================== Server Health Tab ==================== */}
      {activeTab === 'server' && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard label="健康评分" value={`${serverHealth.score.toFixed(0)}`}
              subtitle={serverHealth.score >= 85 ? '状态良好' : serverHealth.score >= 60 ? '需要关注' : '需要处理'}
              tone={serverHealth.score >= 85 ? 'success' : serverHealth.score >= 60 ? 'warning' : 'danger'} />
            <StatCard label="探针在线率" value={serverHealth.probeNodeTotal > 0 ? `${((serverHealth.probeNodeOnline / serverHealth.probeNodeTotal) * 100).toFixed(0)}%` : '-'}
              subtitle={`${serverHealth.probeNodeOnline}/${serverHealth.probeNodeTotal} 在线`}
              tone={serverHealth.offlineNodes > 0 ? 'danger' : 'success'} />
            <StatCard label="探针实例" value={`${probeInstances.length}`}
              subtitle={probeInstances.map(i => i.type || 'probe').join(' + ') || '无'}
              tone="primary" />
            <StatCard label="服务器总数" value={`${assets.length}`}
              subtitle={`${serverHealth.noProbe.length} 无探针绑定`}
              tone={serverHealth.noProbe.length > 0 ? 'warning' : 'success'} />
          </div>

          {/* Probe instances */}
          <Card className="border border-default-200 shadow-sm">
            <CardBody className="p-4">
              <p className="text-sm font-semibold mb-3">探针实例状态</p>
              {probeInstances.length > 0 ? (
                <div className="space-y-2">
                  {probeInstances.map(inst => (
                    <div key={inst.id} className="flex items-center gap-3 rounded-lg border border-divider/60 px-4 py-3">
                      <Chip size="sm" variant="dot" color={inst.onlineNodeCount === inst.nodeCount ? 'success' : 'warning'} className="h-5 text-[10px]">
                        {inst.type || 'probe'}
                      </Chip>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{inst.name}</p>
                        <p className="text-xs text-default-400">{inst.baseUrl || '-'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-bold">{inst.onlineNodeCount}/{inst.nodeCount}</p>
                        <p className="text-[10px] text-default-400">在线/总数</p>
                      </div>
                      <Progress size="sm" value={inst.nodeCount ? (inst.onlineNodeCount || 0) / inst.nodeCount * 100 : 0}
                        color={inst.onlineNodeCount === inst.nodeCount ? 'success' : 'warning'} className="w-20" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-default-400 text-center py-6">暂无配置探针实例</p>
              )}
            </CardBody>
          </Card>

          {/* Offline nodes warning */}
          {serverHealth.offlineNodes > 0 && (
            <Card className="border border-danger/30 shadow-sm">
              <CardBody className="p-4">
                <p className="text-sm font-semibold text-danger mb-3">离线节点 ({serverHealth.offlineNodes})</p>
                <p className="text-sm text-default-500">
                  共有 {serverHealth.offlineNodes} 个探针节点处于离线状态。请检查对应服务器的探针进程和网络连接。
                </p>
              </CardBody>
            </Card>
          )}

          {/* Traffic warnings */}
          {serverHealth.trafficWarnings.length > 0 && (
            <Card className="border border-warning/30 shadow-sm">
              <CardBody className="p-4">
                <p className="text-sm font-semibold text-warning mb-3">流量配额预警 ({serverHealth.trafficWarnings.length})</p>
                <div className="space-y-2">
                  {serverHealth.trafficWarnings.map(a => (
                    <div key={a.id} className="flex items-center gap-3 text-sm">
                      <span className="w-36 truncate font-medium">{a.name}</span>
                      <Progress size="sm" value={Math.min(a.pct, 100)} color={a.pct >= 100 ? 'danger' : 'warning'} className="flex-1" />
                      <span className="text-xs font-mono w-24 text-right text-default-500">
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

          {/* No issues */}
          {serverHealth.offlineNodes === 0 && serverHealth.trafficWarnings.length === 0 && (
            <Card className="border border-success/30 shadow-sm">
              <CardBody className="flex items-center justify-center py-8 text-sm text-success gap-2">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                服务器和探针状态正常，无需处理
              </CardBody>
            </Card>
          )}
        </>
      )}

      {/* ==================== Asset Audit Tab ==================== */}
      {activeTab === 'audit' && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <StatCard label="已过期" value={`${serverHealth.expired.length}`}
              subtitle="需要续费或清理" tone={serverHealth.expired.length > 0 ? 'danger' : 'success'} />
            <StatCard label="即将到期" value={`${serverHealth.expiringSoon.length}`}
              subtitle="30天内到期" tone={serverHealth.expiringSoon.length > 0 ? 'warning' : 'success'} />
            <StatCard label="缺少地区" value={`${serverHealth.missingRegion.length}`}
              subtitle={`共 ${assets.length} 台`} tone={serverHealth.missingRegion.length > 0 ? 'warning' : 'success'} />
            <StatCard label="缺少供应商" value={`${serverHealth.missingProvider.length}`}
              subtitle={`共 ${assets.length} 台`} tone={serverHealth.missingProvider.length > 0 ? 'warning' : 'success'} />
            <StatCard label="未绑定探针" value={`${serverHealth.noProbe.length}`}
              subtitle="缺少监控覆盖" tone={serverHealth.noProbe.length > 0 ? 'warning' : 'success'} />
          </div>

          {/* Expired servers */}
          {serverHealth.expired.length > 0 && (
            <Card className="border border-danger/30 shadow-sm">
              <CardBody className="p-4">
                <p className="text-sm font-semibold text-danger mb-3">已过期服务器</p>
                <div className="space-y-1.5">
                  {serverHealth.expired.map(a => {
                    const days = Math.abs(Math.ceil((Date.now() - (a.expireDate || 0)) / 86400000));
                    return (
                      <div key={a.id} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-danger-50/40 dark:bg-danger-50/10 text-sm">
                        <span className="w-16 text-right font-mono font-bold text-danger">{days}天前</span>
                        <span className="flex-1 font-medium truncate">{a.name}</span>
                        {a.provider && <Chip size="sm" variant="flat" className="h-5 text-[10px]">{a.provider}</Chip>}
                        {a.region && <span className="text-xs text-default-400">{a.region}</span>}
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Expiring soon */}
          {serverHealth.expiringSoon.length > 0 && (
            <Card className="border border-warning/30 shadow-sm">
              <CardBody className="p-4">
                <p className="text-sm font-semibold text-warning mb-3">即将到期 (30天内)</p>
                <div className="space-y-1.5">
                  {serverHealth.expiringSoon.map(a => {
                    const days = Math.ceil(((a.expireDate || 0) - Date.now()) / 86400000);
                    return (
                      <div key={a.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${days <= 7 ? 'bg-danger-50/40 dark:bg-danger-50/10' : 'bg-warning-50/40 dark:bg-warning-50/10'}`}>
                        <span className={`w-16 text-right font-mono font-bold ${days <= 7 ? 'text-danger' : 'text-warning'}`}>{days}天</span>
                        <span className="flex-1 font-medium truncate">{a.name}</span>
                        {a.provider && <Chip size="sm" variant="flat" className="h-5 text-[10px]">{a.provider}</Chip>}
                        {a.monthlyCost && <span className="text-xs text-default-400 font-mono">{a.currency || ''}${a.monthlyCost}</span>}
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Missing data audit */}
          {(serverHealth.noProbe.length > 0 || serverHealth.missingRegion.length > 0 || serverHealth.missingProvider.length > 0 || serverHealth.missingCost.length > 0) && (
            <Card className="border border-default-200 shadow-sm">
              <CardBody className="p-4">
                <p className="text-sm font-semibold mb-3">数据完整性审计</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {serverHealth.noProbe.length > 0 && (
                    <div className="rounded-xl border border-warning/30 bg-warning-50/20 p-3">
                      <p className="text-xs font-bold text-warning uppercase tracking-wider">未绑定探针</p>
                      <p className="text-lg font-bold font-mono mt-1">{serverHealth.noProbe.length}</p>
                      <p className="text-[10px] text-default-400 mt-1 truncate">
                        {serverHealth.noProbe.slice(0, 3).map(a => a.name).join(', ')}
                        {serverHealth.noProbe.length > 3 && ` +${serverHealth.noProbe.length - 3}`}
                      </p>
                    </div>
                  )}
                  {serverHealth.missingRegion.length > 0 && (
                    <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                      <p className="text-xs font-bold text-default-400 uppercase tracking-wider">缺少地区</p>
                      <p className="text-lg font-bold font-mono mt-1">{serverHealth.missingRegion.length}</p>
                      <p className="text-[10px] text-default-400 mt-1 truncate">
                        {serverHealth.missingRegion.slice(0, 3).map(a => a.name).join(', ')}
                        {serverHealth.missingRegion.length > 3 && ` +${serverHealth.missingRegion.length - 3}`}
                      </p>
                    </div>
                  )}
                  {serverHealth.missingProvider.length > 0 && (
                    <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                      <p className="text-xs font-bold text-default-400 uppercase tracking-wider">缺少供应商</p>
                      <p className="text-lg font-bold font-mono mt-1">{serverHealth.missingProvider.length}</p>
                      <p className="text-[10px] text-default-400 mt-1 truncate">
                        {serverHealth.missingProvider.slice(0, 3).map(a => a.name).join(', ')}
                        {serverHealth.missingProvider.length > 3 && ` +${serverHealth.missingProvider.length - 3}`}
                      </p>
                    </div>
                  )}
                  {serverHealth.missingCost.length > 0 && (
                    <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                      <p className="text-xs font-bold text-default-400 uppercase tracking-wider">缺少成本</p>
                      <p className="text-lg font-bold font-mono mt-1">{serverHealth.missingCost.length}</p>
                      <p className="text-[10px] text-default-400 mt-1 truncate">
                        {serverHealth.missingCost.slice(0, 3).map(a => a.name).join(', ')}
                        {serverHealth.missingCost.length > 3 && ` +${serverHealth.missingCost.length - 3}`}
                      </p>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          )}

          {/* All clear */}
          {serverHealth.expired.length === 0 && serverHealth.expiringSoon.length === 0 &&
           serverHealth.noProbe.length === 0 && serverHealth.missingRegion.length === 0 && (
            <Card className="border border-success/30 shadow-sm">
              <CardBody className="flex items-center justify-center py-8 text-sm text-success gap-2">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                资产数据完整，无待处理问题
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
