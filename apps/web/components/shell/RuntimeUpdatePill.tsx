'use client';

import { Button } from '@jovie/ui';
import { Download } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

export interface RuntimeUpdatePillProps {
  readonly title: string;
  readonly description: string;
  readonly busy: boolean;
  readonly onApply: () => void;
}

/**
 * Quiet bottom-corner pill for an available app update. It sits outside the
 * page content so a pending or in-progress update never displaces a route's
 * own loading, empty or populated state. Applying still needs the explicit
 * press (reload on web, restart on desktop).
 */
export function RuntimeUpdatePill({
  title,
  description,
  busy,
  onApply,
}: RuntimeUpdatePillProps) {
  const descriptionId = useId();
  return (
    <section
      aria-label='App Updates'
      aria-live='polite'
      data-testid='runtime-update-pill'
      className='pointer-events-none fixed end-4 bottom-4 z-banner'
    >
      <Button
        type='button'
        variant='secondary'
        size='sm'
        onClick={onApply}
        disabled={busy}
        aria-label={title}
        aria-describedby={descriptionId}
        className={cn(
          'pointer-events-auto max-w-80',
          busy && 'cursor-progress'
        )}
      >
        <Download
          aria-hidden='true'
          className={cn('size-3.5 shrink-0', busy && 'animate-pulse')}
        />
        <span className='truncate'>{title}</span>
        <span id={descriptionId} className='sr-only'>
          {description}
        </span>
      </Button>
    </section>
  );
}
