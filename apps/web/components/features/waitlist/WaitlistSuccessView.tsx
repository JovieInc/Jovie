'use client';

import { useEffect } from 'react';
import { AuthLayout } from '@/features/auth';
import { track } from '@/lib/analytics';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';
import {
  type WaitlistDisplayOutcome,
  WaitlistOutcomeView,
} from './WaitlistOutcomeView';

interface WaitlistSuccessViewProps {
  readonly outcome?: WaitlistDisplayOutcome;
  readonly onRetry?: () => void;
  /** Optional contact email shown in the completion receipt. */
  readonly email?: string | null;
}

export function WaitlistSuccessView({
  outcome = 'pending',
  onRetry,
  email,
}: Readonly<WaitlistSuccessViewProps>) {
  useEffect(() => {
    if (outcome !== 'save_failed' && outcome !== 'rate_limited') {
      track(ONBOARDING_FUNNEL_EVENTS.WAITLIST_CONFIRMATION_VIEWED, {
        surface: 'waitlist_receipt',
        outcome,
      });
    }
  }, [outcome]);

  return (
    <AuthLayout
      formTitle='Request Access'
      showFormTitle={false}
      showFooterPrompt={false}
    >
      <WaitlistOutcomeView outcome={outcome} onRetry={onRetry} email={email} />
    </AuthLayout>
  );
}
