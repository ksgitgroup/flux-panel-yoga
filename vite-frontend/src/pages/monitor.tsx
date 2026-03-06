import { useState, useEffect, useCallback } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { Divider } from "@heroui/divider";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { ScrollShadow } from "@heroui/scroll-shadow";
import { Tabs, Tab } from "@heroui/tabs";
import toast from 'react-hot-toast';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { getDiagnosisSummary, getDiagnosisHistory, getDiagnosisTrend, runDiagnosisNow } from '@/api';
import { isAdmin } from '@/utils/auth';

// ─── 类型定义 ────────────────────────────────────────────
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
}

interface TrendPoint {
    time: number;
    hour: string;
    success: number;
    fail: number;
    total: number;
    avgLatency?: number;
}

// ─── 图标组件 ────────────────────────────────────────────
const HeartbeatIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
);

const RefreshIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
);

const PlayIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
);

const ChevronDownIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

// ─── 工具函数 ─────────────────────────────────────────────
const formatTime = (ts?: number) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('zh-CN', { hour12: false });
};

const formatRelativeTime = (ts?: number) => {
    if (!ts) return '—';
    const diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return `${Math.floor(diff / 86400000)} 天前`;
};

const parseResults = (resultsJson: string): ResultItem[] => {
    try {
        const data = JSON.parse(resultsJson);
        return Array.isArray(data?.results) ? data.results : [];
    } catch {
        return [];
    }
};

const getLatencyColor = (ms?: number) => {
    if (ms === undefined || ms === null || ms < 0) return 'text-gray-400';
    if (ms < 30) return 'text-emerald-500';
    if (ms < 50) return 'text-green-500';
    if (ms < 100) return 'text-blue-500';
    if (ms < 150) return 'text-yellow-500';
    if (ms < 200) return 'text-orange-500';
    return 'text-red-500';
};

const getLatencyLabel = (ms?: number) => {
    if (ms === undefined || ms === null || ms < 0) return '—';
    return `${ms.toFixed(1)}ms`;
};

// ─── 统计卡组件 ──────────────────────────────────────────
const StatCard = ({ label, value, subtitle, icon, color, bgColor }: {
    label: string; value: number | string; subtitle?: string;
    icon: React.ReactNode; color: string; bgColor: string;
}) => (
    <Card className="border border-gray-200 dark:border-default-200 shadow-md hover:shadow-lg transition-shadow">
        <CardBody className="p-4">
            <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
                </div>
                <div className={`p-2 rounded-xl ${bgColor}`}>{icon}</div>
            </div>
        </CardBody>
    </Card>
);

