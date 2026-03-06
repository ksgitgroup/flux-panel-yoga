import { Chip } from "@heroui/chip";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

export interface DiagnosisHistoryItem {
    id: number;
    overallSuccess: boolean;
    resultsJson?: string;
    averageTime?: number;
    packetLoss?: number;
    createdTime: number;
}

interface SpeedBadgeProps {
    averageTime?: number;
    packetLoss?: number;
    overallSuccess?: boolean;
    compact?: boolean;
    history?: DiagnosisHistoryItem[];
    label?: string;
}

/**
 * 测速徽章组件 - 在转发/隧道卡片上直观显示最新诊断结果，支持历史趋势可视化
 */
export function SpeedBadge({ averageTime, packetLoss, overallSuccess, compact = false, history = [], label: customLabel }: SpeedBadgeProps) {
    // 基础徽章渲染逻辑
    const renderBadge = () => {
        if (overallSuccess === undefined && averageTime === undefined) {
            return (
                <Chip size="sm" variant="flat" color="default" className="text-[10px] h-5 px-1.5 cursor-help">
                    未检测
                </Chip>
            );
        }

        if (overallSuccess === false) {
            return (
                <Chip size="sm" variant="flat" color="danger" className="text-[10px] h-5 px-1.5 cursor-help">
                    ✗ 异常
                </Chip>
            );
        }

        if (averageTime !== undefined && averageTime >= 0) {
            const { color } = getLatencyInfo(averageTime);
            return (
                <Chip size="sm" variant="flat" color={color as any} className="text-[10px] h-5 px-1.5 font-mono cursor-help">
                    {Math.round(averageTime)}ms
                </Chip>
            );
        }

        return (
            <Chip size="sm" variant="flat" color="success" className="text-[10px] h-5 px-1.5 cursor-help">
                ✓ 正常
            </Chip>
        );
    };

    // 迷你趋势图 (Sparkline)
    const renderSparkline = () => {
        if (!history || history.length < 2) return null;

        // 提取最近 10 次的延迟数据进行展示
        const chartData = history.slice(0, 10).reverse().map(h => ({
            value: h.averageTime || 0,
            success: h.overallSuccess
        }));

        return (
            <div className="flex items-end gap-0.5 h-4 ml-1.5" title="最近测速趋势">
                {chartData.map((d, i) => (
                    <div
                        key={i}
                        className={`w-1 rounded-t-[1px] ${d.success ? 'bg-success/40' : 'bg-danger/40'}`}
                        style={{ height: d.success ? `${Math.min(100, (d.value / 200) * 100)}%` : '100%' }}
                    />
                ))}
            </div>
        );
    };

    const displayLabel = customLabel || (averageTime !== undefined ? getLatencyInfo(averageTime).label : "");

    return (
        <Popover placement="top" showArrow backdrop="opaque" classNames={{ content: "p-0" }}>
            <PopoverTrigger>
                <div className="inline-flex items-center group cursor-pointer">
                    <div className="transition-transform group-hover:scale-105">
                        {renderBadge()}
                    </div>
                    {!compact && renderSparkline()}
                    {!compact && packetLoss !== undefined && packetLoss > 0 && (
                        <span className="text-[10px] text-danger-500 ml-1.5 font-medium">{packetLoss.toFixed(0)}%丢包</span>
                    )}
                    {!compact && displayLabel && (
                        <span className="text-[10px] text-default-400 ml-1.5">{displayLabel}</span>
                    )}
                </div>
            </PopoverTrigger>
            <PopoverContent>
                <div className="px-3 py-3 w-64">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-bold">测速历史趋势 (ms)</span>
                        <Chip size="sm" variant="dot" color={overallSuccess ? "success" : "danger"} className="text-[10px] border-none px-0 h-4">
                            {overallSuccess ? "当前正常" : "当前异常"}
                        </Chip>
                    </div>

                    {history && history.length > 0 ? (
                        <div className="h-24 w-full mb-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={[...history].reverse()}>
                                    <defs>
                                        <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#006FEE" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#006FEE" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <Area
                                        type="monotone"
                                        dataKey="averageTime"
                                        stroke="#006FEE"
                                        fillOpacity={1}
                                        fill="url(#colorLatency)"
                                        strokeWidth={1.5}
                                        isAnimationActive={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-24 flex items-center justify-center text-default-400 text-xs italic">
                            暂无更多历史数据
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 mt-2 border-t border-divider pt-2">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-default-400">平均延迟</span>
                            <span className="text-xs font-mono font-bold">{averageTime?.toFixed(1) || '--'}ms</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-default-400">丢包率</span>
                            <span className="text-xs font-mono font-bold">{packetLoss?.toFixed(1) || '0'}%</span>
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function getLatencyInfo(ms: number): { color: string; label: string } {
    if (ms < 30) return { color: 'success', label: '极佳' };
    if (ms < 60) return { color: 'success', label: '良好' };
    if (ms < 120) return { color: 'primary', label: '普通' };
    if (ms < 200) return { color: 'warning', label: '一般' };
    if (ms < 350) return { color: 'warning', label: '较差' };
    return { color: 'danger', label: '极差' };
}
