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

/** Stripe's documented PaymentMethod fixture for deterministic test code. */
export const TEST_PAYMENT_METHOD_SUCCESS = 'pm_card_visa';

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

  const phoneInput = page
    .locator('input[name="phoneNumber"]')
    .filter({ visible: true })
    .first();
  if (await phoneInput.isVisible()) {
    await phoneInput.fill('+14155550123');
  }

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

/**
 * Materialize Stripe's documented server-side test output for hosted Checkout.
 *
 * Stripe explicitly prevents automated control of Checkout's front-end. This
 * keeps the Jovie-owned boundary real: the app creates the exact test-mode
 * Checkout Session and customer, Stripe creates and pays a real test
 * subscription with its documented PaymentMethod fixture, and the returned
 * session-shaped object is signed before it enters Jovie's webhook route.
 */
export async function materializeTestCheckoutCompletion(
  stripeClient: Stripe,
  options: {
    readonly sessionId: string;
    readonly priceId: string;
    readonly appUserId: string;
    readonly email: string;
  }
): Promise<{
  session: Stripe.Checkout.Session;
  customerId: string;
  subscriptionId: string;
}> {
  const session = await stripeClient.checkout.sessions.retrieve(
    options.sessionId
  );
  if (session.livemode !== false || session.mode !== 'subscription') {
    throw new Error('Checkout Session must be a test-mode subscription');
  }
  if (session.metadata?.clerk_user_id !== options.appUserId) {
    throw new Error('Checkout Session has mismatched ownership metadata');
  }
  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id;
  if (!customerId) {
    throw new Error('Checkout Session omitted its customer');
  }

  const customer = await stripeClient.customers.retrieve(customerId);
  if (
    customer.deleted ||
    customer.livemode !== false ||
    customer.email !== options.email ||
    customer.metadata.clerk_user_id !== options.appUserId
  ) {
    throw new Error('Checkout customer is not owned by this test run');
  }

  const paymentMethod = await stripeClient.paymentMethods.attach(
    TEST_PAYMENT_METHOD_SUCCESS,
    { customer: customerId }
  );
  if (
    paymentMethod.livemode !== false ||
    paymentMethod.customer !== customerId
  ) {
    throw new Error('Stripe test PaymentMethod did not attach to the customer');
  }

  const subscription = await stripeClient.subscriptions.create(
    {
      customer: customerId,
      items: [{ price: options.priceId }],
      default_payment_method: paymentMethod.id,
      payment_behavior: 'error_if_incomplete',
      metadata: {
        clerk_user_id: options.appUserId,
        checkout_session_id: session.id,
      },
    },
    { idempotencyKey: `jovie-money-path:${session.id}` }
  );
  const subscriptionCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;
  if (
    subscription.livemode !== false ||
    subscription.status !== 'active' ||
    subscriptionCustomerId !== customerId ||
    subscription.items.data[0]?.price.id !== options.priceId
  ) {
    throw new Error('Stripe test subscription did not become active');
  }

  const invoiceId =
    typeof subscription.latest_invoice === 'string'
      ? subscription.latest_invoice
      : subscription.latest_invoice?.id;
  if (!invoiceId) {
    throw new Error('Stripe test subscription omitted its initial invoice');
  }
  const invoice = await stripeClient.invoices.retrieve(invoiceId);
  if (
    invoice.livemode !== false ||
    invoice.status !== 'paid' ||
    invoice.amount_paid <= 0
  ) {
    throw new Error('Stripe test subscription invoice was not paid');
  }

  return {
    session: {
      ...session,
      customer: customerId,
      subscription: subscription.id,
      status: 'complete',
      payment_status: 'paid',
    },
    customerId,
    subscriptionId: subscription.id,
  };
}

/** Expire only the still-open test Checkout Session owned by this run. */
export async function expireRunOwnedTestCheckoutSession(
  stripeClient: Stripe,
  sessionId: string,
  appUserId: string
): Promise<void> {
  const session = await stripeClient.checkout.sessions.retrieve(sessionId);
  if (
    session.livemode !== false ||
    session.metadata?.clerk_user_id !== appUserId
  ) {
    throw new Error('Refusing to expire a Checkout Session owned elsewhere');
  }
  if (session.status === 'open') {
    await stripeClient.checkout.sessions.expire(sessionId);
  }
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

/**
 * Find every customer created for this exact test identity. This closes the
 * cleanup gap where Checkout created a customer but failed before returning
 * the customer or session ID to the test.
 */
export async function findRunOwnedStripeCustomerIds(
  stripeClient: Stripe,
  appUserId: string,
  email: string
): Promise<string[]> {
  const customers = await stripeClient.customers.list({ email, limit: 100 });
  const mismatched = customers.data.find(
    customer =>
      customer.email !== email || customer.metadata.clerk_user_id !== appUserId
  );
  if (mismatched) {
    throw new Error(
      'Refusing Stripe cleanup because an email-matched customer has mismatched ownership'
    );
  }

  return customers.data.map(customer => customer.id);
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
