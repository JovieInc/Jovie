import { StatusGlyph } from '@jovie/ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Freshness of one metric reading.
 * - `measured`: the source answered within its freshness window.
 * - `stale`: the last reading is shown, marked with its age.
 * - `unknown`: no reading; the source and last-seen age say why.
 */
export type MeasuredValueState = 'measured' | 'stale' | 'unknown';

export interface MeasuredValueProps {
  readonly state: MeasuredValueState;
  /** The reading. Ignored when `state` is `unknown`. */
  readonly value?: ReactNode;
  /** Where the reading comes from, e.g. "Lanes feed" or "GitHub". */
  readonly source: string;
  /** Milliseconds since the source last answered; null when it never has. */
  readonly ageMs?: number | null;
  /** Short reason the source gave, e.g. "unauthorized" or "timed out". */
  readonly reason?: string | null;
  readonly className?: string;
}

/** Compact age: "now", "45s", "12m", "3h", "2d". */
export function formatMeasuredAge(ageMs: number): string {
  const seconds = Math.max(0, Math.floor(ageMs / 1000));
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function provenance(
  source: string,
  ageMs: number | null | undefined,
  reason: string | null | undefined
): string {
  const age =
    ageMs == null ? 'never seen' : `seen ${formatMeasuredAge(ageMs)} ago`;
  return [source, reason, age].filter(Boolean).join(' · ');
}

/**
 * The only way a metric renders a value that is not freshly measured. A bare
 * "n/a" or em dash is a dead end; this names the source and the age so the
 * reader knows whether to wait, look elsewhere, or fix a feed.
 */
export function MeasuredValue({
  state,
  value,
  source,
  ageMs = null,
  reason = null,
  className,
}: Readonly<MeasuredValueProps>) {
  if (state === 'measured') {
    return (
      <span className={cn('tabular-nums', className)} data-measured='measured'>
        {value}
      </span>
    );
  }

  const detail = provenance(source, ageMs, reason);

  if (state === 'stale') {
    return (
      <span
        className={cn('inline-flex items-baseline gap-1.5', className)}
        data-measured='stale'
        title={`Stale: ${detail}`}
      >
        <span className='tabular-nums'>{value}</span>
        <span className='text-2xs font-normal text-warning tabular-nums'>
          {ageMs == null ? 'stale' : `${formatMeasuredAge(ageMs)} old`}
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-normal text-tertiary-token',
        className
      )}
      data-measured='unknown'
      title={`Unknown: ${detail}`}
    >
      <StatusGlyph state='unknown' size='sm' tooltipLabel='Unknown' />
      <span>Unknown</span>
      <span className='text-2xs tabular-nums'>
        {ageMs == null ? source : `${source} · ${formatMeasuredAge(ageMs)}`}
      </span>
    </span>
  );
}
