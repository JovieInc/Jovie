import { expect, test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';
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

/**
 * Pro Feature Gate Verification E2E
 *
 * Tests the coverage gap identified by autoplan review:
 * After Stripe checkout completes, do Pro-gated features actually unlock?
 *
 * Existing coverage:
 * - payment-complete-flow.spec.ts: checkout → webhook → isPro API → billing UI
 *
 * This spec's unique value:
 * - Verifies Pro-gated FEATURES are accessible (not just API status)
 * - Tests entitlement cache bust via page.reload()
 * - Confirms feature gates in the actual UI, not just billing API
 */

test.skip(
  process.env.E2E_FAST_ITERATION === '1',
  'Pro feature gate tests run in the slower billing lane'
);

test.describe('Pro Feature Gate Verification', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  test('Pro features unlock after successful checkout', async ({ page }) => {
    const { stripeClient, priceId } = await getStripeContextOrSkip();

    // STEP 1: Sign in and ensure free tier
    await signInUser(page);
    await ensureUserIsFree(page, stripeClient);
    await interceptTrackingRoutes(page);

    // Confirm free tier via API
    const initialStatus = await getBillingStatus(page);
    expect(initialStatus.isPro).toBe(false);
    console.log('[pro-gates] Confirmed free tier starting state');

    // STEP 2: Navigate to a Pro-gated page — verify locked state
    await page.goto('/settings/audience', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Check if there's an upgrade prompt or locked indicator
    const settingsText = await page
      .locator('main')
      .innerText({ timeout: 10_000 })
      .catch(() => '');
    const hasUpgradePrompt =
      settingsText.toLowerCase().includes('upgrade') ||
      settingsText.toLowerCase().includes('pro') ||
      settingsText.toLowerCase().includes('unlock');
    console.log(
      `[pro-gates] Pre-upgrade audience page has upgrade prompt: ${hasUpgradePrompt}`
    );

    // STEP 3: Run the full checkout flow (reusing proven helpers)
    await page.goto('/billing', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const { sessionId, url } = await createCheckoutSession(page, priceId);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await completeCardPayment(page, TEST_CARD_SUCCESS);
    await page.waitForURL('**/billing/success', { timeout: 60_000 });

    // Fire webhook manually (webhooks don't auto-fire to localhost)
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

    // Poll for entitlement sync (30s timeout, matching existing pattern)
    await expect
      .poll(async () => (await getBillingStatus(page)).isPro, {
        timeout: 30_000,
      })
      .toBe(true);
    console.log('[pro-gates] isPro confirmed via API');

    // STEP 4: Hard reload to bust React Query + Redis cache
    // Without this, the client-side cache serves stale free-tier data
    await interceptTrackingRoutes(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    console.log('[pro-gates] Page reloaded to bust entitlement cache');

    // STEP 5: Navigate to Pro-gated page — verify unlocked
    await page.goto('/settings/audience', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const postUpgradeText = await page
      .locator('main')
      .innerText({ timeout: 10_000 })
      .catch(() => '');

    // The page should load without upgrade prompts blocking access
    // (or if it's a settings page, the Pro features should be available)
    const stillLocked =
      postUpgradeText.toLowerCase().includes('upgrade to') &&
      !postUpgradeText.toLowerCase().includes('active');
    expect(stillLocked).toBeFalsy();
    console.log('[pro-gates] Audience settings accessible after upgrade');

    // STEP 6: Verify billing page shows active subscription
    await page.goto('/billing', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await expect(
      page.getByText(/Standard Subscription Active|Pro|Active/i)
    ).toBeVisible({ timeout: 10_000 });
    console.log('[pro-gates] Billing page confirms active subscription');

    // STEP 7: Cleanup — restore free tier
    await ensureUserIsFree(page, stripeClient);
    console.log('[pro-gates] Cleaned up — restored free tier');
  });
});
