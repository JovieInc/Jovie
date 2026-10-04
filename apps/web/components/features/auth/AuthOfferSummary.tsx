'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AUTH_SURFACE } from '@/lib/auth/constants';
import {
  getPlanIntentRecord,
  type OfferIntent,
  readAuthOfferIntervalFromParams,
  validatePlan,
} from '@/lib/auth/plan-intent';
import {
  type BillingInterval,
  formatUsdAmount,
  getPlanCtaLabel,
  getPlanOfferNote,
  isSelfServiceOffer,
  PRO_TRIAL_DURATION_DAYS,
  type PublicOfferPlan,
} from '@/lib/billing/offer-truth';
import { PLAN_PRICES } from '@/lib/config/plan-prices';
import { cn } from '@/lib/utils';

export type AuthOfferSummaryMode = 'sign-in' | 'sign-up';

function resolvePublicOfferPlan(
  plan: OfferIntent['plan'] | null | undefined
): PublicOfferPlan | null {
  if (plan === 'free' || plan === 'pro' || plan === 'max') return plan;
  if (plan === 'team' || plan === 'enterprise') return 'pro';
  return null;
}

function getOfferHeading(
  mode: AuthOfferSummaryMode,
  plan: PublicOfferPlan
): string {
  if (mode === 'sign-in') {
    if (plan === 'pro') return 'Continue to Pro';
    if (plan === 'max') return 'Continue to Max';
    return 'Continue with a free profile';
  }
  if (plan === 'pro')
    return `Start your ${PRO_TRIAL_DURATION_DAYS}-day Pro trial`;
  if (plan === 'max') return 'Continue to Max';
  return 'Claim your free profile';
}

function getOfferPriceLine(plan: PublicOfferPlan, interval: BillingInterval) {
  if (plan === 'free') return '$0';
  if (!isSelfServiceOffer(plan, interval)) return getPlanCtaLabel(plan);
  return `${formatUsdAmount(PLAN_PRICES.pro.monthly)}/mo`;
}

/**
 * Quiet offer recap for the shared auth shell (JOV-6202).
 * Mount only when AUTH_OFFER_SUMMARY is on. `enabled` defaults off so a
 * stray render cannot change auth copy.
 */
export function AuthOfferSummary({
  mode,
  enabled = false,
}: Readonly<{
  readonly mode: AuthOfferSummaryMode;
  readonly enabled?: boolean;
}>) {
  const searchParams = useSearchParams();
  const [storedOffer, setStoredOffer] = useState<OfferIntent | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStoredOffer(null);
      return;
    }
    setStoredOffer(getPlanIntentRecord());
  }, [enabled, searchParams]);

  if (!enabled) return null;

  const urlPlan = resolvePublicOfferPlan(
    validatePlan(searchParams.get('plan'))
  );
  const publicPlan =
    urlPlan ?? resolvePublicOfferPlan(storedOffer?.plan ?? null);
  if (!publicPlan) return null;

  const interval: BillingInterval =
    readAuthOfferIntervalFromParams(searchParams) ??
    storedOffer?.interval ??
    'month';
  const note =
    mode === 'sign-in' && publicPlan !== 'free'
      ? 'Existing subscribers go to billing — not a new trial.'
      : getPlanOfferNote(publicPlan);

  return (
    <aside
      data-testid='auth-offer-summary'
      data-offer-plan={publicPlan}
      data-offer-interval={interval}
      data-offer-mode={mode}
      className={cn(AUTH_SURFACE.card, 'mb-4 px-4 py-3 text-center')}
    >
      <p className='text-lg font-medium leading-tight tracking-tight text-primary-token'>
        {getOfferHeading(mode, publicPlan)}
      </p>
      <p className='mt-1 text-app leading-5 text-secondary-token'>
        {getOfferPriceLine(publicPlan, interval)}
      </p>
      <p className='mt-2 text-xs leading-5 text-tertiary-token'>{note}</p>
    </aside>
  );
}
