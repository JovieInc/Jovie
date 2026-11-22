import { cn } from '../table.styles';

export interface MeterCellProps {
  /** 0..max. */
  readonly value: number;
  readonly max?: number;
  /** Number of bars. */
  readonly bars?: number;
  readonly label?: string;
  readonly className?: string;
}

const HEIGHTS = ['h-1.5', 'h-2', 'h-2.5', 'h-3', 'h-3.5', 'h-4'] as const;

/**
 * Step meter. Active bars use the success text token (3:1+ on the row in both
 * themes); inactive bars are a visible quaternary tint, never the surface.
 */
export function MeterCell({
  value,
  max = 100,
  bars = 5,
  label = 'Level',
  className,
}: MeterCellProps) {
  const count = Math.max(1, Math.min(bars, HEIGHTS.length));
  const clamped = Math.max(0, Math.min(max, value));
  const lit =
    clamped === 0 ? 0 : Math.max(1, Math.ceil((clamped / max) * count));
  return (
    <div
      className={cn('flex h-4 items-end gap-0.5', className)}
      aria-label={`${label} ${lit} of ${count}`}
      role='img'
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={HEIGHTS[i]}
          className={cn(
            'w-0.5 rounded-sm',
            HEIGHTS[i],
            i < lit ? 'bg-success-text' : 'bg-quaternary-token/40'
          )}
          aria-hidden='true'
        />
      ))}
    </div>
  );
}

/** Name used by the Jovie grid system frames ("engagement bar" cell). */
export const EngagementBarCell = MeterCell;
