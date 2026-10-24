'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import type { OnboardingClaimHandoff } from './useOnboardingClaim';

/**
 * Inline next-step card shown after the onboarding claim resolves
 * (JOV-8068).
 *
 * The claim hook no longer navigates on its own — a completed claim surfaces
 * this card inside the chat column and the visitor chooses when to leave
 * `/start`. Admitted users continue to checkout; waitlisted users can review
 * their receipt on `/waitlist`.
 */

interface OnboardingClaimHandoffCardProps {
  readonly handoff: OnboardingClaimHandoff;
}

export function OnboardingClaimHandoffCard({
  handoff,
}: OnboardingClaimHandoffCardProps) {
  const isCheckout = handoff.kind === 'checkout';
  const href = isCheckout
    ? APP_ROUTES.ONBOARDING_CHECKOUT
    : APP_ROUTES.WAITLIST;
  const label = isCheckout
    ? 'Continue to checkout'
    : 'View your waitlist status';

  return (
    <div
      className='flex items-center justify-between gap-3 rounded-xl border border-subtle bg-surface-1 px-4 py-3'
      data-testid='onboarding-claim-handoff'
      data-handoff-kind={handoff.kind}
    >
      <div className='min-w-0'>
        <p className='truncate text-mid font-semibold text-primary-token'>
          {label}
        </p>
      </div>
      <Link
        href={href}
        className='inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-app font-semibold text-black transition-colors hover:bg-white/90 focus-ring-themed'
      >
        Continue
        <ArrowRight className='h-4 w-4' aria-hidden />
      </Link>
    </div>
  );
}
