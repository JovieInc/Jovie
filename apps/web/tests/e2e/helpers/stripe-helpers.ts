/**
 * Shared Stripe E2E test helpers.
 *
 * Extracted from payment-complete-flow.spec.ts for reuse across billing specs.
 * All functions operate against Stripe test mode with locally-signed webhooks.
 */

import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import Stripe from 'stripe';

function getDefaultStripePriceId(): string | null {
  return (
    process.env.STRIPE_PRICE_PRO_MONTHLY ||
    process.env.STRIPE_PRICE_PRO_YEARLY ||
    process.env.STRIPE_PRICE_STANDARD_MONTHLY ||
    process.env.STRIPE_PRICE_STANDARD_YEARLY ||
    null
  );
}
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export interface BillingStatus {
  isPro: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

export interface CardDetails {
  number: string;
  exp: string;
  cvc: string;
  postal: string;
}

export const TEST_CARD_SUCCESS: CardDetails = {
  number: '4242424242424242',
  exp: '12/34',
  cvc: '123',
  postal: '94107',
};

export const TEST_CARD_DECLINE: CardDetails = {
  number: '4000000000000002',
  exp: '12/34',
  cvc: '123',
  postal: '94107',
};

/**
 * Validate Stripe env vars are present and price ID is reachable.
 * Calls test.skip() if prerequisites are missing.
 */
export async function getStripeContextOrSkip(priceIdOverride?: string) {
  const priceId = priceIdOverride || getDefaultStripePriceId();

  if (!priceId) {
    test.skip(true, 'Stripe price IDs are not configured');
  }
  if (!stripeSecretKey || !stripeWebhookSecret) {
    test.skip(true, 'Stripe secrets are not configured');
  }

  const stripeClient = new Stripe(stripeSecretKey!);

  try {
    await stripeClient.prices.retrieve(priceId!);
  } catch (error) {
    test.skip(
      true,
      `Stripe is unreachable or price is invalid: ${String(error)}`
    );
  }

  return { stripeClient, priceId: priceId! };
}

/** Fetch current billing status via the app's API. */
export async function getBillingStatus(page: Page): Promise<BillingStatus> {
  const response = await page.request.get('/api/billing/status');
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as BillingStatus;
}

/**
 * Manually fire a Stripe webhook to localhost.
 * Webhooks don't auto-fire to dev servers — we construct a signed payload
 * and POST it directly to /api/stripe/webhooks.
 */
export async function sendSubscriptionWebhook(
  page: Page,
  stripeClient: Stripe,
  eventType: Stripe.Event.Type,
  subscription: Stripe.Subscription
) {
  const payload = JSON.stringify({
    id: `evt_${Date.now()}`,
    object: 'event',
    type: eventType,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object: subscription },
  });

  const signature = stripeClient.webhooks.generateTestHeaderString({
    payload,
    secret: stripeWebhookSecret!,
  });

  const webhookResponse = await page.request.post('/api/stripe/webhooks', {
    data: payload,
    headers: {
      'stripe-signature': signature,
      'content-type': 'application/json',
    },
  });

  expect(webhookResponse.ok()).toBeTruthy();
}

/** Cancel any active subscription so the user starts on free tier. */
export async function ensureUserIsFree(page: Page, stripeClient: Stripe) {
  const status = await getBillingStatus(page);
  if (!status.isPro || !status.stripeSubscriptionId) return;

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

/** Create a Stripe checkout session via the app's API. */
export async function createCheckoutSession(
  page: Page,
  priceId: string
): Promise<CheckoutSessionResult> {
  const response = await page.evaluate(async price => {
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ priceId: price }),
    });

    let body: Record<string, unknown> = {};
    try {
      body = await res.json();
    } catch (error) {
      console.warn('Failed to parse checkout response', error);
    }

    return { ok: res.ok, status: res.status, body };
  }, priceId);

  expect(response.ok).toBeTruthy();
  expect(response.body.sessionId).toBeTruthy();
  expect(response.body.url).toBeTruthy();

  return {
    sessionId: response.body.sessionId as string,
    url: response.body.url as string,
  };
}

/** Fill an input inside a Stripe iframe. */
export async function fillStripeInput(
  page: Page,
  selector: string,
  value: string
) {
  for (const frame of page.frames()) {
    const input = frame.locator(selector);
    if ((await input.count()) > 0) {
      await input.first().fill(value);
      return;
    }
  }

  throw new Error(`Stripe input not found for selector: ${selector}`);
}

/** Complete card payment in the Stripe checkout page. */
export async function completeCardPayment(page: Page, card: CardDetails) {
  await page.waitForSelector('iframe', { timeout: 15_000 });

  await fillStripeInput(page, 'input[name="cardnumber"]', card.number);
  await fillStripeInput(page, 'input[name="exp-date"]', card.exp);
  await fillStripeInput(page, 'input[name="cvc"]', card.cvc);
  await fillStripeInput(page, 'input[name="postal"]', card.postal);

  const payButton = page
    .getByRole('button', {
      name: /pay|subscribe|complete order|start trial|place order/i,
    })
    .first();

  await expect(payButton).toBeEnabled({ timeout: 10_000 });

  await Promise.all([
    page.waitForURL('**/billing/*', { timeout: 60_000 }),
    payButton.click(),
  ]);
}

/** Retrieve the subscription created by a checkout session. */
export async function fetchSubscriptionBySession(
  stripeClient: Stripe,
  sessionId: string
) {
  const session = await stripeClient.checkout.sessions.retrieve(sessionId);
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) {
    throw new Error('Checkout session did not include a subscription');
  }

  return stripeClient.subscriptions.retrieve(subscriptionId);
}

/** Intercept fire-and-forget tracking routes to prevent Turbopack cascade. */
export async function interceptTrackingRoutes(page: Page) {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
}
