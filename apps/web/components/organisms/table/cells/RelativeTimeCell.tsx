import { cn } from '../table.styles';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function formatRelativeCompact(ms: number): string {
  if (ms < MIN) return 'now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / DAY)}d`;
}

export interface RelativeTimeCellProps {
  /** ISO timestamp, or null when never. */
  readonly value: string | null;
  /** Current time in ms. Null before a stable clock exists (SSR): shows a dash. */
  readonly nowMs: number | null;
  readonly className?: string;
}

/** Compact relative time ("now / 5m / 3h / 7d"), tabular, tertiary. */
export function RelativeTimeCell({
  value,
  nowMs,
  className,
}: RelativeTimeCellProps) {
  const seen = value ? Date.parse(value) : Number.NaN;
  const text =
    nowMs == null || Number.isNaN(seen)
      ? '—'
      : formatRelativeCompact(Math.max(0, nowMs - seen));
  return (
    <span
      className={cn('text-app tabular-nums text-tertiary-token', className)}
    >
      {text}
    </span>
  );
}