// ─── 单条诊断记录行 ───────────────────────────────────────
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
                limit: 10
            });
            if (resp.code === 0) setHistory(resp.data || []);
        } catch {
            /* silent */
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleExpand = () => {
        if (!expanded) loadHistory();
        setExpanded(!expanded);
    };

    const openDetail = (r: DiagnosisRecord) => {
        setSelectedRecord(r);
        setDetailOpen(true);
    };

    const results = parseResults(record.resultsJson);
    const latency = record.averageTime ?? (results.length > 0 && results[0]?.averageTime > 0 ? results[0].averageTime : undefined);

    return (
        <>
            <div className={`border rounded-xl transition-all duration-200 ${record.overallSuccess
                ? 'border-success-200 dark:border-success-700/40 bg-success-50/30 dark:bg-success-900/10'
                : 'border-danger-200 dark:border-danger-700/40 bg-danger-50/30 dark:bg-danger-900/10'
                }`}>
                {/* 主行 */}
                <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
                    onClick={handleExpand}
                >
                    {/* 状态灯 */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${record.overallSuccess ? 'bg-success-500' : 'bg-danger-500 animate-pulse'
                        }`} />

                    {/* 类型标签 */}
                    <Chip
                        size="sm"
                        variant="flat"
                        color={record.targetType === 'tunnel' ? 'secondary' : 'primary'}
                        className="text-xs flex-shrink-0"
                    >
                        {record.targetType === 'tunnel' ? '隧道' : '转发'}
                    </Chip>

                    {/* 名称 */}
                    <span className="font-medium text-sm flex-1 truncate">{record.targetName}</span>

                    {/* 延迟 */}
                    <span className={`text-xs font-mono flex-shrink-0 ${getLatencyColor(latency)}`}>
                        {getLatencyLabel(latency)}
                    </span>

                    {/* 状态 */}
                    <Chip size="sm" color={record.overallSuccess ? 'success' : 'danger'} variant="flat">
                        {record.overallSuccess ? '正常' : '异常'}
                    </Chip>

                    {/* 链路摘要 */}
                    {results.length > 0 && (
                        <span className="text-xs text-gray-500 hidden sm:block flex-shrink-0">
                            {results.filter(r => r.success).length}/{results.length}
                        </span>
                    )}

                    {/* 时间 */}
                    <span className="text-xs text-gray-400 hidden md:block flex-shrink-0">
                        {formatRelativeTime(record.createdTime)}
                    </span>

                    {/* 展开箭头 */}
                    <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''
                        }`} />
                </div>

                {/* 展开区：TCP Ping 详情 */}
                {expanded && (
                    <div className="px-4 pb-3">
                        <Divider className="mb-3" />
                        {/* 最新诊断链路 */}
                        <div className="mb-3">
                            <p className="text-xs font-semibold text-gray-500 mb-2">最新诊断详情</p>
                            <div className="space-y-1">
                                {results.map((r, i) => (
                                    <div key={i}
                                        className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${r.success
                                            ? 'bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-400'
                                            : 'bg-danger-50 dark:bg-danger-900/20 text-danger-700 dark:text-danger-400'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{r.description}</span>
                                            <span className="text-gray-400 hidden sm:inline">
                                                {r.nodeName} → {r.targetIp}:{r.targetPort}
                                            </span>
                                        </div>
                                        <span className="ml-2 flex-shrink-0 font-mono">
                                            {r.success
                                                ? `✓ ${r.averageTime > 0 ? r.averageTime.toFixed(1) + 'ms' : 'OK'}${r.packetLoss > 0 ? ` | ${r.packetLoss.toFixed(1)}%丢包` : ''}`
                                                : `✗ ${r.message || '失败'}`}
                                        </span>
                                    </div>
                                ))}
                                {results.length === 0 && (
                                    <p className="text-xs text-gray-400">暂无详细诊断数据</p>
                                )}
                            </div>
                        </div>

                        {/* 历史记录 */}
                        <p className="text-xs font-semibold text-gray-500 mb-2">最近 10 次历史</p>
                        {historyLoading ? (
                            <div className="flex justify-center py-2"><Spinner size="sm" /></div>
                        ) : (
                            <div className="flex flex-wrap gap-1.5">
                                {history.map((h) => (
                                    <button
                                        key={h.id}
                                        onClick={() => openDetail(h)}
                                        title={`${formatTime(h.createdTime)}${h.averageTime && h.averageTime > 0 ? ` · ${h.averageTime.toFixed(1)}ms` : ''}`}
                                        className={`w-7 h-7 rounded-md transition-all hover:scale-110 flex items-center justify-center text-white text-[10px] font-mono ${h.overallSuccess
                                            ? 'bg-success-400 dark:bg-success-600'
                                            : 'bg-danger-400 dark:bg-danger-600'
                                            }`}
                                    >
                                        {h.averageTime && h.averageTime > 0 ? Math.round(h.averageTime) : (h.overallSuccess ? '✓' : '✗')}
                                    </button>
                                ))}
                                {history.length === 0 && (
                                    <p className="text-xs text-gray-400">暂无历史数据</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 详情 Modal */}
            <Modal isOpen={detailOpen} onClose={() => setDetailOpen(false)} size="md">
                <ModalContent>
                    <ModalHeader className="flex flex-col gap-1">
                        诊断详情 — {selectedRecord?.targetName}
                        <p className="text-xs font-normal text-gray-500">{formatTime(selectedRecord?.createdTime)}</p>
                    </ModalHeader>
                    <ModalBody>
                        {selectedRecord && parseResults(selectedRecord.resultsJson).map((r, i) => (
                            <div key={i}
                                className={`flex flex-col gap-1 p-3 rounded-xl ${r.success
                                    ? 'bg-success-50 dark:bg-success-900/20'
                                    : 'bg-danger-50 dark:bg-danger-900/20'
                                    }`}
                            >
                                <div className="flex justify-between items-center">
                                    <span className="font-semibold text-sm">{r.description}</span>
                                    <Chip size="sm" color={r.success ? 'success' : 'danger'} variant="flat">
                                        {r.success ? '正常' : '失败'}
                                    </Chip>
                                </div>
                                <p className="text-xs text-gray-500">
                                    节点: {r.nodeName} → {r.targetIp}:{r.targetPort}
                                </p>
                                {r.success && r.averageTime > 0 && (
                                    <p className="text-xs">平均延迟: <span className="font-medium">{r.averageTime.toFixed(2)} ms</span>
                                        {' | '}丢包率: <span className="font-medium">{r.packetLoss.toFixed(1)}%</span>
                                    </p>
                                )}
                                {!r.success && (
                                    <p className="text-xs text-danger-600 dark:text-danger-400">{r.message}</p>
                                )}
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

// ─── 趋势图组件 ──────────────────────────────────────────
const TrendChart = ({ data }: { data: TrendPoint[] }) => {
    if (!data || data.length === 0) return null;

    return (
        <Card className="border border-gray-200 dark:border-default-200 shadow-md">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                        <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
                    </svg>
                    <h2 className="text-base font-semibold">24 小时健康趋势</h2>
                    <div className="flex items-center gap-3 ml-auto text-xs">
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded-sm bg-emerald-400/80"></span> 成功
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded-sm bg-red-400/80"></span> 失败
                        </span>
                    </div>
                </div>
            </CardHeader>
            <CardBody className="pt-0">
                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} barGap={0} barCategoryGap="20%">
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis
                                dataKey="hour"
                                tick={{ fontSize: 11 }}
                                tickLine={false}
                                axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
                                interval={2}
                            />
                            <YAxis
                                tick={{ fontSize: 11 }}
                                tickLine={false}
                                axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
                                allowDecimals={false}
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        const successVal = payload.find(p => p.dataKey === 'success')?.value || 0;
                                        const failVal = payload.find(p => p.dataKey === 'fail')?.value || 0;
                                        return (
                                            <div className="bg-white dark:bg-default-100 border border-default-200 rounded-lg shadow-lg p-3 text-sm">
                                                <p className="font-medium mb-1">{label}</p>
                                                <p className="text-emerald-600">✓ 成功: {String(successVal)}</p>
                                                <p className="text-red-500">✗ 失败: {String(failVal)}</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Bar dataKey="success" fill="#34d399" radius={[2, 2, 0, 0]} opacity={0.85} />
                            <Bar dataKey="fail" fill="#f87171" radius={[2, 2, 0, 0]} opacity={0.85} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardBody>
        </Card>
    );
};

// ─── 延迟趋势图组件 ──────────────────────────────────────
const LatencyTrendChart = ({ data }: { data: TrendPoint[] }) => {
    const filteredData = data.filter(d => d.avgLatency !== undefined && d.avgLatency !== null);
    if (filteredData.length === 0) return null;

    return (
        <Card className="border border-gray-200 dark:border-default-200 shadow-md">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <h2 className="text-base font-semibold">平均延迟趋势</h2>
                </div>
            </CardHeader>
            <CardBody className="pt-0">
                <div className="h-40 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis
                                dataKey="hour"
                                tick={{ fontSize: 11 }}
                                tickLine={false}
                                axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
                                interval={2}
                            />
                            <YAxis
                                tick={{ fontSize: 11 }}
                                tickLine={false}
                                axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
                                tickFormatter={(v) => `${v}ms`}
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length && payload[0].value !== undefined) {
                                        return (
                                            <div className="bg-white dark:bg-default-100 border border-default-200 rounded-lg shadow-lg p-3 text-sm">
                                                <p className="font-medium">{label}</p>
                                                <p className="text-blue-500">延迟: {Number(payload[0].value).toFixed(1)}ms</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <defs>
                                <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                                </linearGradient>
                            </defs>
                            <Area
                                type="monotone"
                                dataKey="avgLatency"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fill="url(#latencyGradient)"
                                dot={false}
                                activeDot={{ r: 4, stroke: '#3b82f6', strokeWidth: 2, fill: '#fff' }}
                                connectNulls
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardBody>
        </Card>
    );
};

// ─── 主页面 ───────────────────────────────────────────────
export default function MonitorPage() {
    const [summary, setSummary] = useState<SummaryData | null>(null);
    const [trend, setTrend] = useState<TrendPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [triggering, setTriggering] = useState(false);
    const [filter, setFilter] = useState<'all' | 'success' | 'fail'>('all');
    const [typeFilter, setTypeFilter] = useState<'all' | 'tunnel' | 'forward'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const admin = isAdmin();

    const loadSummary = useCallback(async () => {
        try {
            const [summaryResp, trendResp] = await Promise.all([
                getDiagnosisSummary(),
                getDiagnosisTrend({ hours: 24 })
            ]);
            if (summaryResp.code === 0) setSummary(summaryResp.data);
            if (trendResp.code === 0) setTrend(trendResp.data || []);
        } catch {
            /* silent */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSummary();
        const timer = setInterval(loadSummary, 60_000);
        return () => clearInterval(timer);
    }, [loadSummary]);

    const handleRunNow = async () => {
        if (!admin) return;
        setTriggering(true);
        try {
            const resp = await runDiagnosisNow();
            if (resp.code === 0) {
                toast.success('诊断任务已启动，约10-30秒后自动刷新');
                // 分批刷新以捕获进度
                setTimeout(loadSummary, 8000);
                setTimeout(loadSummary, 20000);
                setTimeout(loadSummary, 35000);
            } else {
                toast.error(resp.msg || '启动失败');
            }
        } catch {
            toast.error('请求失败');
        } finally {
            setTriggering(false);
        }
    };

    const filteredRecords = (summary?.records || []).filter(r => {
        if (filter === 'success' && !r.overallSuccess) return false;
        if (filter === 'fail' && r.overallSuccess) return false;
        if (typeFilter !== 'all' && r.targetType !== typeFilter) return false;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            return r.targetName.toLowerCase().includes(q);
        }
        return true;
    });

    // 分类统计
    const tunnelRecords = (summary?.records || []).filter(r => r.targetType === 'tunnel');
    const forwardRecords = (summary?.records || []).filter(r => r.targetType === 'forward');
    const tunnelFails = tunnelRecords.filter(r => !r.overallSuccess).length;
    const forwardFails = forwardRecords.filter(r => !r.overallSuccess).length;

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Spinner size="lg" label="加载诊断数据中..." />
            </div>
        );
    }

    const noData = !summary || summary.totalCount === 0;
    const healthRate = summary && summary.totalCount > 0
        ? Math.round((summary.successCount / summary.totalCount) * 100)
        : 0;

    return (
        <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-5">
            {/* 标题栏 */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <HeartbeatIcon className="w-7 h-7 text-primary" />
                    <div>
                        <h1 className="text-xl lg:text-2xl font-bold">诊断看板</h1>
                        <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400">
                            实时监控所有隧道和转发的连通状态
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="bordered"
                        startContent={<RefreshIcon className="w-4 h-4" />}
                        onPress={loadSummary}
                        size="sm"
                    >
                        刷新
                    </Button>
                    {admin && (
                        <Button
                            color="primary"
                            startContent={<PlayIcon className="w-3.5 h-3.5" />}
                            onPress={handleRunNow}
                            isLoading={triggering}
                            size="sm"
                        >
                            立即诊断
                        </Button>
                    )}
                </div>
            </div>

            {/* 统计卡 */}
            {!noData && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <StatCard
                        label="健康率"
                        value={`${healthRate}%`}
                        subtitle={`${summary!.successCount}/${summary!.totalCount} 通过`}
                        color={healthRate >= 90 ? 'text-emerald-600' : healthRate >= 70 ? 'text-yellow-600' : 'text-red-600'}
                        bgColor={healthRate >= 90 ? 'bg-emerald-100 dark:bg-emerald-500/20' : healthRate >= 70 ? 'bg-yellow-100 dark:bg-yellow-500/20' : 'bg-red-100 dark:bg-red-500/20'}
                        icon={
                            <svg className={`w-5 h-5 ${healthRate >= 90 ? 'text-emerald-600' : healthRate >= 70 ? 'text-yellow-600' : 'text-red-600'}`} fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                        }
                    />
                    <StatCard
                        label="隧道"
                        value={`${tunnelRecords.length - tunnelFails}/${tunnelRecords.length}`}
                        subtitle={tunnelFails > 0 ? `${tunnelFails} 异常` : '全部正常'}
                        color={tunnelFails > 0 ? 'text-red-600' : 'text-purple-600'}
                        bgColor="bg-purple-100 dark:bg-purple-500/20"
                        icon={
                            <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                            </svg>
                        }
                    />
                    <StatCard
                        label="转发"
                        value={`${forwardRecords.length - forwardFails}/${forwardRecords.length}`}
                        subtitle={forwardFails > 0 ? `${forwardFails} 异常` : '全部正常'}
                        color={forwardFails > 0 ? 'text-red-600' : 'text-blue-600'}
                        bgColor="bg-blue-100 dark:bg-blue-500/20"
                        icon={
                            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        }
                    />
                    <StatCard
                        label="平均延迟"
                        value={summary!.avgLatency !== null && summary!.avgLatency !== undefined ? `${summary!.avgLatency}ms` : '—'}
                        subtitle="所有链路均值"
                        color={getLatencyColor(summary!.avgLatency ?? undefined)}
                        bgColor="bg-orange-100 dark:bg-orange-500/20"
                        icon={
                            <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        }
                    />
                    <StatCard
                        label="上次诊断"
                        value={formatRelativeTime(summary!.lastRunTime)}
                        subtitle={formatTime(summary!.lastRunTime)}
                        color="text-gray-700 dark:text-gray-300"
                        bgColor="bg-gray-100 dark:bg-gray-500/20"
                        icon={
                            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                            </svg>
                        }
                    />
                </div>
            )}

            {/* 趋势图区域 */}
            {!noData && trend.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <TrendChart data={trend} />
                    <LatencyTrendChart data={trend} />
                </div>
            )}

            {/* 列表区 */}
            <Card className="shadow-md border border-gray-200 dark:border-default-200">
                <CardHeader className="pb-0 pt-4 px-4">
                    <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center w-full gap-4 p-3 bg-default-50/50 dark:bg-default-100/20 rounded-2xl border border-divider shadow-sm backdrop-blur-md">
                        <div className="flex flex-1 flex-col sm:flex-row items-center gap-3">
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
                                className="w-full sm:max-w-[300px]"
                                isClearable
                                onClear={() => setSearchQuery("")}
                            />

                            <Tabs
                                selectedKey={typeFilter}
                                onSelectionChange={(key) => setTypeFilter(key as any)}
                                size="sm"
                                variant="solid"
                                radius="lg"
                                classNames={{
                                    tabList: "bg-default-100 dark:bg-default-200 p-1",
                                    cursor: "bg-white dark:bg-default-500 shadow-sm",
                                    tab: "h-8 px-4",
                                }}
                            >
                                <Tab key="all" title="全部" />
                                <Tab key="tunnel" title="隧道" />
                                <Tab key="forward" title="转发" />
                            </Tabs>

                            <Divider orientation="vertical" className="h-6 hidden sm:block" />

                            <Tabs
                                selectedKey={filter}
                                onSelectionChange={(key) => setFilter(key as any)}
                                size="sm"
                                variant="light"
                                radius="lg"
                                color={filter === 'fail' ? 'danger' : filter === 'success' ? 'success' : 'default'}
                            >
                                <Tab key="all" title="全部状态" />
                                <Tab key="success" title="正常" />
                                <Tab key="fail" title="异常" />
                            </Tabs>
                        </div>

                        <div className="flex items-center gap-3 px-2">
                            {(searchQuery !== "" || typeFilter !== 'all' || filter !== 'all') && (
                                <Button
                                    size="sm"
                                    variant="light"
                                    color="danger"
                                    onPress={() => {
                                        setSearchQuery("");
                                        setTypeFilter('all');
                                        setFilter('all');
                                    }}
                                    className="text-xs"
                                >
                                    重置
                                </Button>
                            )}
                            <div className="text-xs text-default-400 font-medium whitespace-nowrap">
                                共 {filteredRecords.length} 项
                            </div>
                        </div>
                    </div>

                </CardHeader>

                <Divider />

                <CardBody>
                    {noData ? (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                            <HeartbeatIcon className="w-16 h-16 mb-4 opacity-30" />
                            <p className="text-lg font-medium mb-2">暂无诊断数据</p>
                            <p className="text-sm mb-6">
                                请在「网站配置」中启用自动诊断，或点击"立即诊断"手动触发
                            </p>
                            {admin && (
                                <Button color="primary" onPress={handleRunNow} isLoading={triggering}
                                    startContent={<PlayIcon className="w-4 h-4" />}>
                                    立即诊断
                                </Button>
                            )}
                        </div>
                    ) : (
                        <ScrollShadow className="max-h-[55vh]">
                            <div className="space-y-2 pr-1">
                                {filteredRecords.length > 0
                                    ? filteredRecords.map((r) => (
                                        <RecordRow key={`${r.targetType}_${r.targetId}`} record={r} />
                                    ))
                                    : (
                                        <p className="text-sm text-center text-gray-400 py-8">
                                            {filter === 'fail' ? '没有异常记录 🎉' : '没有满足条件的记录'}
                                        </p>
                                    )
                                }
                            </div>
                        </ScrollShadow>
                    )}
                </CardBody>
            </Card>

            {/* 底部提示 */}
            {!noData && (
                <p className="text-xs text-center text-gray-400">
                    看板每 60 秒自动刷新 · 诊断间隔可在「网站配置 → 自动诊断」中设置
                </p>
            )}
        </div>
    );
}
