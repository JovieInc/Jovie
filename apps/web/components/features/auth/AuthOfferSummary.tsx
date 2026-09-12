'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AUTH_SURFACE } from '@/lib/auth/constants';
import {
  type OfferIntent,
  persistOfferIntentFromSearchParams,
  validatePlan,
} from '@/lib/auth/plan-intent';
import {
  type BillingInterval,
  formatAnnualMonthlyEquivalent,
  formatUsdAmount,
  getPaidPlanPriceUsd,
  getPlanOfferNote,
  type PublicOfferPlan,
  validateBillingInterval,
} from '@/lib/billing/offer-truth';
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
  if (plan === 'pro') return 'Start your 14-day Pro trial';
  if (plan === 'max') return 'Continue to Max';
  return 'Claim your free profile';
}

function getOfferPriceLine(plan: PublicOfferPlan, interval: BillingInterval) {
  if (plan === 'free') return '$0';
  const paidPlan = plan === 'max' ? 'max' : 'pro';
  const amount = getPaidPlanPriceUsd(paidPlan, interval);
  if (interval === 'year') {
    return `${formatUsdAmount(amount)}/yr · ${formatAnnualMonthlyEquivalent(amount)} billed annually`;
  }
  return `${formatUsdAmount(amount)}/mo`;
}

/**
 * Quiet offer recap for the shared auth shell (JOV-6202).
 * Uses existing auth surface tokens — does not fork the JOV-6200 design system.
 */
export function AuthOfferSummary({
  mode,
}: Readonly<{
  readonly mode: AuthOfferSummaryMode;
}>) {
  const searchParams = useSearchParams();
  const [storedOffer, setStoredOffer] = useState<OfferIntent | null>(null);

  useEffect(() => {
    setStoredOffer(persistOfferIntentFromSearchParams(searchParams));
  }, [searchParams]);

  const urlPlan = resolvePublicOfferPlan(
    validatePlan(searchParams.get('plan'))
  );
  const publicPlan =
    urlPlan ?? resolvePublicOfferPlan(storedOffer?.plan ?? null);
  if (!publicPlan) return null;

  const interval: BillingInterval =
    validateBillingInterval(searchParams.get('interval')) ??
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
      <p className='text-[17px] font-[510] leading-[1.25] tracking-[-0.017em] text-primary-token'>
        {getOfferHeading(mode, publicPlan)}
      </p>
      <p className='mt-1 text-[13px] leading-5 text-secondary-token'>
        {getOfferPriceLine(publicPlan, interval)}
      </p>
      <p className='mt-2 text-[12px] leading-5 text-tertiary-token'>{note}</p>
    </aside>
  );
}
