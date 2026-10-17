'use client';

import { useEffect } from 'react';
import { DashboardHeader } from '@/components/features/dashboard/organisms/DashboardHeader';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { WAITLIST_FRONT_DOOR_CONTEXT } from '@/data/homepageFrontDoorCta';
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
    <SidebarProvider defaultOpen={false}>
      <AppShellFrame
        sidebar={null}
        header={
          <DashboardHeader breadcrumbs={[{ label: 'Chat' }]} transparent />
        }
        chatAmbientGradient
        containerClassName='[color-scheme:dark]'
        main={
          <div className='flex min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8'>
            <div className='mx-auto w-full max-w-[44rem]'>
              <WaitlistOutcomeView
                outcome={outcome}
                onRetry={onRetry}
                email={email}
                reservedHandle={reservedHandle}
                proCheckoutPriceId={proCheckoutPriceId}
                presentation='chat'
              />
            </div>
          </div>
        }
      />
    </SidebarProvider>
  );
}
