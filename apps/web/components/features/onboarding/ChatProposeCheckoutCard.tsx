'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import {
  formatPublicPriceDisplay,
  getPublicPriceClaim,
} from '@/lib/billing/offer-truth';

/**
 * Renders the `proposeCheckout` tool result inside the onboarding chat
 * (JOV-2132 PR 4).
 *
 * v1 is a route handoff to `/onboarding/checkout` — the existing Stripe
 * Checkout flow. Stripe Embedded Checkout iframe inside the chat bubble is
 * gated behind a separate experiment flag (per the plan) pending a
 * Playwright CSP smoke test.
 *
 * Plan intent (free/pro/max) is passed via query string so the existing
 * checkout page renders the correct pricing context immediately.
 */

export interface CheckoutCardPayload {
  readonly action: 'propose_checkout';
  readonly plan: 'free' | 'pro' | 'max' | null;
  readonly handoffUrl: string;
}

interface ChatProposeCheckoutCardProps {
  readonly payload: CheckoutCardPayload;
}

// JOV-7135: labels come from offer truth so the card can never quote a stale price.
function planLabel(plan: NonNullable<CheckoutCardPayload['plan']>): string {
  const claim = getPublicPriceClaim(plan);
  return `${claim.displayName} · ${formatPublicPriceDisplay(claim)}`;
}

export function ChatProposeCheckoutCard({
  payload,
}: ChatProposeCheckoutCardProps) {
  const label = payload.plan ? planLabel(payload.plan) : 'Pick a plan';
  // Trust the handoffUrl from the server if present, but bound it to the
  // canonical onboarding checkout route family so a future tool-result tweak
  // can't redirect us to an unrelated path.
  const href =
    payload.handoffUrl && payload.handoffUrl.startsWith('/onboarding/checkout')
      ? payload.handoffUrl
      : APP_ROUTES.ONBOARDING_CHECKOUT;

  return (
    <div className='flex items-center justify-between gap-3 rounded-xl border border-subtle bg-surface-1 px-4 py-3'>
      <div className='min-w-0'>
        <p className='text-app text-secondary-token'>Continue to checkout</p>
        <p className='truncate text-mid font-semibold text-primary-token'>
          {label}
        </p>
      </div>
      <Link
        href={href}
        className='inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white dark:bg-surface-1 px-4 text-app font-semibold text-black dark:text-white transition-colors hover:bg-white dark:bg-surface-1/90 focus-ring-themed'
      >
        Continue
        <ArrowRight className='h-4 w-4' aria-hidden />
      </Link>
    </div>
  );
}
