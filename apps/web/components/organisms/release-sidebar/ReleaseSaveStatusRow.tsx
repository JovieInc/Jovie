'use client';

import { Check, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

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

  let statusContent: ReactNode = null;
  if (status === 'saving') {
    statusContent = (
      <>
        <Loader2
          className='h-3 w-3 animate-spin text-tertiary-token'
          aria-hidden='true'
        />
        <span className='text-tertiary-token'>Saving…</span>
      </>
    );
  } else if (status === 'saved' && !feedback) {
    statusContent = (
      <>
        <Check className='h-3 w-3 text-success' aria-hidden='true' />
        <span className='text-tertiary-token'>Saved</span>
      </>
    );
  }
  let content = statusContent;
  if (!content && feedback) {
    content = (
      <ReleaseActionErrorCard
        variant='inline'
        message={feedback.message}
        actionLabel={feedback.actionLabel}
        onRetry={feedback.onRetry}
      />
    );
  }

  return (
    <div className={minHeightClassName}>
      <div
        className='flex items-center gap-1 text-2xs'
        role='status'
        aria-live='polite'
      >
        {content}
      </div>
    </div>
  );
}
