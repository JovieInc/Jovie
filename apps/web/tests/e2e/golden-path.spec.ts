import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { createOrReuseTestUserSession } from '../helpers/clerk-auth';

/**
 * Golden Path E2E — Signup -> Onboarding -> Music Fetch -> Stripe
 *
 * Tests the complete new-user journey end to end with REAL data:
 * - No mocks for music fetch
 * - No pre-authenticated state
 * - Real Clerk auth (test environment)
 * - Real Stripe checkout session (test mode)
 *
 * Test artist: "Tim White" (~50 releases, deterministic)
 */

/* ------------------------------------------------------------------ */
/*  Environment gates                                                   */
/* ------------------------------------------------------------------ */

const REQUIRED_ENV = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
} as const;

function hasRealEnv(): boolean {
  return Object.values(REQUIRED_ENV).every(
    v => v && !v.includes('mock') && !v.includes('dummy')
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Block fire-and-forget tracking calls that trigger slow Turbopack cascades. */
async function interceptTrackingCalls(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
}

/**
 * Create a brand-new Clerk test user session.
 * Uses `+clerk_test` email suffix which auto-verifies in Clerk test mode.
 */
async function createFreshUser(page: import('@playwright/test').Page) {
  await setupClerkTestingToken({ page });

  await page.goto('/signin', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  // Wait for Clerk JS to load
  const loaded = await page
    .waitForFunction(
      () => !!(window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded,
      { timeout: 60_000 }
    )
    .then(() => true)
    .catch(() => false);

  if (!loaded) {
    throw new Error('Clerk JS failed to load — cannot create test user');
  }

  const email = `gp-${Date.now().toString(36)}+clerk_test@test.jovie.com`;
  await createOrReuseTestUserSession(page, email);

  // Verify Clerk session is established
  const authed = await page
    .waitForFunction(
      () =>
        !!(window as { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id,
      { timeout: 15_000 }
    )
    .then(() => true)
    .catch(() => false);

  if (!authed) {
    throw new Error('Clerk session not established after signup');
  }

  return email;
}

/* ------------------------------------------------------------------ */
/*  Test suite                                                          */
/* ------------------------------------------------------------------ */

test.describe('Golden Path: Signup -> Onboarding -> Music Fetch -> Stripe', () => {
  test.describe.configure({ mode: 'serial' });

  // Fresh browser — no inherited auth state
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    if (!hasRealEnv()) {
      test.skip(true, 'Real Clerk/DB env vars not configured');
    }
    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      test.skip(true, 'Clerk testing setup was not successful');
    }

    await interceptTrackingCalls(page);
  });

  test('complete user journey from signup to paid subscription', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // ──────────────────────────────────────────────────────────────────
    // STEP 1: Landing page loads
    // ──────────────────────────────────────────────────────────────────
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // A signup CTA must be visible — either the claim input or a signup link
    const signupCta = page
      .locator('#handle-input')
      .or(page.locator('a[href*="/signup"]').first());
    await expect(signupCta.first()).toBeVisible({ timeout: 20_000 });

    // ──────────────────────────────────────────────────────────────────
    // STEP 2: Initiate signup
    // ──────────────────────────────────────────────────────────────────
    const claimInput = page.locator('#handle-input');
    const claimVisible = await claimInput
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (claimVisible) {
      // Use claim handle form — stores pendingClaim in sessionStorage
      const testHandle = `gp-${Date.now().toString(36)}`;
      await claimInput.fill(testHandle);

      // Wait for availability check to complete
      await page.waitForTimeout(2_000);

      // Submit the form
      await claimInput.press('Enter');
    } else {
      // Fall back to signup link
      await page.locator('a[href*="/signup"]').first().click();
    }

    // Should navigate to signup or onboarding
    await page.waitForURL(/\/(signup|onboarding)/, { timeout: 30_000 });

    // ──────────────────────────────────────────────────────────────────
    // STEP 3: Create account
    // ──────────────────────────────────────────────────────────────────
    await createFreshUser(page);

    // ──────────────────────────────────────────────────────────────────
    // STEP 4: Onboarding — Handle step
    // ──────────────────────────────────────────────────────────────────
    // Navigate to dashboard — proxy.ts will redirect to /onboarding
    await page.goto('/app/dashboard', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForURL('**/onboarding**', {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    // The onboarding form wrapper must be present
    await expect(
      page.locator('[data-testid="onboarding-form-wrapper"]')
    ).toBeVisible({
      timeout: 20_000,
    });

    // Fill in handle
    const handleInput = page.getByLabel('Enter your desired handle');
    await expect(handleInput).toBeVisible({ timeout: 20_000 });

    const uniqueHandle = `gp-${Date.now().toString(36)}`;
    await handleInput.fill(uniqueHandle);

    // Wait for availability check to pass (green indicator)
    await expect(page.locator('.text-success').first()).toBeVisible({
      timeout: 20_000,
    });

    // Submit handle step
    const continueBtn = page.getByRole('button', { name: 'Continue' });
    await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
    await continueBtn.click();

    // ──────────────────────────────────────────────────────────────────
    // STEP 5: Onboarding — Artist search (Music Fetch)
    // ──────────────────────────────────────────────────────────────────
    const artistInput = page.getByPlaceholder(
      /search for your artist or paste a spotify link/i
    );
    await expect(artistInput).toBeVisible({ timeout: 20_000 });

    await artistInput.fill('Tim White');

    // Select "Tim White" from results
    const timWhiteResult = page
      .locator('li button')
      .filter({ hasText: /tim white/i })
      .first();
    await expect(timWhiteResult).toBeVisible({ timeout: 20_000 });
    await timWhiteResult.click();

    // ──────────────────────────────────────────────────────────────────
    // STEP 6: Profile review — Music Fetch MUST have populated data
    // ──────────────────────────────────────────────────────────────────

    // Display name must be populated by music fetch enrichment
    const displayName = page.locator('#onboarding-display-name');
    await expect(displayName).toBeVisible({ timeout: 20_000 });

    await expect
      .poll(async () => (await displayName.inputValue()).trim(), {
        timeout: 45_000,
        message:
          'Music fetch enrichment did NOT populate artist display name — this is a critical failure',
      })
      .toMatch(/tim white/i);

    // Bio must be populated (not empty)
    const bio = page.locator('#onboarding-bio');
    await expect
      .poll(async () => (await bio.inputValue()).trim().length, {
        timeout: 45_000,
        message:
          'Music fetch enrichment did NOT populate artist bio — this is a critical failure',
      })
      .toBeGreaterThan(0);

    // Avatar must be loaded (img with Tim White alt text)
    const avatarImage = page.locator(
      'img[alt*="Tim White"], img[alt*="tim white"]'
    );
    await expect(avatarImage.first()).toBeVisible({ timeout: 45_000 });

    // Complete onboarding — go to dashboard
    const goToDashboardBtn = page.getByRole('button', {
      name: /go to dashboard/i,
    });
    await expect(goToDashboardBtn).toBeEnabled({ timeout: 20_000 });
    await goToDashboardBtn.click();

    // ──────────────────────────────────────────────────────────────────
    // STEP 7: Dashboard loaded — profile is sufficiently complete
    // ──────────────────────────────────────────────────────────────────
    await page.waitForURL('**/app/**', {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    // Should NOT be redirected back to onboarding or signin
    const currentUrl = page.url();
    expect(
      currentUrl,
      'Redirected to onboarding — profile not saved'
    ).not.toContain('/onboarding');
    expect(currentUrl, 'Redirected to signin — auth lost').not.toContain(
      '/sign-in'
    );

    // No "complete your profile" nag prompt
    await expect(page.getByText(/complete your profile/i)).toHaveCount(0);

    // Verify public profile has at least one DSP link
    await page.goto(`/${uniqueHandle}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await expect(
      page
        .locator(
          'a[href*="open.spotify.com"], a[href*="music.apple.com"], a[href*="youtube.com"], a[href*="soundcloud.com"]'
        )
        .first()
    ).toBeVisible({ timeout: 30_000 });

    // ──────────────────────────────────────────────────────────────────
    // STEP 8: Stripe checkout session creation
    // ──────────────────────────────────────────────────────────────────

    // Get available pricing
    const pricingResponse = await page.request.get(
      '/api/stripe/pricing-options'
    );
    expect(
      pricingResponse.ok(),
      'Stripe pricing API returned non-200'
    ).toBeTruthy();

    const pricingJson = (await pricingResponse.json()) as {
      pricingOptions?: Array<{ priceId?: string }>;
      options?: Array<{ priceId?: string }>;
    };

    const firstPriceId =
      pricingJson.pricingOptions?.find(o => o.priceId)?.priceId ??
      pricingJson.options?.find(o => o.priceId)?.priceId;

    expect(
      firstPriceId,
      'No Stripe price ID returned — billing not configured'
    ).toBeTruthy();

    // Create checkout session
    const checkoutResponse = await page.request.post('/api/stripe/checkout', {
      data: { priceId: firstPriceId },
    });
    expect(
      checkoutResponse.ok(),
      'Stripe checkout session creation failed'
    ).toBeTruthy();

    const checkoutJson = (await checkoutResponse.json()) as { url?: string };
    expect(
      checkoutJson.url,
      'Stripe checkout URL missing — checkout session not created'
    ).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  });
});
