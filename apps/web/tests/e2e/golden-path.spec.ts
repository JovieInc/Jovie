import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { neon } from '@neondatabase/serverless';
import { expect, test } from '@playwright/test';

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

/** Spotify artist ID for the test artist "Tim White" */
const TEST_SPOTIFY_ARTIST_ID = '4Uwpa6zW3zzCSQvooQNksm';

/**
 * Pre-create a DB user row via direct Neon HTTP query.
 *
 * The onboarding page's server component creates users via the WebSocket
 * pool, but concurrent SSR renders in Next.js can abort the pool queries.
 * Pre-creating the user avoids this race condition.
 *
 * Also releases the test Spotify artist ID from any previous test profiles
 * to avoid unique constraint violations on repeated runs.
 */
async function ensureDbUser(clerkUserId: string, email: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required for DB user creation');

  const sql = neon(dbUrl);

  // Release the test Spotify artist ID from any previous test profiles
  // so connectSpotifyArtist won't fail with a unique constraint violation
  await sql`
    UPDATE creator_profiles
    SET spotify_id = NULL, spotify_url = NULL
    WHERE spotify_id = ${TEST_SPOTIFY_ARTIST_ID}
  `;

  await sql`
    INSERT INTO users (clerk_id, email, user_status)
    VALUES (${clerkUserId}, ${email}, 'waitlist_approved')
    ON CONFLICT (clerk_id) DO UPDATE SET
      email = ${email},
      user_status = 'waitlist_approved',
      updated_at = NOW()
  `;
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
 *
 * For +clerk_test emails, Clerk requires completing email verification
 * with the magic code 424242 before a session is created.
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

  // Create user and complete email verification with test code 424242
  // NOTE: Clerk JS exposes signUp on window.Clerk.client, not window.Clerk directly
  // Returns the Clerk user ID for DB pre-seeding
  const clerkUserId = await page.evaluate(async (targetEmail: string) => {
    const clerkInstance = (window as any).Clerk;
    if (!clerkInstance) throw new Error('Clerk not initialized');

    // If already signed in, return existing user ID
    if (clerkInstance.user?.id && clerkInstance.session) {
      return clerkInstance.user.id as string;
    }

    const client = clerkInstance.client;
    if (!client?.signUp) throw new Error('Clerk client.signUp not available');

    // Create signup
    const signUp = await client.signUp.create({
      emailAddress: targetEmail,
    });

    // For +clerk_test emails, we must complete email verification
    // Clerk test mode accepts magic code 424242
    await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
    const result = await signUp.attemptEmailAddressVerification({
      code: '424242',
    });

    // Activate the session created by completed signup
    if (result.createdSessionId) {
      await clerkInstance.setActive({ session: result.createdSessionId });
    } else {
      throw new Error(
        `Signup completed with status "${result.status}" but no session was created`
      );
    }

    // Return the new user's Clerk ID
    return clerkInstance.user?.id as string;
  }, email);

  if (!clerkUserId) {
    throw new Error('Clerk session not established after signup');
  }

  // Pre-create DB user via direct Neon HTTP query to avoid SSR abort issues
  await ensureDbUser(clerkUserId, email);

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
    // Generate a unique handle and pass it via search param.
    // When the handle is pre-filled via ?handle=, the validation hook's
    // fast path marks it as available immediately (skips API check),
    // avoiding the TanStack Pacer debouncer state race condition.
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const uniqueHandle = `t${Date.now().toString(36)}${randomSuffix}`;

    // Navigate to onboarding with pre-filled handle. Retry page loads
    // since Neon serverless connections can fail during SSR.
    await expect(async () => {
      await page.goto(`/onboarding?handle=${uniqueHandle}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await expect(
        page.locator('[data-testid="onboarding-form-wrapper"]')
      ).toBeVisible({ timeout: 10_000 });
    }).toPass({
      timeout: 60_000,
      intervals: [3_000, 5_000, 10_000],
    });

    // Handle input should be pre-filled with our unique handle
    const handleInput = page.getByLabel('Enter your desired handle');
    await expect(handleInput).toBeVisible({ timeout: 20_000 });
    await expect(handleInput).toHaveValue(uniqueHandle, { timeout: 5_000 });

    // Continue button should be enabled immediately since the validation
    // hook's fast path skips the API call for pre-filled handles
    const continueBtn = page.getByRole('button', { name: 'Continue' });
    await expect(continueBtn).toBeEnabled({ timeout: 15_000 });
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
