import { expect, test } from '@playwright/test';
import { setTestAuthBypassSession } from '../helpers/auth';
import {
  createCheckoutSession,
  createSignedStripeWebhook,
  ensureUserIsFree,
  getBillingStatus,
  getStripeContextOrSkip,
  interceptTrackingRoutes,
  materializeTestCheckoutCompletion,
  postStripeWebhook,
} from './helpers/stripe-helpers';

/**
 * $12/month self-serve artist profile (EVENT: Tim, 2026-10-20):
 * /pricing → /claim → claim start → sign-in → Stripe test checkout →
 * signed webhook → Pro entitlement → claim success state.
 *
 * Runs only against Stripe test mode (getStripeContextOrSkip fails closed on
 * a live key, another account, or a price that is not the $12 fixture).
 * Stripe forbids automating its hosted Checkout UI, so payment is completed
 * with Stripe's documented test PaymentMethod and the signed event goes
 * through the real webhook route.
 */
test.describe('Self-serve artist profile checkout', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('pricing points Pro at the self-serve claim flow', async ({ page }) => {
    await interceptTrackingRoutes(page);
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    const proCard = page.getByTestId('marketing-pricing-plan-pro');
    await expect(proCard).toContainText('$12');
    await expect(proCard.getByRole('link').first()).toHaveAttribute(
      'href',
      '/claim?plan=pro'
    );

    await page.goto('/claim?plan=pro', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('claim-artist-search')).toBeVisible();
    await expect(page.getByTestId('claim-create-profile')).toHaveAttribute(
      'href',
      '/claim/start?new=1'
    );
  });

  test('claim → test checkout → webhook grants the $12 Pro entitlement', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { stripeClient, priceId } = await getStripeContextOrSkip();
    await interceptTrackingRoutes(page);
    await setTestAuthBypassSession(page, 'creator');
    await ensureUserIsFree(page, stripeClient);

    // Claim start captures Pro monthly intent and the claim-flow marker.
    const start = await page.request.get('/claim/start?new=1', {
      maxRedirects: 0,
    });
    expect(start.status()).toBe(307);
    const cookies = await page.context().cookies();
    expect(cookies.find(c => c.name === 'jv_claim_flow')?.value).toBe('1');
    expect(cookies.find(c => c.name === 'jovie_plan_intent')?.value).toBe(
      'pro'
    );

    await page.goto('/claim', { waitUntil: 'domcontentloaded' });
    const { sessionId } = await createCheckoutSession(page, priceId, {
      source: 'onboarding',
      returnTo: '/chat?from=onboarding',
    });

    const session = await stripeClient.checkout.sessions.retrieve(sessionId);
    expect(session.livemode).toBe(false);
    expect(session.amount_total).toBe(1200);
    expect(session.currency).toBe('usd');
    expect(session.success_url).toContain('/billing/success?session_id=');
    expect(session.cancel_url).toMatch(/\/claim\?state=checkout_canceled$/);

    const appUserId = session.metadata?.clerk_user_id ?? '';
    expect(appUserId).not.toBe('');
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
      expect((await getBillingStatus(page)).plan).toBe('pro');

      // An existing subscriber is never charged twice.
      const again = await page.request.get('/claim/start?new=1', {
        maxRedirects: 0,
      });
      expect(again.headers().location).toContain(
        '/claim?state=already_subscribed'
      );
    } finally {
      // The persona keeps its Stripe customer; only the test subscription
      // is canceled so the next run starts free.
      await ensureUserIsFree(page, stripeClient);
    }
  });
});
