/**
 * Persona billing hygiene for the Stripe E2E money-path helpers.
 *
 * Extracted from stripe-helpers.ts: that file is pinned by the shrink-only
 * size-500 baseline (Company guards) and the JOV-8805 orphan-subscription
 * sweep could not fit. Imports stay one-way (this module -> stripe-helpers).
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type Stripe from 'stripe';
import { getBillingStatus } from './billing-status';
import { sendSubscriptionWebhook } from './stripe-helpers';

/**
 * Cancel every active test-mode subscription Stripe still holds for the
 * persona email's customer(s). The Stripe test account is shared while the
 * database is ephemeral, so a run that dies between payment and cleanup —
 * or whose cleanup ran after the local billing rows were reset — leaves the
 * subscription active in Stripe only. The checkout route then answers every
 * fresh /api/stripe/checkout with the already-subscribed billing-portal
 * session (`bps_...`) instead of a checkout session, which is exactly the
 * "No such checkout.session: bps_..." failure at claim-checkout.spec.ts:337
 * (JOV-8805, 2026-11-24). Same ownership model as
 * detachCustomerPaymentMethods: persona-email customers, test mode only.
 * Bounded sweep; call at journey start before checkout.
 */
export async function cancelPersonaActiveSubscriptions(
  stripeClient: Stripe,
  email: string
): Promise<number> {
  const customers = await stripeClient.customers.list({ email, limit: 10 });
  let cancelled = 0;
  for (const customer of customers.data) {
    if (customer.deleted || customer.livemode !== false) continue;
    const subscriptions = await stripeClient.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 100,
    });
    for (const subscription of subscriptions.data) {
      if (
        !['active', 'trialing', 'past_due', 'unpaid'].includes(
          subscription.status
        )
      ) {
        continue;
      }
      await stripeClient.subscriptions.cancel(subscription.id);
      cancelled += 1;
      // Runaway guard: a persona holds a handful of subscriptions at most.
      if (cancelled >= 100) return cancelled;
    }
  }
  return cancelled;
}

/**
 * Cancel any active subscription so the user starts on free tier.
 *
 * Two layers: the local billing linkage (subscription id on the app user)
 * is cancelled and mirrored through the webhook; then, when `personaEmail`
 * is given, provider-only orphans on the persona's Stripe customers are
 * swept too — `resetDogfoodBilling` clears local rows before cleanup can
 * read them, so a local-status-only check can miss an active Stripe-side
 * subscription and the next checkout is answered with the billing-portal
 * already-subscribed session (JOV-8805). Cancelled subscriptions stay in
 * the persona's history; nothing is deleted and no other customer is
 * touched. Stripe test mode only.
 */
export async function ensureUserIsFree(
  page: Page,
  stripeClient: Stripe,
  personaEmail?: string
) {
  const status = await getBillingStatus(page);
  if (status.isPro && status.stripeSubscriptionId) {
    const cancelled = await stripeClient.subscriptions.cancel(
      status.stripeSubscriptionId
    );
    await sendSubscriptionWebhook(
      page,
      stripeClient,
      'customer.subscription.deleted',
      cancelled
    );

    await expect
      .poll(async () => (await getBillingStatus(page)).isPro, {
        timeout: 30_000,
      })
      .toBe(false);
  }

  if (personaEmail) {
    await cancelPersonaActiveSubscriptions(stripeClient, personaEmail);
  }
}
