'use client';

import { DrawerSurfaceCard } from '@/components/molecules/drawer/DrawerSurfaceCard';
import { cn } from '@/lib/utils';

export interface DrawerInlineNoteProps {
  readonly message: string;
  readonly tone?: 'default' | 'error';
  readonly className?: string;
  readonly testId?: string;
}

/**
 * Inline drawer note for one-line status/empty messages. This is NOT an
 * empty-state variant — the canonical `EmptyState` molecule owns hierarchy
 * empty states (icon, heading, CTA).
 */
export function DrawerInlineNote({
  message,
  tone = 'default',
  className,
  testId,
}: DrawerInlineNoteProps) {
  return (
    <DrawerSurfaceCard
      variant='flat'
      testId={testId}
      className={cn('flex min-h-22 items-center px-3 py-3', className)}
    >
      <p
        className={cn(
          'text-xs leading-[18px] tracking-wide',
          tone === 'error' ? 'text-error' : 'text-secondary-token'
        )}
      >
        {message}
      </p>
    </DrawerSurfaceCard>
  );
}
