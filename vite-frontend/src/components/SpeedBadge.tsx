import { Chip } from "@heroui/chip";

interface SpeedBadgeProps {
    averageTime?: number;
    packetLoss?: number;
    overallSuccess?: boolean;
    compact?: boolean;
}

/**
 * 测速徽章组件 - 在转发/隧道卡片上直观显示最新诊断结果
 */
export function SpeedBadge({ averageTime, packetLoss, overallSuccess, compact = false }: SpeedBadgeProps) {
    // 无数据
    if (overallSuccess === undefined && averageTime === undefined) {
        return (
            <Chip size="sm" variant="flat" color="default" className="text-xs">
                未检测
            </Chip>
        );
    }

    // 失败状态
    if (overallSuccess === false) {
        return (
            <Chip size="sm" variant="flat" color="danger" className="text-xs">
                ✗ 异常
            </Chip>
        );
    }

    // 成功状态 - 显示延迟
    if (averageTime !== undefined && averageTime >= 0) {
        const { color, label } = getLatencyInfo(averageTime);
        if (compact) {
            return (
                <Chip size="sm" variant="flat" color={color as any} className="text-xs font-mono">
                    {Math.round(averageTime)}ms
                </Chip>
            );
        }
        return (
            <div className="flex items-center gap-1.5">
                <Chip size="sm" variant="flat" color={color as any} className="text-xs font-mono">
                    {Math.round(averageTime)}ms
                </Chip>
                {packetLoss !== undefined && packetLoss > 0 && (
                    <span className="text-xs text-warning-500">{packetLoss.toFixed(1)}%丢包</span>
                )}
                <span className="text-xs text-default-400">{label}</span>
            </div>
        );
    }

    // 成功但无延迟数据
    return (
        <Chip size="sm" variant="flat" color="success" className="text-xs">
            ✓ 正常
        </Chip>
    );
}

function getLatencyInfo(ms: number): { color: string; label: string } {
    if (ms < 30) return { color: 'success', label: '优秀' };
    if (ms < 50) return { color: 'success', label: '良好' };
    if (ms < 100) return { color: 'primary', label: '正常' };
    if (ms < 150) return { color: 'warning', label: '一般' };
    if (ms < 200) return { color: 'warning', label: '较差' };
    return { color: 'danger', label: '差' };
}
