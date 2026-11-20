import Link from 'next/link';
import { PROOF_STAT_COPY } from '@/data/proofStatCopy';
import { computeRatePercent } from '@/lib/analytics/metrics';
import type { ResolvedProofStat } from '@/lib/proof-stats/format';
import { cn } from '@/lib/utils';

export interface ProofRankedEntry {
  readonly id: string;
  readonly label: string;
  /** Measured median, in `unit`. */
  readonly value: number;
  /** The Jovie row, highlighted. Exactly one entry should set it. */
  readonly self?: boolean;
}

export interface ProofRankedBarChartProps {
  /**
   * The comparative stat that gates the chart. The chart renders only when
   * it is publishable (fresh, founder-approved); otherwise nothing renders.
   */
  readonly stat: ResolvedProofStat | null;
  readonly title: string;
  readonly entries: readonly ProofRankedEntry[];
  readonly unit: string;
  readonly better: 'higher' | 'lower';
  readonly formatValue?: (value: number) => string;
  readonly className?: string;
}

function defaultFormat(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/**
 * Ranked horizontal bars, best first, in the style of a spec-sheet benchmark
 * chart: one highlighted row (Jovie), the rest quiet. Bar length is the raw
 * measured value on a zero baseline, so it never exaggerates a gap. The
 * order follows the data: if Jovie is not first, it is not drawn first.
 */
export function ProofRankedBarChart({
  stat,
  title,
  entries,
  unit,
  better,
  formatValue = defaultFormat,
  className,
}: ProofRankedBarChartProps) {
  if (stat?.state !== 'publishable') return null;
  const rows = entries.filter(
    entry => Number.isFinite(entry.value) && entry.value >= 0
  );
  if (rows.length < 2) return null;
  const ranked = [...rows].sort((a, b) =>
    better === 'lower' ? a.value - b.value : b.value - a.value
  );
  const max = Math.max(...ranked.map(entry => entry.value));
  return (
    <figure
      data-testid='proof-ranked-bar-chart'
      data-proof-stat={stat.id}
      className={cn('flex flex-col gap-5', className)}
    >
      <figcaption className='flex flex-col gap-1'>
        <span className='text-sm font-medium text-primary-token text-balance'>
          {title}
        </span>
        <span className='text-xs text-tertiary-token'>
          {better === 'lower' ? 'Lower is better' : 'Higher is better'} ({unit}
          ).
          {stat.methodology ? (
            <>
              {' '}
              <Link
                href={stat.methodology}
                className='underline-offset-4 hover:underline focus-ring-themed'
              >
                {PROOF_STAT_COPY.methodologyLink}
              </Link>
            </>
          ) : null}
        </span>
      </figcaption>
      <ol className='flex flex-col gap-3'>
        {ranked.map(entry => {
          const width = computeRatePercent(entry.value, max, 2);
          return (
            <li
              key={entry.id}
              data-self={entry.self ? 'true' : undefined}
              className='flex items-center gap-3'
            >
              <span
                className={cn(
                  'w-24 shrink-0 truncate text-sm sm:w-36',
                  entry.self
                    ? 'font-medium text-primary-token'
                    : 'text-secondary-token'
                )}
              >
                {entry.label}
              </span>
              <span
                aria-hidden='true'
                className='h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-1'
              >
                <span
                  className={cn(
                    'block h-full rounded-full',
                    entry.self ? 'bg-primary-token' : 'bg-surface-3'
                  )}
                  style={{ width: `${Math.max(width, 1)}%` }}
                />
              </span>
              <span
                className={cn(
                  'shrink-0 text-sm tabular-nums',
                  entry.self ? 'text-primary-token' : 'text-tertiary-token'
                )}
              >
                {formatValue(entry.value)}
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
