'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';

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

const PLAN_LABELS: Record<NonNullable<CheckoutCardPayload['plan']>, string> = {
  free: 'Free tier',
  pro: 'Pro — $39/mo',
  max: 'Max — $149/mo',
};

export function ChatProposeCheckoutCard({
  payload,
}: ChatProposeCheckoutCardProps) {
  const planLabel = payload.plan ? PLAN_LABELS[payload.plan] : 'Pick a plan';
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
        <p className='text-[13px] text-secondary-token'>Continue to checkout</p>
        <p className='truncate text-[15px] font-semibold text-primary-token'>
          {planLabel}
        </p>
      </div>
      <Link
        href={href}
        className='inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-black transition-colors hover:bg-white/90 focus-ring-themed'
      >
        Continue
        <ArrowRight className='h-4 w-4' aria-hidden />
      </Link>
    </div>
  );
}
