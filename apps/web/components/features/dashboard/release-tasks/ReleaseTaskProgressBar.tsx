'use client';

import { motion } from 'motion/react';

const SPRING = {
  type: 'spring',
  damping: 10,
  mass: 0.75,
  stiffness: 100,
} as const;

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
        )}
      </p>
      <div
        className='h-1 w-full rounded-full bg-surface-1'
        role='progressbar'
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <motion.div
          className='h-1 rounded-full bg-accent'
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={SPRING}
        />
      </div>
    </div>
  );
}
