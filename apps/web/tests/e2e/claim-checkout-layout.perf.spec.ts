import { expect, type Page, test } from '@playwright/test';
import { DEFAULT_DEV_TEST_AUTH_EMAILS } from '@/lib/auth/dev-test-auth-identity';
import { setTestAuthBypassSession } from '../helpers/auth';
import {
  createCheckoutSession,
  createSignedStripeWebhook,
  detachCustomerPaymentMethods,
  ensureUserIsFree,
  getBillingStatus,
  getStripeContextOrSkip,
  interceptTrackingRoutes,
  materializeTestCheckoutCompletion,
  postStripeWebhook,
} from './helpers/stripe-helpers';
import { measureWebVitals } from './utils/performance-test-utils';

/**
 * Layout-shift budget for the $12 claim screens (perf class).
 *
 * One spec asserts one class (docs/ON_CALL_PROCESS.md): the functional
 * journey lives in claim-checkout.spec.ts and this file holds only the
 * layout budget, so .github/workflows/claim-checkout-dogfood.yml reports
 * them as two checks. A shift here fails this check, never the revenue
 * canary.
 *
 * The screens are measured in the same state a buyer sees them: /claim as a
 * signed-in free creator, and /billing/success after a real Stripe test-mode
 * webhook made the account Pro. Stripe test mode only
 * (getStripeContextOrSkip fails closed on a live key).
 */

// A paying artist must not watch the claim or unlock screen jump around.
// 0.1 is the Web Vitals "good" ceiling for cumulative layout shift.
const CLS_BUDGET = 0.1;

async function expectStableLayout(page: Page, screen: string): Promise<void> {
  await page.waitForTimeout(1500); // let late shifts land
  const { cls = 0 } = await measureWebVitals(page);
  test
    .info()
    .annotations.push({ type: 'cls', description: `${screen} ${cls}` });
  expect(cls, `${screen} layout shift`).toBeLessThan(CLS_BUDGET);
}

test.describe('Claim checkout layout budget', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: { cookies: [], origins: [] } });

  test('/claim stays under the layout-shift budget', async ({ page }) => {
    const { stripeClient } = await getStripeContextOrSkip();
    await interceptTrackingRoutes(page);
    await setTestAuthBypassSession(page, 'creator');
    await ensureUserIsFree(page, stripeClient);
    // Same entry as a buyer: claim start sets the Pro intent and flow marker.
    const start = await page.request.get('/claim/start?new=1', {
      maxRedirects: 0,
    });
    expect(start.status()).toBe(307);
    await page.goto('/claim', { waitUntil: 'domcontentloaded' });
    await expectStableLayout(page, '/claim');
  });

  test('/billing/success stays under the layout-shift budget', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { stripeClient, priceId } = await getStripeContextOrSkip();
    await interceptTrackingRoutes(page);
    await setTestAuthBypassSession(page, 'creator');
    await ensureUserIsFree(page, stripeClient);
    await detachCustomerPaymentMethods(
      stripeClient,
      DEFAULT_DEV_TEST_AUTH_EMAILS.creator
    );

    await page.goto('/claim', { waitUntil: 'domcontentloaded' });
    const { sessionId } = await createCheckoutSession(page, priceId, {
      source: 'onboarding',
      returnTo: '/chat?from=onboarding',
    });
    const session = await stripeClient.checkout.sessions.retrieve(sessionId);
    expect(session.livemode).toBe(false);
    const appUserId = session.metadata?.clerk_user_id ?? '';
    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer?.id ?? '');
    const customer = await stripeClient.customers.retrieve(customerId);
    const email = 'deleted' in customer ? '' : (customer.email ?? '');

    try {
      const completed = await materializeTestCheckoutCompletion(stripeClient, {
        sessionId,
        priceId,
        appUserId,
        email,
      });
      const webhook = createSignedStripeWebhook(
        stripeClient,
        'checkout.session.completed',
        completed.session
      );
      expect((await postStripeWebhook(page, webhook)).ok()).toBeTruthy();
      await expect
        .poll(async () => (await getBillingStatus(page)).isPro, {
          timeout: 30_000,
        })
        .toBe(true);

      // Same stub as the functional journey: Stripe forbids automating
      // hosted Checkout, so the session never reaches 'complete'. The paid
      // entitlement above is real; only this read is stubbed.
      await page.route('**/api/billing/checkout-session**', route =>
        route.fulfill({
          json: {
            plan: 'pro',
            priceId,
            needsProfile: false,
            proofPending: false,
            profileShareUrl: null,
          },
        })
      );
      await page.goto(`/billing/success?session_id=${sessionId}`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByText(/You're on .+: unlocked/)).toBeVisible({
        timeout: 30_000,
      });
      await expectStableLayout(page, '/billing/success');
    } finally {
      await ensureUserIsFree(page, stripeClient);
      await detachCustomerPaymentMethods(
        stripeClient,
        DEFAULT_DEV_TEST_AUTH_EMAILS.creator
      );
    }
  });
});
