'use client';

import { RefreshCw, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useReducer, useState } from 'react';
import type { ChatError } from '@/components/jovie/types';
import { APP_ROUTES } from '@/constants/routes';
import { formatTimeRemaining } from '@/lib/utils/date-formatting';

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
  // `retryAfter` is a DURATION (seconds) captured when the request failed.
  // Keep an absolute deadline in state so parent renders cannot restart the
  // wait. A new failed request gets its own deadline (PR #18095 follow-up).
  const retryAfterKey =
    chatError.retryAfter != null
      ? `${chatError.type}:${chatError.requestId ?? ''}:${chatError.retryAfter}`
      : null;
  const [retryWindow, setRetryWindow] = useState(() => ({
    key: retryAfterKey,
    deadline:
      chatError.retryAfter != null
        ? Date.now() + chatError.retryAfter * 1000
        : null,
  }));
  if (retryAfterKey !== retryWindow.key) {
    setRetryWindow({
      key: retryAfterKey,
      deadline:
        chatError.retryAfter != null
          ? Date.now() + chatError.retryAfter * 1000
          : null,
    });
  }
  const retryAfterDeadline = retryWindow.deadline;
  const [, refreshCountdown] = useReducer((tick: number) => tick + 1, 0);
  useEffect(() => {
    if (retryAfterDeadline === null || retryAfterDeadline <= Date.now()) {
      return;
    }
    const timer = setInterval(() => {
      refreshCountdown();
      if (Date.now() >= retryAfterDeadline) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAfterDeadline]);

  const canRetry =
    retryAfterDeadline === null || retryAfterDeadline <= Date.now();
  const isRateLimited = chatError.type === 'rate_limit';
  const waitLabel =
    retryAfterDeadline !== null
      ? formatTimeRemaining(retryAfterDeadline)
      : null;

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
        {waitLabel ? (
          <p className='text-secondary-token' aria-live='off'>
            {canRetry ? 'Try again now.' : `Try again in ${waitLabel}.`}
          </p>
        ) : null}
        {chatError.failedMessage ? (
          <button
            type='button'
            onClick={handleRetry}
            disabled={!canRetry || isBusy || isSubmitted}
            className='mt-1.5 inline-flex items-center gap-1.5 text-2xs font-medium text-secondary-token underline-offset-4 transition-colors duration-fast hover:text-primary-token hover:underline focus-visible:text-primary-token focus-visible:underline focus-visible:outline-none disabled:opacity-50'
          >
            <RefreshCw className='size-3.5' aria-hidden='true' />
            Retry message
          </button>
        ) : null}
        {isRateLimited ? (
          <Link
            href={APP_ROUTES.SIGNUP}
            className='mt-1.5 inline-flex items-center text-2xs font-medium text-secondary-token underline-offset-4 transition-colors duration-fast hover:text-primary-token hover:underline focus-visible:text-primary-token focus-visible:underline focus-visible:outline-none'
          >
            Create a free account to keep going
          </Link>
        ) : null}
      </div>
    </div>
  );
}
