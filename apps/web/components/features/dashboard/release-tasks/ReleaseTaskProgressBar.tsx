'use client';

interface ReleaseTaskProgressBarProps {
  readonly done: number;
  readonly total: number;
  readonly className?: string;
}

export function ReleaseTaskProgressBar({
  done,
  total,
  className,
}: ReleaseTaskProgressBarProps) {
  if (total === 0) return null;

  const pct = Math.round((done / total) * 100);
  const isComplete = done === total;

  return (
    <div className={className}>
      <p className='text-[11px] text-tertiary-token mb-1'>
        {isComplete ? (
          <span className='text-[var(--linear-accent,#5e6ad2)]'>
            Campaign complete! All {total} tasks done.
          </span>
        ) : (
          <>
            {done}/{total} done
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
