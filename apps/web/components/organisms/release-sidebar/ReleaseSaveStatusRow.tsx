'use client';

import { Check, Loader2 } from 'lucide-react';

import { ReleaseActionErrorCard } from './ReleaseActionErrorCard';

export type ReleaseSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface ReleaseSaveFeedback {
  readonly message: string;
  readonly actionLabel: string;
  readonly onRetry: () => void;
}

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

  return (
    <div className={minHeightClassName}>
      <div
        className='flex items-center gap-1 text-2xs'
        role='status'
        aria-live='polite'
      >
        {status === 'saving' ? (
          <>
            <Loader2
              className='h-3 w-3 animate-spin text-tertiary-token'
              aria-hidden='true'
            />
            <span className='text-tertiary-token'>Saving…</span>
          </>
        ) : status === 'saved' && !feedback ? (
          <>
            <Check className='h-3 w-3 text-success' aria-hidden='true' />
            <span className='text-tertiary-token'>Saved</span>
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
