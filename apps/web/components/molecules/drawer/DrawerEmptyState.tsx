'use client';

import { cn } from '@/lib/utils';

export interface DrawerEmptyStateProps {
  readonly message: string;
  readonly className?: string;
}

export function DrawerEmptyState({
  message,
  className,
}: DrawerEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[140px] items-center rounded-[8px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-3',
        className
      )}
    >
      <p className='text-[12px] leading-[17px] text-(--linear-text-secondary)'>
        {message}
      </p>
    </div>
  );
}
