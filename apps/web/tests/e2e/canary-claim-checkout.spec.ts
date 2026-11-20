import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { PRODCERT_CLAIM_CANARY_EMAIL } from '@/lib/synthetic/prodcert-identities';
import {
  canaryResetConfigured,
  resetClaimCanary,
} from './helpers/canary-reset-client';
import {
  createCheckoutSession,
  createSignedStripeWebhook,
  detachCustomerPaymentMethods,
  ensureUserIsFree,
  expireRunOwnedTestCheckoutSession,
  getBillingStatus,
  getStripeContextOrSkip,
  materializeTestCheckoutCompletion,
  postStripeWebhook,
} from './helpers/stripe-helpers';
import { certStep, certStepBlocked } from './utils/prod-cert-steps';
import {
  prepareProductionAuthEmailForm,
  waitForProductionDashboardContent,
} from './utils/production-auth-interaction';
import { waitForProductionAuthOtp } from './utils/production-auth-otp';

/**
 * Sanctioned Stripe TEST-MODE canary checkout producer (JOV-9826 / JOV-6920).
 *
 * The JOV-6920 full-cone scoreboard names 8 checkout/payment + 4 activation
 * cases that need a verified test-mode payment folded into the prod cert.
 * This producer is that walk, bound to the ONE fixed claim-walk canary:
 *
 *   - reset → the canary starts in its exact pre-claim state (JOV-9826
 *     `/api/internal/canary/reset`, CRON_SECRET bearer + single-use
 *     `canary_reset` passage token);
 *   - the canary signs in through the REAL production OTP flow and creates
 *     the checkout session through the REAL `/api/stripe/checkout` route;
 *   - Stripe forbids automating its hosted Checkout UI, so payment is
 *     completed with Stripe's documented test PaymentMethod fixtures and
 *     the signed event goes through the REAL webhook route (the
 *     claim-checkout dogfood precedent, JOV-8805);
 *   - every JOV-6920 cone case is recorded as a prod-cert step (cone-*
 *     check ids) and the canary is reset again in teardown.
 *
 * Test mode only: getStripeContextOrSkip fails closed on a live key,
 * another account, or a price that is not the $12 fixture. No live charges,
 * no real artist profile is ever touched.
 */
