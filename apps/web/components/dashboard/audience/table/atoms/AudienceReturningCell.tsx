'use client';

import { cn } from '@/lib/utils';

export interface AudienceReturningCellProps {
  readonly visits: number;
  readonly className?: string;
}

export function AudienceReturningCell({
  visits,
  className,
}: AudienceReturningCellProps) {
  const isReturning = visits > 1;

  return (
    <div className={cn('text-[13px]', className)}>
      {isReturning ? (
        <span className='inline-flex items-center rounded-full border border-subtle bg-surface-2/60 px-2 py-0.5 text-xs font-medium text-secondary-token'>
          Returning
        </span>
      ) : (
        <span className='text-tertiary-token/70 text-xs'>New</span>
      )}
    </div>
  );
}
