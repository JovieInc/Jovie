'use client';

import { Button } from '@jovie/ui';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OnboardingTurnstileStatus } from './OnboardingTurnstile';

interface OnboardingSecurityCheckRecoveryProps {
  readonly status?: OnboardingTurnstileStatus;
  readonly onRetry: () => void;
  readonly isBusy: boolean;
  readonly verification?: ReactNode;
}

function getSecurityCheckMessage(status?: OnboardingTurnstileStatus) {
  switch (status) {
    case 'interactive':
      return 'Complete the check below to send your message.';
    case 'expired':
    case 'timeout':
      return 'The check timed out. Try it again to continue.';
    case 'error':
    case 'unconfigured':
      return 'The check couldn’t load. Try it again to continue.';
    case 'unsupported':
      return 'Try allowing security checks in your browser, then retry.';
    default:
      return 'Checking your browser before sending your message.';
  }
}

/** Recovery belongs beside the retained draft, rather than in the transcript. */
export function OnboardingSecurityCheckRecovery({
  status,
  onRetry,
  isBusy,
  verification,
}: OnboardingSecurityCheckRecoveryProps) {
  return (
    <div
      className='mb-2 flex items-start gap-3 px-1 py-2 text-xs leading-5'
      data-testid='onboarding-message-recovery'
    >
      <ShieldCheck
        className='mt-0.5 size-4 shrink-0 text-secondary-token'
        aria-hidden='true'
      />
      <div className='min-w-0 flex-1'>
        <div role='status' aria-live='polite' aria-atomic='true'>
          <p className='text-app font-medium text-primary-token'>
            One quick check
          </p>
          <p className='min-h-10 text-secondary-token'>
            {getSecurityCheckMessage(status)} Your draft is still here.
          </p>
        </div>
        {verification}
        <div className='flex min-h-11 items-center'>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={onRetry}
            disabled={isBusy}
          >
            <RefreshCw className='size-3.5' aria-hidden='true' />
            Try Security Check Again
          </Button>
        </div>
      </div>
    </div>
  );
}
