import { useMemo } from 'react';

interface HealthGaugeProps {
  /** Score 0-100 */
  score: number;
  /** Diameter in px */
  size?: number;
  /** Stroke width in px */
  strokeWidth?: number;
  /** Label below score */
  label?: string;
  /** Sub-label below the main label */
  sublabel?: string;
  /** Click handler */
  onClick?: () => void;
}

const getColor = (score: number) => {
  if (score >= 90) return '#10b981'; // emerald-500
  if (score >= 70) return '#f59e0b'; // amber-500
  if (score >= 50) return '#f97316'; // orange-500
  return '#ef4444'; // red-500
};

const getTrackColor = (score: number) => {
  if (score >= 90) return 'rgba(16,185,129,0.12)';
  if (score >= 70) return 'rgba(245,158,11,0.12)';
  if (score >= 50) return 'rgba(249,115,22,0.12)';
  return 'rgba(239,68,68,0.12)';
};

const getStatusText = (score: number) => {
  if (score >= 90) return '健康';
  if (score >= 70) return '良好';
  if (score >= 50) return '风险';
  return '异常';
};

export default function HealthGauge({
  score,
  size = 120,
  strokeWidth = 8,
  label,
  sublabel,
  onClick,
}: HealthGaugeProps) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const color = useMemo(() => getColor(clampedScore), [clampedScore]);
  const trackColor = useMemo(() => getTrackColor(clampedScore), [clampedScore]);
  const statusText = label || getStatusText(clampedScore);

  const center = size / 2;
  const radius = (size - strokeWidth) / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedScore / 100) * circumference;

  return (
    <div
      className={`relative inline-flex flex-col items-center justify-center${onClick ? ' cursor-pointer' : ''}`}
      style={{ width: size, height: size + 32 }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <svg width={size} height={size} className="drop-shadow-sm">
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
        />
        {/* Score number */}
        <text
          x={center}
          y={center - 6}
          textAnchor="middle"
          dominantBaseline="central"
          className="font-mono"
          style={{ fontSize: size * 0.28, fontWeight: 800, fill: color }}
        >
          {Math.round(clampedScore)}
        </text>
        {/* Status text */}
        <text
          x={center}
          y={center + size * 0.16}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: size * 0.11, fontWeight: 600, fill: color, opacity: 0.85 }}
        >
          {statusText}
        </text>
      </svg>
      {sublabel && (
        <span className="mt-0.5 text-[10px] text-default-400 text-center leading-tight">{sublabel}</span>
      )}
    </div>
  );
}