test.describe('Canary claim checkout producer (Stripe test mode)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  function runTag(): string {
    return process.env.GITHUB_RUN_ID
      ? `checkout-${process.env.GITHUB_RUN_ID}${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
      : `checkout-local${Date.now().toString(36)}`;
  }

  function requireOrigin(baseURL: string | undefined): string {
    if (!baseURL) throw new Error('This producer requires an exact baseURL');
    return baseURL;
  }

  test('reset → claim → test-mode payment → activation → reset', async ({
    page,
  }, testInfo) => {
    const { stripeClient, priceId } = await getStripeContextOrSkip();
    const origin = requireOrigin(testInfo.project.use.baseURL);
    const tag = runTag();

    // The walk cannot even start without the reset secrets: record the
    // blocked steps so the cert shows the exact unblock, then fail — the
    // producer must never be silently absent (a skipped walk is exactly the
    // false-green the scoreboard exists to prevent).
    if (!canaryResetConfigured()) {
      for (const id of [
        'cone-checkout-success-truthful',
        'cone-checkout-payment-is-authority',
        'cone-checkout-entitlement-agrees',
        'cone-checkout-retry-idempotent',
      ]) {
        certStepBlocked(
          'checkout',
          id,
          'CRON_SECRET/SYNTHETIC_PASSAGE_KEY are not provided to this run (canary reset unconfigured)'
        );
      }
      for (const id of [
        'cone-activation-immediate-value',
        'cone-activation-visible-path',
        'cone-activation-no-dead-end',
        'cone-activation-continue-without-rescue',
      ]) {
        certStepBlocked(
          'onboarding',
          id,
          'CRON_SECRET/SYNTHETIC_PASSAGE_KEY are not provided to this run (canary reset unconfigured)'
        );
      }
      throw new Error(
        'Canary reset secrets (CRON_SECRET/SYNTHETIC_PASSAGE_KEY) are not provided to this run; the JOV-9826 checkout walk cannot run'
      );
    }

    await resetClaimCanary({ request: page.request, origin, runTag: tag });

    try {
      // Real production sign-in as the fixed claim-walk canary (fresh OTP).
      await page.goto(APP_ROUTES.SIGNIN, { waitUntil: 'domcontentloaded' });
      const { submitButton } = await prepareProductionAuthEmailForm(
        page,
        PRODCERT_CLAIM_CANARY_EMAIL
      );
      const otpRequestedAtMs = Date.now();
      await submitButton.click();
      const verificationCode = await waitForProductionAuthOtp({
        email: PRODCERT_CLAIM_CANARY_EMAIL,
        startedAtMs: otpRequestedAtMs,
      });
      const codeInput = page
        .locator('form[data-auth-email-code-step="code"]')
        .first()
        .locator(
          '[data-testid="otp-autofill-input"], input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]'
        )
        .first();
      await expect(codeInput).toBeVisible({ timeout: 10_000 });
      const authenticatedRedirect = page.waitForURL(
        url => url.pathname.startsWith('/app'),
        { timeout: 30_000 }
      );
      await codeInput.fill(verificationCode);
      await authenticatedRedirect;
      await waitForProductionDashboardContent(page);

      // Payment authority ordering: BEFORE any payment the canary is free.
      await ensureUserIsFree(page, stripeClient);
      await detachCustomerPaymentMethods(
        stripeClient,
        PRODCERT_CLAIM_CANARY_EMAIL
      );

      // Claim start captures Pro intent and the claim-flow marker.
      await certStep(
        'checkout',
        'cone-checkout-launches-owned-context',
        async () => {
          const start = await page.request.get('/claim/start?new=1', {
            maxRedirects: 0,
          });
          expect(start.status()).toBe(307);
          const cookies = await page.context().cookies();
          expect(cookies.find(c => c.name === 'jv_claim_flow')?.value).toBe(
            '1'
          );
          expect(cookies.find(c => c.name === 'jovie_plan_intent')?.value).toBe(
            'pro'
          );
          return 'claim start captured pro intent for the canary';
        }
      );

      const { sessionId } = await createCheckoutSession(page, priceId, {
        source: 'onboarding',
        returnTo: '/chat?from=onboarding',
      });

      const session = await stripeClient.checkout.sessions.retrieve(sessionId);
      expect(session.livemode).toBe(false);
      expect(session.amount_total).toBe(1200);
      expect(session.currency).toBe('usd');

      const appUserId = session.metadata?.clerk_user_id ?? '';
      expect(appUserId).not.toBe('');
      const customerId =
        typeof session.customer === 'string'
          ? session.customer
          : (session.customer?.id ?? '');

      // Cancel path FIRST (before the subscription exists): the session's
      // cancel_url is the claim cancel state, and expiring the session can
      // never grant an entitlement.
      await certStep('checkout', 'cone-checkout-cancel-truthful', async () => {
        expect(session.cancel_url).toMatch(/\/claim\?state=checkout_canceled$/);
        await expireRunOwnedTestCheckoutSession(
          stripeClient,
          sessionId,
          appUserId
        );
        const status = await getBillingStatus(page);
        expect(status.isPro).toBe(false);
        return 'cancel URL truthful; expired session granted no entitlement';
      });
      // The success walk needs a live session; create a fresh one.
      const successSession = await createCheckoutSession(page, priceId, {
        source: 'onboarding',
        returnTo: '/chat?from=onboarding',
      });

      // Failure path: a documented attachable-but-declining fixture never
      // grants an entitlement either.
      await certStep('checkout', 'cone-checkout-failure-truthful', async () => {
        const failing = await stripeClient.paymentMethods.attach(
          'pm_card_chargeCustomerFail',
          { customer: customerId }
        );
        let declined = false;
        try {
          await stripeClient.subscriptions.create({
            customer: customerId,
            items: [{ price: priceId }],
            default_payment_method: failing.id,
            payment_behavior: 'error_if_incomplete',
          });
        } catch {
          declined = true;
        }
        expect(declined).toBe(true);
        const status = await getBillingStatus(page);
        expect(status.isPro).toBe(false);
        return 'declined payment granted no entitlement';
      });

      // Success path: materialize Stripe's documented test-mode completion
      // for the REAL app-created session and post the signed event through
      // the REAL webhook route.
      const completed = await materializeTestCheckoutCompletion(stripeClient, {
        sessionId: successSession.sessionId,
        priceId,
        appUserId,
        email: PRODCERT_CLAIM_CANARY_EMAIL,
      });
      const webhook = createSignedStripeWebhook(
        stripeClient,
        'checkout.session.completed',
        completed.session
      );
      expect((await postStripeWebhook(page, webhook)).ok()).toBeTruthy();

      await certStep(
        'checkout',
        'cone-checkout-payment-is-authority',
        async () => {
          const status = await getBillingStatus(page);
          expect(status.isPro).toBe(true);
          expect(status.stripeSubscriptionId).toBe(completed.subscriptionId);
          return 'entitlement exists only after the verified test payment webhook';
        }
      );

      await certStep('checkout', 'cone-checkout-success-truthful', async () => {
        await page.goto(
          `/billing/success?session_id=${successSession.sessionId}`,
          { waitUntil: 'domcontentloaded' }
        );
        await expect(page.getByText(/You're on .+: unlocked/)).toBeVisible({
          timeout: 30_000,
        });
        return 'success return renders the real paid state';
      });

      await certStep(
        'checkout',
        'cone-checkout-entitlement-agrees',
        async () => {
          const status = await getBillingStatus(page);
          expect(status.isPro).toBe(true);
          expect(status.plan).toBe('pro');
          const subscription = await stripeClient.subscriptions.retrieve(
            completed.subscriptionId
          );
          expect(subscription.status).toBe('active');
          expect(subscription.livemode).toBe(false);
          return 'app entitlement agrees with Stripe test subscription state';
        }
      );

      await certStep('checkout', 'cone-checkout-retry-idempotent', async () => {
        // Redeliver the SAME signed event: the second delivery must be
        // reconcilable without changing the entitlement.
        expect((await postStripeWebhook(page, webhook)).ok()).toBeTruthy();
        const status = await getBillingStatus(page);
        expect(status.isPro).toBe(true);
        expect(status.plan).toBe('pro');
        return 'webhook redelivery left the entitlement unchanged';
      });

      // Activation cases (JOV-6920 post-pay phase).
      await certStep(
        'onboarding',
        'cone-activation-immediate-value',
        async () => {
          const status = await getBillingStatus(page);
          expect(status.isPro).toBe(true);
          await page.goto(APP_ROUTES.DASHBOARD, {
            waitUntil: 'domcontentloaded',
          });
          await waitForProductionDashboardContent(page);
          return 'paid canary lands on a working dashboard right after payment';
        }
      );
      await certStep('onboarding', 'cone-activation-visible-path', async () => {
        // The unlock surface names the paid plan and a visible next step.
        await page.goto(
          `/billing/success?session_id=${successSession.sessionId}`,
          { waitUntil: 'domcontentloaded' }
        );
        await expect(page.getByText(/You're on .+: unlocked/)).toBeVisible({
          timeout: 30_000,
        });
        return 'the paid promise has a visible activation path';
      });
      await certStep('onboarding', 'cone-activation-no-dead-end', async () => {
        const body = await page.textContent('body');
        expect(body).not.toMatch(/something went wrong|application error/i);
        return 'no dead-end/error surface after payment';
      });
      await certStep(
        'onboarding',
        'cone-activation-continue-without-rescue',
        async () => {
          // The walk itself continues without founder intervention: the
          // dashboard renders and the session stays valid.
          await page.goto(APP_ROUTES.DASHBOARD, {
            waitUntil: 'domcontentloaded',
          });
          await waitForProductionDashboardContent(page);
          return 'canary continues past payment without manual rescue';
        }
      );
    } finally {
      // The canary returns to its exact pre-claim state: subscription
      // canceled Stripe-side (with webhook), test payment methods detached,
      // then the canary-reset endpoint unclaims the reserved handle.
      try {
        await ensureUserIsFree(page, stripeClient);
      } finally {
        try {
          await detachCustomerPaymentMethods(
            stripeClient,
            PRODCERT_CLAIM_CANARY_EMAIL
          );
        } finally {
          await resetClaimCanary({
            request: page.request,
            origin,
            runTag: tag,
          });
        }
      }
    }
  });
});
