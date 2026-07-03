'use client';

import { ProgressBar } from '@jovie/ui';

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

  const label = isComplete ? (
    <span className='text-accent'>
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
  );

  return (
    <ProgressBar
      className={className}
      value={pct}
      label={label}
      aria-label='Release task progress'
    />
  );
}
