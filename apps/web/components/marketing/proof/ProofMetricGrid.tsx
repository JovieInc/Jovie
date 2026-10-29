import Link from 'next/link';
import type { ResolvedProofStat } from '@/lib/proof-stats/format';
import { cn } from '@/lib/utils';

export interface ProofMetricCardProps {
  readonly stat: ResolvedProofStat;
  /** Short spec label; defaults to the registry label. */
  readonly label?: string;
  readonly className?: string;
}

function measuredLabel(measuredAt: string | null): string | null {
  if (!measuredAt) return null;
  const date = new Date(measuredAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Spec-sheet metric: label, value, measured date. Renders only a
 * publishable stat; anything else returns null so a grid never shows a gap
 * filled with a stale or false number.
 */
export function ProofMetricCard({
  stat,
  label,
  className,
}: ProofMetricCardProps) {
  if (stat.state !== 'publishable' || !stat.value) return null;
  const measured = measuredLabel(stat.measuredAt);
  return (
    <div
      data-testid='proof-metric-card'
      data-proof-stat={stat.id}
      className={cn(
        'flex min-w-0 flex-col gap-2 border-t border-subtle pt-4',
        className
      )}
    >
      <dt className='text-xs text-tertiary-token text-pretty'>
        {label ?? stat.label}
      </dt>
      <dd className='text-3xl font-medium tracking-tight text-primary-token tabular-nums'>
        {stat.value}
      </dd>
      {measured || stat.methodology ? (
        <dd className='flex flex-wrap gap-x-2 text-xs text-tertiary-token'>
          {measured ? <span>Measured {measured}</span> : null}
          {stat.methodology ? (
            <Link
              href={stat.methodology}
              className='underline-offset-4 hover:underline focus-ring-themed'
            >
              Methodology
            </Link>
          ) : null}
        </dd>
      ) : null}
    </div>
  );
}

export interface ProofMetricGridProps {
  readonly stats: readonly {
    readonly stat: ResolvedProofStat | null | undefined;
    readonly label?: string;
  }[];
  readonly className?: string;
}

/** Grid of spec cards. Hides itself when no stat is publishable. */
export function ProofMetricGrid({ stats, className }: ProofMetricGridProps) {
  const visible = stats.filter(
    (entry): entry is { stat: ResolvedProofStat; label?: string } =>
      entry.stat?.state === 'publishable' && Boolean(entry.stat.value)
  );
  if (visible.length === 0) return null;
  return (
    <dl
      data-testid='proof-metric-grid'
      className={cn(
        'grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4',
        className
      )}
    >
      {visible.map(entry => (
        <ProofMetricCard
          key={entry.stat.id}
          stat={entry.stat}
          label={entry.label}
        />
      ))}
    </dl>
  );
}
