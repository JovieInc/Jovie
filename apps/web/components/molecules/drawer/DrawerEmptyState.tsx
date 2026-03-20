'use client';

import { DrawerSurfaceCard } from '@/components/molecules/drawer/DrawerSurfaceCard';
import { cn } from '@/lib/utils';

export interface DrawerEmptyStateProps {
  readonly message: string;
  readonly tone?: 'default' | 'error';
  readonly className?: string;
  readonly testId?: string;
}

export function DrawerEmptyState({
  message,
  tone = 'default',
  className,
  testId,
}: DrawerEmptyStateProps) {
  return (
    <DrawerSurfaceCard
      variant='flat'
      testId={testId}
      className={cn(
        'flex min-h-[80px] items-center rounded-lg bg-surface-1/25 px-2 py-2',
        className
      )}
    >
      <p
        className={cn(
          'text-[12px] leading-[18px] tracking-[0.01em]',
          tone === 'error' ? 'text-error' : 'text-secondary-token'
        )}
      >
        {message}
      </p>
    </DrawerSurfaceCard>
  );
}
