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
    <div className={cn('text-xs', className)}>
      {isReturning ? (
        <span className='inline-flex items-center rounded-full border border-subtle bg-surface-2/60 px-2 py-0.5 text-[11px] font-medium text-secondary-token'>
          Returning
        </span>
      ) : (
        <span className='text-tertiary-token/70 text-[11px]'>New</span>
      )}
    </div>
  );
}
