import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { Divider } from "@heroui/divider";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { ScrollShadow } from "@heroui/scroll-shadow";
import toast from 'react-hot-toast';
import { getDiagnosisSummary, getDiagnosisHistory, runDiagnosisNow } from '@/api';
import { isAdmin } from '@/utils/auth';

// ─── 类型定义 ────────────────────────────────────────────
interface DiagnosisRecord {
    id: number;
    targetType: 'tunnel' | 'forward';
    targetId: number;
    targetName: string;
    overallSuccess: boolean;
    resultsJson: string;
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
    lastRunTime?: number;
    records: DiagnosisRecord[];
}

// ─── 图标 ────────────────────────────────────────────────
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

const parseResults = (resultsJson: string): ResultItem[] => {
    try {
        const data = JSON.parse(resultsJson);
        return Array.isArray(data?.results) ? data.results : [];
    } catch {
        return [];
    }
};

// ─── 统计卡组件 ──────────────────────────────────────────
const StatCard = ({ label, value, color }: { label: string; value: number | string; color: string }) => (
    <Card className="flex-1 min-w-[140px]">
        <CardBody className="py-4 px-5">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
        </CardBody>
    </Card>
);

// ─── 单条诊断记录行 ───────────────────────────────────────
const RecordRow = ({ record, adminMode }: { record: DiagnosisRecord; adminMode: boolean }) => {
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

                    {/* 状态 */}
                    <Chip size="sm" color={record.overallSuccess ? 'success' : 'danger'} variant="flat">
                        {record.overallSuccess ? '正常' : '异常'}
                    </Chip>

                    {/* 延迟摘要 */}
                    {results.length > 0 && (
                        <span className="text-xs text-gray-500 hidden sm:block">
                            {results.filter(r => r.success).length}/{results.length} 链路正常
                            {results[0]?.averageTime > 0 && ` · ${results[0].averageTime.toFixed(1)}ms`}
                        </span>
                    )}

                    {/* 时间 */}
                    <span className="text-xs text-gray-400 hidden md:block flex-shrink-0">
                        {formatTime(record.createdTime)}
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
                                        className={`flex items-center justify-between text-xs px-3 py-1.5 rounded-lg ${r.success
                                                ? 'bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-400'
                                                : 'bg-danger-50 dark:bg-danger-900/20 text-danger-700 dark:text-danger-400'
                                            }`}
                                    >
                                        <span className="font-medium">{r.description}</span>
                                        <span className="ml-2 flex-shrink-0">
                                            {r.success
                                                ? `✓ ${r.averageTime > 0 ? r.averageTime.toFixed(1) + 'ms' : 'OK'}`
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
                                        title={formatTime(h.createdTime)}
                                        className={`w-6 h-6 rounded-md transition-all hover:scale-110 ${h.overallSuccess
                                                ? 'bg-success-400 dark:bg-success-600'
                                                : 'bg-danger-400 dark:bg-danger-600'
                                            }`}
                                    />
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

// ─── 主页面 ───────────────────────────────────────────────
export default function MonitorPage() {
    const [summary, setSummary] = useState<SummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [triggering, setTriggering] = useState(false);
    const [filter, setFilter] = useState<'all' | 'success' | 'fail'>('all');
    const admin = isAdmin();

    const loadSummary = useCallback(async () => {
        try {
            const resp = await getDiagnosisSummary();
            if (resp.code === 0) setSummary(resp.data);
        } catch {
            /* silent */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSummary();
        // 每 60 秒自动刷新
        const timer = setInterval(loadSummary, 60_000);
        return () => clearInterval(timer);
    }, [loadSummary]);

    const handleRunNow = async () => {
        if (!admin) return;
        setTriggering(true);
        try {
            const resp = await runDiagnosisNow();
            if (resp.code === 0) {
                toast.success('诊断任务已启动，请稍后刷新查看结果');
                setTimeout(loadSummary, 5000);
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
        if (filter === 'success') return r.overallSuccess;
        if (filter === 'fail') return !r.overallSuccess;
        return true;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Spinner size="lg" label="加载诊断数据中..." />
            </div>
        );
    }

    const noData = !summary || summary.totalCount === 0;

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            {/* 标题栏 */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <HeartbeatIcon className="w-8 h-8 text-primary" />
                    <div>
                        <h1 className="text-2xl font-bold">诊断看板</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
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
                            startContent={<PlayIcon className="w-4 h-4" />}
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
                <div className="flex gap-4 flex-wrap">
                    <StatCard label="监控对象" value={summary!.totalCount} color="text-primary" />
                    <StatCard label="正常" value={summary!.successCount} color="text-success-600" />
                    <StatCard label="异常" value={summary!.failCount}
                        color={summary!.failCount > 0 ? 'text-danger-600' : 'text-gray-400'} />
                    <Card className="flex-1 min-w-[140px]">
                        <CardBody className="py-4 px-5">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">上次诊断</p>
                            <p className="text-sm font-medium">{formatTime(summary!.lastRunTime)}</p>
                        </CardBody>
                    </Card>
                </div>
            )}

            {/* 内容区 */}
            <Card className="shadow-md">
                <CardHeader className="pb-3">
                    <div className="flex justify-between items-center w-full flex-wrap gap-2">
                        <h2 className="text-lg font-semibold">最新状态</h2>
                        {!noData && (
                            <div className="flex gap-1">
                                {(['all', 'success', 'fail'] as const).map((f) => (
                                    <Button
                                        key={f}
                                        size="sm"
                                        variant={filter === f ? 'solid' : 'bordered'}
                                        color={f === 'success' ? 'success' : f === 'fail' ? 'danger' : 'default'}
                                        onPress={() => setFilter(f)}
                                        className="min-w-0"
                                    >
                                        {f === 'all' ? '全部' : f === 'success' ? '正常' : '异常'}
                                    </Button>
                                ))}
                            </div>
                        )}
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
                        <ScrollShadow className="max-h-[60vh]">
                            <div className="space-y-2 pr-1">
                                {filteredRecords.length > 0
                                    ? filteredRecords.map((r) => (
                                        <RecordRow key={`${r.targetType}_${r.targetId}`} record={r} adminMode={admin} />
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
