import type { ReleasePriority } from './demo-types';

const SIZE = 14;

const PRIORITY_CONFIG: Record<
  ReleasePriority,
  { color: string; bars: number; label: string }
> = {
  urgent: { color: 'var(--color-error)', bars: 4, label: 'Urgent' },
  high: { color: 'var(--color-warning)', bars: 3, label: 'High' },
  medium: { color: 'var(--color-info)', bars: 2, label: 'Medium' },
  low: { color: 'var(--color-text-tertiary-token)', bars: 1, label: 'Low' },
  none: {
    color: 'var(--color-text-quaternary-token)',
    bars: 0,
    label: 'No priority',
  },
};

export function DemoPriorityIcon({
  priority,
}: {
  readonly priority: ReleasePriority;
}) {
  const { color, bars, label } = PRIORITY_CONFIG[priority];

  if (bars === 0) {
    return (
      <svg
        width={SIZE}
        height={SIZE}
        viewBox='0 0 14 14'
        fill='none'
        aria-labelledby={`priority-${priority}`}
        className='shrink-0'
      >
        <title id={`priority-${priority}`}>{label}</title>
        <line
          x1='3'
          y1='7'
          x2='11'
          y2='7'
          stroke={color}
          strokeWidth='1.5'
          strokeLinecap='round'
        />
      </svg>
    );
  }

  const barWidth = 2;
  const gap = 1;
  const totalWidth = bars * barWidth + (bars - 1) * gap;
  const startX = (14 - totalWidth) / 2;

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox='0 0 14 14'
      fill='none'
      aria-labelledby={`priority-${priority}-bars`}
      className='shrink-0'
    >
      <title id={`priority-${priority}-bars`}>{label}</title>
      {Array.from({ length: bars }, (_, i) => {
        const height = 3 + i * 2;
        const x = startX + i * (barWidth + gap);
        const y = 11 - height;
        return (
          <rect
            key={`bar-${priority}-${i.toString()}`}
            x={x}
            y={y}
            width={barWidth}
            height={height}
            rx={0.5}
            fill={color}
          />
        );
      })}
    </svg>
  );
}
