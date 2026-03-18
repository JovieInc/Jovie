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
      variant='card'
      testId={testId}
      className={cn(
        'flex min-h-[140px] items-center rounded-[10px] bg-surface-1/25 px-4 py-4',
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
