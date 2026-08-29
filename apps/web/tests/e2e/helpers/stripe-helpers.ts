/**
 * Shared Stripe E2E test helpers.
 *
 * Extracted from payment-complete-flow.spec.ts for reuse across billing specs.
 * All functions operate against Stripe test mode with locally-signed webhooks.
 */

import type { APIResponse, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import Stripe from 'stripe';

const stripePriceId =
  process.env.STRIPE_PRICE_PRO_MONTHLY ||
  process.env.STRIPE_PRICE_PRO_YEARLY ||
  process.env.STRIPE_PRICE_STANDARD_MONTHLY ||
  process.env.STRIPE_PRICE_STANDARD_YEARLY;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export interface BillingStatus {
  isPro: boolean;
  plan: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export interface SignedStripeWebhook {
  eventId: string;
  payload: string;
  signature: string;
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
export async function getStripeContextOrSkip() {
  try {
    return await getRequiredStripeTestContext();
  } catch (error) {
    test.skip(
      true,
      `Stripe test prerequisites are unavailable: ${String(error)}`
    );
    throw error;
  }
}

/** Fail closed unless every money-path fixture is provably in Stripe test mode. */
export async function getRequiredStripeTestContext(): Promise<{
  stripeClient: Stripe;
  priceId: string;
}> {
  if (!stripePriceId) {
    throw new Error('Stripe price IDs are not configured');
  }
  if (!stripeSecretKey?.startsWith('sk_test_')) {
    throw new Error('STRIPE_SECRET_KEY must be an sk_test_ key');
  }
  if (!stripeWebhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }

  const stripeClient = new Stripe(stripeSecretKey);
  const price = await stripeClient.prices.retrieve(stripePriceId);
  if (price.livemode !== false) {
    throw new Error('Configured Stripe price must have livemode=false');
  }

  return { stripeClient, priceId: stripePriceId };
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
  const webhook = createSignedStripeWebhook(
    stripeClient,
    eventType,
    subscription
  );
  const webhookResponse = await postStripeWebhook(page, webhook);
  expect(webhookResponse.ok()).toBeTruthy();
}

/** Build one deterministic, locally signed Stripe event without sending it. */
export function createSignedStripeWebhook(
  stripeClient: Stripe,
  eventType: Stripe.Event.Type,
  object: Stripe.Event.Data.Object,
  eventId = `evt_jovie_e2e_${Date.now()}`
): SignedStripeWebhook {
  if (!stripeWebhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  const payload = JSON.stringify({
    id: eventId,
    object: 'event',
    type: eventType,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object },
  });

  const signature = stripeClient.webhooks.generateTestHeaderString({
    payload,
    secret: stripeWebhookSecret,
  });

  return { eventId, payload, signature };
}

/** POST a signed fixture through the real application webhook route. */
export async function postStripeWebhook(
  page: Page,
  webhook: SignedStripeWebhook,
  signature = webhook.signature
): Promise<APIResponse> {
  return page.request.post('/api/stripe/webhooks', {
    data: webhook.payload,
    headers: {
      'stripe-signature': signature,
      'content-type': 'application/json',
    },
  });
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
  value: string,
  timeout = 15_000
) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const inputs = frame.locator(selector);
      const count = await inputs.count();

      for (let index = 0; index < count; index += 1) {
        const input = inputs.nth(index);
        if (await input.isVisible()) {
          await input.fill(value);
          return;
        }
      }
    }

    await page.waitForTimeout(250);
  }

  throw new Error(
    `Visible Stripe input not found within ${timeout}ms for selector: ${selector}`
  );
}

/** Complete card payment in the Stripe checkout page. */
export async function completeCardPayment(page: Page, card: CardDetails) {
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

/** Retrieve and validate a completed test-mode subscription Checkout session. */
export async function fetchCompletedTestCheckoutSession(
  stripeClient: Stripe,
  sessionId: string
): Promise<{
  session: Stripe.Checkout.Session;
  customerId: string;
  subscriptionId: string;
}> {
  const session = await stripeClient.checkout.sessions.retrieve(sessionId);
  if (session.livemode !== false) {
    throw new Error('Checkout session must have livemode=false');
  }
  if (session.status !== 'complete' || session.payment_status !== 'paid') {
    throw new Error(
      `Checkout session is not paid and complete (${session.status}/${session.payment_status})`
    );
  }
  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;
  if (!customerId || !subscriptionId) {
    throw new Error('Checkout session omitted customer or subscription');
  }
  return { session, customerId, subscriptionId };
}

/**
 * Delete only the test customer owned by this exact run. Stripe customer
 * deletion cancels its test subscription; mismatched ownership fails closed.
 */
export async function deleteRunOwnedStripeCustomer(
  stripeClient: Stripe,
  customerId: string,
  appUserId: string,
  email: string
): Promise<void> {
  const customer = await stripeClient.customers.retrieve(customerId);
  if (customer.deleted) {
    throw new Error(
      `Run-owned Stripe customer ${customerId} is already deleted`
    );
  }
  if (
    customer.metadata.clerk_user_id !== appUserId ||
    customer.email !== email
  ) {
    throw new Error('Refusing to delete Stripe customer with mismatched owner');
  }
  await stripeClient.customers.del(customerId);
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
