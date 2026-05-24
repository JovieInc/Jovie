'use client';

import { Check, Loader2 } from 'lucide-react';

import { ReleaseActionErrorCard } from './ReleaseActionErrorCard';
import type { ReleaseSaveFeedback } from './utils';

export type ReleaseSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface ReleaseSaveStatusRowProps {
  readonly status: ReleaseSaveStatus;
  readonly feedback?: ReleaseSaveFeedback | null;
  readonly minHeightClassName?: string;
}

export function ReleaseSaveStatusRow({
  status,
  feedback = null,
  minHeightClassName = 'min-h-[22px]',
}: ReleaseSaveStatusRowProps) {
  if (status === 'idle' && !feedback) {
    return <div className={minHeightClassName} />;
  }

  const statusContent =
    status === 'saving'
      ? {
          icon: (
            <Loader2
              className='h-3 w-3 animate-spin text-tertiary-token'
              aria-hidden='true'
            />
          ),
          label: 'Saving…',
        }
      : status === 'saved' && !feedback
        ? {
            icon: <Check className='h-3 w-3 text-success' aria-hidden='true' />,
            label: 'Saved',
          }
        : null;

  return (
    <div className={minHeightClassName}>
      <div
        className='flex items-center gap-1 text-2xs'
        role='status'
        aria-live='polite'
      >
        {statusContent ? (
          <>
            {statusContent.icon}
            <span className='text-tertiary-token'>{statusContent.label}</span>
          </>
        ) : feedback ? (
          <ReleaseActionErrorCard
            variant='inline'
            message={feedback.message}
            actionLabel={feedback.actionLabel}
            onRetry={feedback.onRetry}
          />
        ) : null}
      </div>
    </div>
  );
}
