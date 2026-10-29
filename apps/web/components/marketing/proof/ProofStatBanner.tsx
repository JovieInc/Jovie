import Link from 'next/link';
import type { ResolvedProofStat } from '@/lib/proof-stats/format';
import { cn } from '@/lib/utils';

export interface ProofStatBannerProps {
  /** Resolved stat from the proof-stat registry; null renders nothing. */
  readonly stat: ResolvedProofStat | null;
  /**
   * What to do when the stat is not publishable (stale, below threshold,
   * unapproved): `hide` renders nothing, `fallback` renders the registry
   * fallback copy (never a number).
   */
  readonly whenUnavailable?: 'hide' | 'fallback';
  readonly showMethodology?: boolean;
  readonly className?: string;
}

/**
 * One-line proof statement ("Trusted by 100k+ artists and teams"). The
 * sentence and value come from the registry; this component never formats
 * or invents a number, and it shows nothing it cannot prove.
 */
export function ProofStatBanner({
  stat,
  whenUnavailable = 'hide',
  showMethodology = false,
  className,
}: ProofStatBannerProps) {
  if (!stat) return null;
  const publishable = stat.state === 'publishable' && stat.sentence;
  if (!publishable) {
    if (whenUnavailable !== 'fallback' || !stat.fallback) return null;
    return (
      <p
        data-testid='proof-stat-banner'
        data-proof-state={stat.state}
        className={cn('text-sm text-secondary-token text-pretty', className)}
      >
        {stat.fallback}
      </p>
    );
  }
  return (
    <p
      data-testid='proof-stat-banner'
      data-proof-state='publishable'
      data-proof-stat={stat.id}
      className={cn(
        'flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-secondary-token',
        className
      )}
    >
      <span className='font-medium text-primary-token tabular-nums text-pretty'>
        {stat.sentence}
      </span>
      {showMethodology && stat.methodology ? (
        <Link
          href={stat.methodology}
          className='text-xs text-tertiary-token underline-offset-4 hover:underline focus-ring-themed'
        >
          Methodology
        </Link>
      ) : null}
    </p>
  );
}
