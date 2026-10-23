'use client';

import { DrawerSurfaceCard } from '@/components/molecules/drawer/DrawerSurfaceCard';
import { cn } from '@/lib/utils';

export interface DrawerInlineNoteProps {
  readonly message: string;
  readonly tone?: 'default' | 'error';
  readonly className?: string;
  /** `flush` drops the horizontal inset and shortens the note for dense lists. */
  readonly inset?: 'default' | 'flush';
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
  inset = 'default',
  testId,
}: DrawerInlineNoteProps) {
  return (
    <DrawerSurfaceCard variant='flat' testId={testId} className={className}>
      <div
        className={cn(
          'flex items-center py-3',
          inset === 'flush' ? 'min-h-12 px-0' : 'min-h-22 px-3'
        )}
      >
        <p
          className={cn(
            'text-xs leading-[18px] tracking-wide',
            tone === 'error' ? 'text-error' : 'text-secondary-token'
          )}
        >
          {message}
        </p>
      </div>
    </DrawerSurfaceCard>
  );
}
