import { randomUUID } from 'node:crypto';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { DEFAULT_DEV_TEST_AUTH_EMAILS } from '@/lib/auth/dev-test-auth-identity';
import { setTestAuthBypassSession } from '../helpers/auth';
import {
  clearDogfoodClaim,
  DOGFOOD_HIGH_REACH_ARTIST,
  DOGFOOD_LOW_REACH_ARTIST,
  grantDogfoodAdminStepUp,
  readActiveClaimVerification,
  readClaimCard,
  readFunnelStages,
  requestDogfoodClaimVerification,
  resetDogfoodBilling,
  resetDogfoodClaimToPending,
  revokeDogfoodJourney,
  routeDogfoodArtistSearch,
  seedDogfoodArtists,
} from './helpers/claim-dogfood-fixtures';
import {
  createCheckoutSession,
  createSignedStripeWebhook,
  ensureUserIsFree,
  expireRunOwnedTestCheckoutSession,
  getBillingStatus,
  getStripeContextOrSkip,
  interceptTrackingRoutes,
  materializeTestCheckoutCompletion,
  postStripeWebhook,
  sendSubscriptionWebhook,
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

/**
 * Dogfood of the live claim offer (Tim, 2026-10-21): the same journey a buyer
 * takes, run by a browser on a schedule and after every staging deploy
 * (.github/workflows/claim-checkout-dogfood.yml). Fixture artists only; the
 * artist search is served by the test, Stripe is test mode, and the synthetic
 * acquisition journey is revoked afterwards so it never counts as a visitor.
 */
test.describe('Claim checkout dogfood', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: { cookies: [], origins: [] } });

  async function useSyntheticJourney(
    context: BrowserContext,
    baseURL: string | undefined
  ): Promise<string> {
    const acquisitionId = randomUUID();
    await context.addCookies([
      {
        name: 'jv_acquisition_id',
        value: acquisitionId,
        url: baseURL ?? 'http://localhost:3100',
        sameSite: 'Lax',
      },
    ]);
    return acquisitionId;
  }

  async function postPricingView(page: Page, acquisitionId: string) {
    const response = await page.request.post('/api/acquisition', {
      data: {
        acquisitionId,
        capturedAt: new Date().toISOString(),
        currentPath: '/pricing',
        firstTouch: { landingPath: '/pricing' },
      },
    });
    expect(response.ok()).toBeTruthy();
  }

  test('search → fixture artist → claim routing records the funnel', async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    await seedDogfoodArtists();
    const acquisitionId = await useSyntheticJourney(context, baseURL);
    await routeDogfoodArtistSearch(page, [
      DOGFOOD_LOW_REACH_ARTIST,
      DOGFOOD_HIGH_REACH_ARTIST,
    ]);

    try {
      await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
      const proCard = page.getByTestId('marketing-pricing-plan-pro');
      await expect(proCard).toContainText('$12');
      await postPricingView(page, acquisitionId);
      await proCard.getByRole('link').first().click();
      await expect(page).toHaveURL(/\/claim\?plan=pro/);

      const options = page.getByTestId('claim-artist-option');
      // Typing before hydration is dropped; retype until the search answers.
      await expect(async () => {
        const search = page.getByTestId('claim-artist-search');
        await search.fill('');
        await search.fill('Dogfood Fixture');
        await expect(options).toHaveCount(2, { timeout: 5_000 });
      }).toPass({ timeout: 45_000 });

      // Below the reach threshold: the proof-checked prebuilt-profile claim.
      const low = await page.request.get(
        `/claim/start?spotify=${DOGFOOD_LOW_REACH_ARTIST.id}`,
        { maxRedirects: 0 }
      );
      expect(low.status()).toBe(307);
      expect(low.headers().location).toContain(
        `/${DOGFOOD_LOW_REACH_ARTIST.handle}/claim?next=auth`
      );

      // At or above it: the buyer's own sign-up and checkout, never a dead end.
      await options.filter({ hasText: DOGFOOD_HIGH_REACH_ARTIST.name }).click();
      await expect(page).toHaveURL(/\/signup\?.*plan=pro/, { timeout: 30_000 });
      expect(decodeURIComponent(page.url())).toContain(
        DOGFOOD_HIGH_REACH_ARTIST.id
      );

      await expect
        .poll(() => readFunnelStages(acquisitionId), { timeout: 15_000 })
        .toEqual(expect.arrayContaining(['pricing', 'claim-start']));
    } finally {
      await revokeDogfoodJourney(acquisitionId);
    }
  });

  test('high reach: pay → pending verification → Ovie card → reject with a test refund, then approve', async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    test.setTimeout(300_000);
    const { stripeClient, priceId } = await getStripeContextOrSkip();
    await seedDogfoodArtists();
    const artist = DOGFOOD_HIGH_REACH_ARTIST;
    const buyerEmail = DEFAULT_DEV_TEST_AUTH_EMAILS['creator-ready'];
    const acquisitionId = await useSyntheticJourney(context, baseURL);

    await interceptTrackingRoutes(page);
    await setTestAuthBypassSession(page, 'creator-ready');
    await ensureUserIsFree(page, stripeClient).catch(async () => {
      await resetDogfoodBilling(buyerEmail);
    });
    const { profileId } = await readActiveClaimVerification(buyerEmail);
    await clearDogfoodClaim(profileId, artist);

    const admin = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const adminPage = await admin.newPage();
    let revokeStepUp: () => Promise<void> = async () => undefined;
    let openSession: { id: string; appUserId: string } | null = null;

    try {
      // Signed-in buyer picks the high-reach fixture: routed to their own
      // onboarding, not linked to the artist.
      const start = await page.request.get(
        `/claim/start?spotify=${artist.id}`,
        { maxRedirects: 0 }
      );
      expect(start.status()).toBe(307);
      expect(start.headers().location).not.toContain('verification_required');

      await requestDogfoodClaimVerification(profileId, artist, acquisitionId);

      // $12 Stripe test checkout, paid with Stripe's test PaymentMethod.
      await page.goto('/claim', { waitUntil: 'domcontentloaded' });
      const { sessionId } = await createCheckoutSession(page, priceId, {
        source: 'onboarding',
        returnTo: '/chat?from=onboarding',
      });
      const session = await stripeClient.checkout.sessions.retrieve(sessionId);
      expect(session.livemode).toBe(false);
      expect(session.amount_total).toBe(1200);
      const appUserId = session.metadata?.clerk_user_id ?? '';
      // The hosted session is never completed by automation; expire it so the
      // next run gets a fresh one.
      openSession = { id: sessionId, appUserId };
      const customerId =
        typeof session.customer === 'string'
          ? session.customer
          : (session.customer?.id ?? '');
      const customer = await stripeClient.customers.retrieve(customerId);
      const email = 'deleted' in customer ? '' : (customer.email ?? '');
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

      // Webhook → pending_verification; the artist is still not linked.
      await expect
        .poll(
          async () =>
            (await readActiveClaimVerification(buyerEmail)).record?.status,
          { timeout: 30_000 }
        )
        .toBe('pending_verification');
      const pending = await readActiveClaimVerification(buyerEmail);
      expect(pending.spotifyId).not.toBe(artist.id);
      expect(pending.record?.paidAt).toBeTruthy();
      expect((await getBillingStatus(page)).isPro).toBe(true);

      // Ovie inbox card for Tim's queue.
      await expect
        .poll(async () => (await readClaimCard(profileId))?.status, {
          timeout: 15_000,
        })
        .toBe('pending');

      // Operator: listed, then approved.
      await setTestAuthBypassSession(adminPage, 'admin');
      revokeStepUp = await grantDogfoodAdminStepUp(
        DEFAULT_DEV_TEST_AUTH_EMAILS.admin
      );
      const list = await adminPage.request.get(
        '/api/admin/claim-verifications?status=pending_verification'
      );
      expect(list.status()).toBe(200);
      expect(JSON.stringify(await list.json())).toContain(profileId);

      // Reject: refund the first month in Stripe test mode and cancel.
      const reject = await adminPage.request.post(
        `/api/admin/claim-verifications/${profileId}/decision`,
        { data: { decision: 'reject', reason: 'dogfood fixture' } }
      );
      expect(reject.status()).toBe(200);
      const rejected = await readActiveClaimVerification(buyerEmail);
      expect(rejected.record?.status).toBe('rejected');
      expect(rejected.spotifyId).not.toBe(artist.id);
      const refundId = rejected.record?.refundId ?? '';
      expect(refundId).toMatch(/^re_/);
      const refund = await stripeClient.refunds.retrieve(refundId);
      expect(refund.amount).toBe(1200);
      const subscription = await stripeClient.subscriptions.retrieve(
        completed.subscriptionId
      );
      expect(subscription.status).toBe('canceled');
      // Stripe's cancellation event removes the entitlement.
      await sendSubscriptionWebhook(
        page,
        stripeClient,
        'customer.subscription.deleted',
        subscription
      );
      await expect
        .poll(async () => (await getBillingStatus(page)).isPro, {
          timeout: 30_000,
        })
        .toBe(false);

      // Approve: the same request, put back to pending, links the artist.
      // A prebuilt profile already holding the artist must not block it.
      await clearDogfoodClaim(profileId, artist);
      await requestDogfoodClaimVerification(profileId, artist, acquisitionId);
      await resetDogfoodClaimToPending(profileId);
      const approve = await adminPage.request.post(
        `/api/admin/claim-verifications/${profileId}/decision`,
        { data: { decision: 'approve', reason: 'dogfood fixture' } }
      );
      expect(
        approve.status(),
        `approve returned ${JSON.stringify(await approve.json().catch(() => null))}`
      ).toBe(200);
      const approved = await readActiveClaimVerification(buyerEmail);
      expect(approved.record?.status).toBe('verified');
      expect(approved.spotifyId).toBe(artist.id);

      expect(await readFunnelStages(acquisitionId)).toEqual(
        expect.arrayContaining([
          'claim-start',
          'checkout',
          'paid',
          'pending-verification',
          'claim-rejected',
          'claim-verified',
        ])
      );
    } finally {
      await clearDogfoodClaim(profileId, artist);
      await ensureUserIsFree(page, stripeClient).catch(async () => {
        await resetDogfoodBilling(buyerEmail);
      });
      if (openSession) {
        await expireRunOwnedTestCheckoutSession(
          stripeClient,
          openSession.id,
          openSession.appUserId
        ).catch(() => undefined);
      }
      await revokeDogfoodJourney(acquisitionId);
      await revokeStepUp();
      await admin.close();
    }
  });
});
