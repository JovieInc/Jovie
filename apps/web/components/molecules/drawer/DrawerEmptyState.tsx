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
      testId={testId}
      className={cn(
        'flex min-h-[140px] items-center rounded-[10px] border border-subtle/70 bg-surface-1/50 px-4 py-4',
        className
      )}
    >
      <p
        className={cn(
          'text-[12px] leading-[18px]',
          tone === 'error' ? 'text-error' : 'text-(--linear-text-secondary)'
        )}
      >
        {message}
      </p>
    </DrawerSurfaceCard>
  );
}
