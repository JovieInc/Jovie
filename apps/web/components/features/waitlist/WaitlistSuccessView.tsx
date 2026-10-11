'use client';

import { useEffect } from 'react';
import { WAITLIST_FRONT_DOOR_CONTEXT } from '@/data/homepageFrontDoorCta';
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
  /** jov.ie handle held by the reservation profile, when one exists. */
  readonly reservedHandle?: string | null;
  /** Self-serve Pro price; enables "Start Pro" on waiting receipts. */
  readonly proCheckoutPriceId?: string | null;
}

export function WaitlistSuccessView({
  outcome = 'pending',
  onRetry,
  email,
  reservedHandle,
  proCheckoutPriceId,
}: Readonly<WaitlistSuccessViewProps>) {
  useEffect(() => {
    if (
      outcome !== 'save_failed' &&
      outcome !== 'rate_limited' &&
      outcome !== 'receipt_unavailable'
    ) {
      track(ONBOARDING_FUNNEL_EVENTS.WAITLIST_CONFIRMATION_VIEWED, {
        surface: 'waitlist_receipt',
        outcome,
        ...WAITLIST_FRONT_DOOR_CONTEXT,
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
      layoutVariant='stack'
      chrome='splash-b'
    >
      <WaitlistOutcomeView
        outcome={outcome}
        onRetry={onRetry}
        email={email}
        reservedHandle={reservedHandle}
        proCheckoutPriceId={proCheckoutPriceId}
      />
    </AuthLayout>
  );
}
