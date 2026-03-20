interface FundraiseProgressProps {
  readonly raiseTarget: number;
  readonly committedAmount: number;
  readonly investorCount: number;
}

/**
 * Format cents to human-readable dollar amount.
 * $500, $25K, $1.2M, etc.
 */
function formatAmount(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) {
    const m = dollars / 1_000_000;
    return m % 1 === 0 ? `$${m}M` : `$${m.toFixed(1)}M`;
  }
  if (dollars >= 1_000) {
    const k = dollars / 1_000;
    return k % 1 === 0 ? `$${k}K` : `$${k.toFixed(1)}K`;
  }
  return `$${Math.round(dollars).toLocaleString()}`;
}

/**
 * Optional fundraise progress indicator.
 * Thin accent-colored bar with committed/target text.
 * Animated fill on load.
 */
export function FundraiseProgress({
  raiseTarget,
  committedAmount,
  investorCount,
}: FundraiseProgressProps) {
  const percentage =
    raiseTarget > 0 ? Math.min((committedAmount / raiseTarget) * 100, 100) : 0;

  return (
    <div className='flex flex-1 flex-col gap-1.5'>
      {/* Progress bar — 4px thin, accent fill */}
      <div
        className='h-1 w-full overflow-hidden rounded-full'
        style={{ background: 'var(--color-bg-surface-2)' }}
        role='progressbar'
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${formatAmount(committedAmount)} of ${formatAmount(raiseTarget)} committed`}
      >
        <div
          className='h-full rounded-full transition-all'
          style={{
            width: `${percentage}%`,
            background: 'var(--color-accent)',
            transitionDuration: 'var(--duration-slower)',
            transitionTimingFunction: 'var(--ease-out)',
          }}
        />
      </div>

      {/* Text */}
      <p className='text-[length:var(--text-xs)] font-[510] text-[var(--color-text-tertiary-token)]'>
        {formatAmount(committedAmount)} / {formatAmount(raiseTarget)} committed
        {investorCount > 0 &&
          ` · ${investorCount} investor${investorCount === 1 ? '' : 's'}`}
      </p>
    </div>
  );
}
