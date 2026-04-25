'use client';

interface ReleaseTaskProgressBarProps {
  readonly done: number;
  readonly total: number;
  readonly overdueCount?: number;
  readonly className?: string;
}

export function ReleaseTaskProgressBar({
  done,
  total,
  overdueCount = 0,
  className,
}: ReleaseTaskProgressBarProps) {
  if (total === 0) return null;

  const pct = Math.round((done / total) * 100);
  const isComplete = done === total;

  return (
    <div className={className}>
      <p className='text-2xs text-tertiary-token mb-1'>
        {isComplete ? (
          <span className='text-[var(--linear-accent,#5e6ad2)]'>
            Campaign complete! All {total} tasks done.
          </span>
        ) : (
          <>
            {done}/{total} done
            {overdueCount > 0 && (
              <span className='text-red-400'>
                {' '}
                &middot; {overdueCount} overdue
              </span>
            )}
          </>
        )}
      </p>
      <div className='h-1 w-full rounded-full bg-surface-1'>
        <div
          className='h-1 rounded-full bg-[var(--linear-accent,#5e6ad2)] transition-[width] duration-700 ease-out'
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
