'use client';

import { RefreshCw, WifiOff } from 'lucide-react';
import type { ChatError } from '@/components/jovie/types';

interface OnboardingMessageRecoveryRowProps {
  readonly chatError: ChatError;
  readonly handleRetry: () => void;
  readonly isBusy: boolean;
  readonly isSubmitted: boolean;
}

export function OnboardingMessageRecoveryRow({
  chatError,
  handleRetry,
  isBusy,
  isSubmitted,
}: OnboardingMessageRecoveryRowProps) {
  const canRetry = Boolean(chatError.failedMessage) && !chatError.retryAfter;

  return (
    <div
      className='mb-2 flex w-full items-start gap-3 border-y border-subtle px-1 py-3 text-xs leading-5'
      data-testid='onboarding-message-recovery'
      role='alert'
      aria-live='assertive'
      aria-atomic='true'
    >
      <WifiOff
        className='mt-0.5 size-4 shrink-0 text-tertiary-token'
        aria-hidden='true'
      />
      <div className='min-w-0 flex-1'>
        <p className='text-app font-medium text-primary-token'>
          Message paused
        </p>
        <p className='text-secondary-token'>{chatError.message}</p>
        {canRetry ? (
          <button
            type='button'
            onClick={handleRetry}
            disabled={isBusy || isSubmitted}
            className='mt-1.5 inline-flex items-center gap-1.5 text-2xs font-medium text-secondary-token underline-offset-4 transition-colors duration-fast hover:text-primary-token hover:underline focus-visible:text-primary-token focus-visible:underline focus-visible:outline-none disabled:opacity-50'
          >
            <RefreshCw className='size-3.5' aria-hidden='true' />
            Retry message
          </button>
        ) : null}
      </div>
    </div>
  );
}
