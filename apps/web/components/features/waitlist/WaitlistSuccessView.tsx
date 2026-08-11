'use client';

import { useEffect } from 'react';
import { AuthLayout } from '@/features/auth';
import { track } from '@/lib/analytics';
import {
  PRODUCTION_WAITLIST_CANARY_RUN_HEADER,
  PRODUCTION_WAITLIST_CANARY_STORAGE_KEY,
} from '@/lib/canaries/production-waitlist-client';
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

      const syntheticRunId = globalThis.sessionStorage?.getItem(
        PRODUCTION_WAITLIST_CANARY_STORAGE_KEY
      );
      if (syntheticRunId) {
        void fetch('/api/canary/waitlist/receipt', {
          method: 'POST',
          headers: { [PRODUCTION_WAITLIST_CANARY_RUN_HEADER]: syntheticRunId },
        }).finally(() => {
          globalThis.sessionStorage?.removeItem(
            PRODUCTION_WAITLIST_CANARY_STORAGE_KEY
          );
        });
      }
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
