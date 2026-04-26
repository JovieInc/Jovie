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
      className={cn('flex min-h-[88px] items-center px-3 py-3', className)}
    >
      <p
        className={cn(
          'text-xs leading-[18px] tracking-[0.01em]',
          tone === 'error' ? 'text-error' : 'text-secondary-token'
        )}
      >
        {message}
      </p>
    </DrawerSurfaceCard>
  );
}
