'use client';

import * as React from 'react';

import { cn } from '../lib/utils';
import { Button } from './button';

export interface InlineOfflineNoticeProps
  extends React.HTMLAttributes<HTMLDivElement> {
  readonly message?: string;
  readonly retryLabel?: string;
  readonly onRetry?: () => void;
}

/**
 * Compact inline offline banner for data-backed surfaces.
 * Use inside cards, tables, or form panels — not as a full-page fallback.
 */
export function InlineOfflineNotice({
  className,
  message = 'You appear to be offline. Changes will sync when your connection returns.',
  retryLabel = 'Retry',
  onRetry,
  ...props
}: InlineOfflineNoticeProps) {
  return (
    <div
      role='status'
      aria-live='polite'
      data-state='offline'
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[13px]',
        'border-(--state-offline-border) bg-(--state-offline-bg) text-(--state-offline-fg)',
        className
      )}
      {...props}
    >
      <p className='min-w-0 flex-1 text-left leading-snug'>{message}</p>
      {onRetry ? (
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={onRetry}
          className='shrink-0'
        >
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
