import type { Page } from '@playwright/test';
import Stripe from 'stripe';
import { signInUser } from '../helpers/clerk-auth';
import { expect, test } from './setup';

const stripePriceId =
  process.env.STRIPE_PRICE_STANDARD_MONTHLY ||
  process.env.STRIPE_PRICE_STANDARD_YEARLY;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

interface BillingStatus {
  isPro: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

interface CardDetails {
  number: string;
  exp: string;
  cvc: string;
  postal: string;
}

async function getStripeContextOrSkip() {
  if (!stripePriceId) {
    test.skip(true, 'Stripe price IDs are not configured');
  }
  if (!stripeSecretKey || !stripeWebhookSecret) {
    test.skip(true, 'Stripe secrets are not configured');
  }

  const stripeClient = new Stripe(stripeSecretKey!);

  try {
    await stripeClient.prices.retrieve(stripePriceId!);
  } catch (error) {
    test.skip(
      true,
      `Stripe is unreachable or price is invalid: ${String(error)}`
    );
  }

  return { stripeClient, priceId: stripePriceId! };
}

async function getBillingStatus(page: Page): Promise<BillingStatus> {
  const response = await page.request.get('/api/billing/status');
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as BillingStatus;
}

async function sendSubscriptionWebhook(
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

async function ensureUserIsFree(page: Page, stripeClient: Stripe) {
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

async function createCheckoutSession(
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

async function fillStripeInput(page: Page, selector: string, value: string) {
  for (const frame of page.frames()) {
    const input = frame.locator(selector);
    if ((await input.count()) > 0) {
      await input.first().fill(value);
      return;
    }
  }

  throw new Error(`Stripe input not found for selector: ${selector}`);
}

async function completeCardPayment(page: Page, card: CardDetails) {
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

async function fetchSubscriptionBySession(
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

test.describe('Billing payment flow - Stripe Checkout', () => {
  test.describe.configure({ mode: 'serial' });

  test('completes Standard upgrade and reflects on dashboard', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const { stripeClient, priceId } = await getStripeContextOrSkip();

    await signInUser(page);
    await ensureUserIsFree(page, stripeClient);

    await page.goto('/billing', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('button', { name: /upgrade to standard/i })
    ).toBeVisible({ timeout: 15_000 });

    const { sessionId, url } = await createCheckoutSession(page, priceId);

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await completeCardPayment(page, {
      number: '4242424242424242',
      exp: '12/34',
      cvc: '123',
      postal: '94107',
    });

    await page.waitForURL('**/billing/success', { timeout: 60_000 });

    const subscription = await fetchSubscriptionBySession(
      stripeClient,
      sessionId
    );

    await sendSubscriptionWebhook(
      page,
      stripeClient,
      'customer.subscription.created',
      subscription
    );

    await expect
      .poll(async () => (await getBillingStatus(page)).isPro, {
        timeout: 30_000,
      })
      .toBe(true);

    await page.goto('/billing', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Standard Subscription Active/i)).toBeVisible({
      timeout: 10_000,
    });

    await ensureUserIsFree(page, stripeClient);
  });

  test('surfaces card declines during checkout', async ({ page }) => {
    test.setTimeout(90_000);

    const { stripeClient, priceId } = await getStripeContextOrSkip();

    await signInUser(page);
    await ensureUserIsFree(page, stripeClient);

    const { url } = await createCheckoutSession(page, priceId);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await page.waitForURL(/stripe\.com/, { timeout: 15_000 });

    await fillStripeInput(page, 'input[name="cardnumber"]', '4000000000000002');
    await fillStripeInput(page, 'input[name="exp-date"]', '12/34');
    await fillStripeInput(page, 'input[name="cvc"]', '123');
    await fillStripeInput(page, 'input[name="postal"]', '94107');

    const payButton = page
      .getByRole('button', {
        name: /pay|subscribe|complete order|start trial|place order/i,
      })
      .first();

    await expect(payButton).toBeEnabled({ timeout: 10_000 });
    await payButton.click();

    await expect(
      page.getByText(/card was declined|card has been declined/i)
    ).toBeVisible({ timeout: 20_000 });

    const status = await getBillingStatus(page);
    expect(status.isPro).toBe(false);
  });
});

test.describe('Billing plan selection resiliency', () => {
  test('shows recovery UI when pricing cannot load', async ({ page }) => {
    // Set up Clerk testing token before sign-in
    const { setupClerkTestingToken } = await import(
      '@clerk/testing/playwright'
    );
    await setupClerkTestingToken({ page });

    try {
      await signInUser(page);
    } catch {
      console.log('⚠ Sign-in failed for billing resiliency test — skipping');
      test.skip();
      return;
    }

    await page.route('**/api/stripe/pricing-options', route =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'forced-pricing-failure' }),
      })
    );

    await page.goto('/billing', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await expect(page.getByTestId('billing-error-state')).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(/Billing is temporarily unavailable/i)
    ).toBeVisible({ timeout: 10_000 });

    await page.unroute('**/api/stripe/pricing-options');
  });
});
