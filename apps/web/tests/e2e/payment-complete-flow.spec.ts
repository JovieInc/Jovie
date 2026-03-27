import { signInUser } from '../helpers/clerk-auth';
import {
  completeCardPayment,
  createCheckoutSession,
  ensureUserIsFree,
  fetchSubscriptionBySession,
  fillStripeInput,
  getBillingStatus,
  getStripeContextOrSkip,
  interceptTrackingRoutes,
  sendSubscriptionWebhook,
  TEST_CARD_DECLINE,
  TEST_CARD_SUCCESS,
} from './helpers/stripe-helpers';
import { expect, test } from './setup';

test.skip(
  process.env.E2E_FAST_ITERATION === '1',
  'End-to-end billing checkout runs in the slower billing lane'
);

test.describe('Billing payment flow - Stripe Checkout', () => {
  test.describe.configure({ mode: 'serial' });
  // signInUser needs 180s+ for Clerk + Turbopack, plus Stripe checkout page loads
  test.setTimeout(300_000);

  test('completes Standard upgrade and reflects on dashboard', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const { stripeClient, priceId } = await getStripeContextOrSkip();

    await signInUser(page);
    await ensureUserIsFree(page, stripeClient);

    await interceptTrackingRoutes(page);
    await page.goto('/billing', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('button', { name: /upgrade to standard/i })
    ).toBeVisible({ timeout: 15_000 });

    const { sessionId, url } = await createCheckoutSession(page, priceId);

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await completeCardPayment(page, TEST_CARD_SUCCESS);

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

    await interceptTrackingRoutes(page);
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

    await fillStripeInput(
      page,
      'input[name="cardnumber"]',
      TEST_CARD_DECLINE.number
    );
    await fillStripeInput(
      page,
      'input[name="exp-date"]',
      TEST_CARD_DECLINE.exp
    );
    await fillStripeInput(page, 'input[name="cvc"]', TEST_CARD_DECLINE.cvc);
    await fillStripeInput(
      page,
      'input[name="postal"]',
      TEST_CARD_DECLINE.postal
    );

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

    await interceptTrackingRoutes(page);
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
