import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { signInViaRenderedFlow, waitForClerk } from './helpers/deployed-auth';
import {
  completeCardPayment,
  createCheckoutSession,
  ensureUserIsFree,
  fetchSubscriptionBySession,
  getBillingStatus,
  getStripeContextOrSkip,
  interceptTrackingRoutes,
  sendSubscriptionWebhook,
  TEST_CARD_SUCCESS,
} from './helpers/stripe-helpers';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

function getBillingCredentials() {
  return {
    email: process.env.E2E_DEPLOY_USER_EMAIL ?? '',
    password: process.env.E2E_DEPLOY_USER_PASSWORD ?? '',
    verificationCode: process.env.E2E_DEPLOY_USER_CODE ?? '',
  };
}

function getBillingPriceId(): string {
  return process.env.E2E_STAGING_BILLING_PRICE_ID ?? '';
}

test.describe('Staging billing smoke @deploy-billing', () => {
  test.setTimeout(300_000);

  test('checkout completes and webhook side effects land', async ({ page }) => {
    const priceId = getBillingPriceId();
    const { stripeClient } = await getStripeContextOrSkip(priceId);
    const credentials = getBillingCredentials();

    if (!priceId) {
      test.skip(true, 'E2E_STAGING_BILLING_PRICE_ID is not configured');
    }

    await page.goto(APP_ROUTES.SIGNIN, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForClerk(page);

    const result = await signInViaRenderedFlow(page, credentials);
    expect(result).toBe('authenticated');

    await waitForHydration(page);
    await ensureUserIsFree(page, stripeClient);

    try {
      await interceptTrackingRoutes(page);

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
    } finally {
      await ensureUserIsFree(page, stripeClient);
    }
  });
});
