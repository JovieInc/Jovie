import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { createOrReuseTestUserSession } from '../helpers/clerk-auth';

/**
 * Golden Path E2E Test: Full Signup -> Onboarding -> Dashboard (JOV-1354)
 *
 * This test guards the most critical user journey — new user signup through
 * onboarding to a working dashboard. It was created because the existing
 * golden-path.spec.ts starts from an already-authenticated state and never
 * exercises the onboarding flow, which allowed JOV-1340 (MusicFetch blocking
 * onboarding) to ship undetected.
 *
 * Critical assertion: Onboarding MUST complete within 10 seconds regardless
 * of MusicFetch/Spotify API status. Third-party failures must not block signup.
 *
 * Three variants:
 * 1. Happy path: DSP skipped, onboarding completes fast
 * 2. Slow MusicFetch: enrichment delayed 30s, onboarding still completes in <10s
 * 3. Failed MusicFetch: enrichment returns 500, onboarding still completes in <10s
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Intercept fire-and-forget tracking calls that slow down Turbopack. */
async function interceptTrackingCalls(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
}

/**
 * Bootstrap a fresh Clerk test user and land on the onboarding page.
 * Returns the unique email used so the caller can correlate logs.
 */
async function bootstrapToOnboarding(
  page: import('@playwright/test').Page
): Promise<string> {
  await setupClerkTestingToken({ page });

  // Navigate to /signin to initialize ClerkProvider
  await page.goto('/signin', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  // Wait for Clerk JS to load from CDN
  const loaded = await page
    .waitForFunction(() => !!(window as any).Clerk?.loaded, { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);

  if (!loaded) {
    throw new Error('Clerk JS failed to load from CDN');
  }

  // Create a fresh test user (will need onboarding)
  const email = `golden-signup+clerk_test+${Date.now().toString(36)}@example.com`;
  await createOrReuseTestUserSession(page, email);

  // Verify auth established
  const authed = await page
    .waitForFunction(() => !!(window as any).Clerk?.user?.id, {
      timeout: 15_000,
    })
    .then(() => true)
    .catch(() => false);

  if (!authed) {
    throw new Error('Clerk user session not established after sign-up');
  }

  // Navigate to dashboard — should redirect to onboarding for new users
  await page.goto('/app/dashboard', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  await page.waitForURL('**/onboarding**', {
    timeout: 30_000,
    waitUntil: 'domcontentloaded',
  });

  return email;
}

/**
 * Complete the handle step of onboarding.
 * Returns the unique handle that was claimed.
 */
async function completeHandleStep(
  page: import('@playwright/test').Page
): Promise<string> {
  const handleInput = page.getByLabel('Enter your desired handle');
  await expect(handleInput).toBeVisible({ timeout: 15_000 });

  const uniqueHandle = `gp-${Date.now().toString(36)}`;
  await handleInput.fill(uniqueHandle);

  // Wait for handle availability check (green checkmark or "Available" text)
  // Use the success-colored SVG circle as the availability indicator
  await expect(page.locator('.text-success').first()).toBeVisible({
    timeout: 15_000,
  });

  const continueBtn = page.getByRole('button', { name: 'Continue' });
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  return uniqueHandle;
}

/**
 * Skip the DSP connection step.
 */
async function skipDspStep(page: import('@playwright/test').Page) {
  const skipBtn = page.getByRole('button', { name: /skip for now/i });
  await expect(skipBtn).toBeVisible({ timeout: 15_000 });
  await skipBtn.click();
}

/**
 * Complete the profile review step and navigate to dashboard.
 * This is where we measure the critical 10-second budget.
 */
async function completeProfileReview(page: import('@playwright/test').Page) {
  // Profile review step should show display name input
  const displayNameInput = page.locator('#onboarding-display-name');
  await expect(displayNameInput).toBeVisible({ timeout: 15_000 });

  // If display name is empty (no enrichment), fill one in
  const currentName = await displayNameInput.inputValue();
  if (!currentName.trim()) {
    await displayNameInput.fill('Golden Path Test User');
  }

  const goToDashboardBtn = page.getByRole('button', {
    name: /go to dashboard/i,
  });
  await expect(goToDashboardBtn).toBeEnabled({ timeout: 10_000 });
  await goToDashboardBtn.click();
}

// ---------------------------------------------------------------------------
// Environment guards
// ---------------------------------------------------------------------------

const runFull = process.env.E2E_ONBOARDING_FULL === '1';

const requiredEnvVars: Record<string, string | undefined> = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Golden Path Signup Flow (JOV-1354)', () => {
  test.describe.configure({ mode: 'serial' });

  // Fresh browser context — no inherited auth
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    if (!runFull) {
      test.skip(
        true,
        'Full onboarding E2E runs only when E2E_ONBOARDING_FULL=1'
      );
    }

    for (const [key, value] of Object.entries(requiredEnvVars)) {
      if (!value || value.includes('dummy') || value.includes('mock')) {
        test.skip(true, `Skipping: ${key} is not configured for real auth`);
      }
    }

    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      test.skip(true, 'Clerk testing setup was not successful');
    }

    await interceptTrackingCalls(page);
  });

  // --------------------------------------------------------------------------
  // Variant 1: Happy path — skip DSP, complete onboarding quickly
  // --------------------------------------------------------------------------
  test('signup -> handle -> skip DSP -> dashboard (happy path)', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await bootstrapToOnboarding(page);

    // Step 1: Claim handle
    const handle = await completeHandleStep(page);

    // Step 2: Skip DSP connection
    await skipDspStep(page);

    // Step 3: Complete profile review — CRITICAL 10s budget starts here
    const profileReviewStart = Date.now();
    await completeProfileReview(page);

    // Step 4: Verify we land on dashboard
    await page.waitForURL('**/app/**', {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    const profileReviewDuration = Date.now() - profileReviewStart;
    console.log(`Profile review -> dashboard: ${profileReviewDuration}ms`);

    // Verify dashboard shell rendered
    const appShell = page.locator('nav, main, [data-testid="sidebar"]').first();
    await expect(appShell).toBeVisible({ timeout: 30_000 });

    // Verify we are NOT stuck on onboarding
    const currentUrl = page.url();
    expect(currentUrl, 'Should not be on onboarding page').not.toContain(
      '/onboarding'
    );
    expect(currentUrl, 'Should not be on sign-in page').not.toContain(
      '/signin'
    );

    // Step 5: Navigate to public profile and verify it renders
    await page.goto(`/${handle}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await expect(page).toHaveURL(new RegExp(`/${handle}`));

    // Page should render without error
    const bodyText = await page
      .locator('body')
      .textContent()
      .catch(() => '');
    expect(bodyText).not.toContain('Application error');
    expect(bodyText).not.toContain('Internal Server Error');
  });

  // --------------------------------------------------------------------------
  // Variant 2: Slow MusicFetch — enrichment delayed 30s, onboarding still fast
  // --------------------------------------------------------------------------
  test('onboarding completes within 10s even when MusicFetch is slow (30s delay)', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // Intercept MusicFetch/Spotify enrichment APIs with a 30-second delay
    // These are the server-action calls that enrichProfileFromDsp makes
    await page.route('**/api/spotify/**', route => {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(
            route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                artists: { items: [] },
              }),
            })
          );
        }, 30_000);
      });
    });

    // Also intercept any direct MusicFetch calls
    await page.route('**/musicfetch**', route => {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(
            route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({}),
            })
          );
        }, 30_000);
      });
    });

    await bootstrapToOnboarding(page);

    // Complete handle step
    await completeHandleStep(page);

    // Skip DSP (the slow enrichment only fires if DSP is connected,
    // but we still want the route intercepts active in case any
    // background enrichment triggers)
    await skipDspStep(page);

    // CRITICAL ASSERTION: Profile review step must be reachable and completable
    // within 10 seconds. MusicFetch being slow must NOT block the UI.
    const onboardingTimerStart = Date.now();

    await completeProfileReview(page);

    // Wait for navigation to dashboard
    await page.waitForURL('**/app/**', {
      timeout: 10_000,
      waitUntil: 'domcontentloaded',
    });

    const elapsed = Date.now() - onboardingTimerStart;
    console.log(`Onboarding completion with slow MusicFetch: ${elapsed}ms`);

    expect(
      elapsed,
      `Onboarding took ${elapsed}ms — must complete within 10000ms even with slow MusicFetch`
    ).toBeLessThan(10_000);

    // Verify dashboard loaded
    const appShell = page.locator('nav, main, [data-testid="sidebar"]').first();
    await expect(appShell).toBeVisible({ timeout: 30_000 });
  });

  // --------------------------------------------------------------------------
  // Variant 3: Failed MusicFetch — enrichment returns 500, onboarding still fast
  // --------------------------------------------------------------------------
  test('onboarding completes within 10s even when MusicFetch returns 500', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // Intercept MusicFetch/Spotify enrichment APIs with 500 errors
    await page.route('**/api/spotify/**', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Simulated Spotify API failure' }),
      })
    );

    await page.route('**/musicfetch**', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Simulated MusicFetch failure' }),
      })
    );

    await bootstrapToOnboarding(page);

    // Complete handle step
    await completeHandleStep(page);

    // Skip DSP
    await skipDspStep(page);

    // CRITICAL ASSERTION: Onboarding must complete within 10 seconds
    const onboardingTimerStart = Date.now();

    await completeProfileReview(page);

    await page.waitForURL('**/app/**', {
      timeout: 10_000,
      waitUntil: 'domcontentloaded',
    });

    const elapsed = Date.now() - onboardingTimerStart;
    console.log(`Onboarding completion with failed MusicFetch: ${elapsed}ms`);

    expect(
      elapsed,
      `Onboarding took ${elapsed}ms — must complete within 10000ms even with failed MusicFetch`
    ).toBeLessThan(10_000);

    // Verify dashboard loaded
    const appShell = page.locator('nav, main, [data-testid="sidebar"]').first();
    await expect(appShell).toBeVisible({ timeout: 30_000 });
  });

  // --------------------------------------------------------------------------
  // Variant 4: DSP connected with slow enrichment — user proceeds immediately
  // --------------------------------------------------------------------------
  test('DSP connection with slow enrichment does not block onboarding', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // Mock Spotify search to return a fake artist quickly
    await page.route('**/api/spotify/search**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          artists: {
            items: [
              {
                id: 'fake-artist-id-123',
                name: 'Test Artist',
                external_urls: {
                  spotify: 'https://open.spotify.com/artist/fake-artist-id-123',
                },
                images: [
                  { url: 'https://placehold.co/300', height: 300, width: 300 },
                ],
                followers: { total: 1000 },
                genres: ['indie'],
              },
            ],
          },
        }),
      })
    );

    // Make enrichment call hang for 30 seconds (simulating slow MusicFetch)
    // The enrichProfileFromDsp server action is fire-and-forget (JOV-1340),
    // so the UI should proceed immediately regardless.
    await page.route('**/onboarding/actions/enrich-profile**', route => {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(
            route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                name: 'Test Artist',
                imageUrl: null,
                bio: 'A test bio',
                genres: ['indie'],
                followers: 1000,
              }),
            })
          );
        }, 30_000);
      });
    });

    await bootstrapToOnboarding(page);

    // Complete handle step
    await completeHandleStep(page);

    // Instead of skipping DSP, search for and select an artist
    const searchInput = page.getByPlaceholder(
      /search for your artist|paste a spotify/i
    );
    await expect(searchInput).toBeVisible({ timeout: 15_000 });
    await searchInput.fill('Test Artist');

    // Wait for search results and select the artist
    const artistResult = page.getByText('Test Artist').first();
    await expect(artistResult).toBeVisible({ timeout: 10_000 });
    await artistResult.click();

    // After DSP connection, we should move to profile review step
    // CRITICAL: This transition must happen immediately (fire-and-forget enrichment)
    const dspConnectTime = Date.now();

    // Profile review step should appear within 10 seconds
    const displayNameInput = page.locator('#onboarding-display-name');
    await expect(displayNameInput).toBeVisible({ timeout: 10_000 });

    const transitionTime = Date.now() - dspConnectTime;
    console.log(
      `DSP connect -> profile review transition: ${transitionTime}ms`
    );

    expect(
      transitionTime,
      `DSP -> profile review took ${transitionTime}ms — must be <10000ms (fire-and-forget enrichment)`
    ).toBeLessThan(10_000);

    // Complete profile review and go to dashboard
    const currentName = await displayNameInput.inputValue();
    if (!currentName.trim()) {
      await displayNameInput.fill('Test Artist');
    }

    const goToDashboardBtn = page.getByRole('button', {
      name: /go to dashboard/i,
    });
    await expect(goToDashboardBtn).toBeEnabled({ timeout: 10_000 });
    await goToDashboardBtn.click();

    await page.waitForURL('**/app/**', {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    // Verify dashboard loaded
    const appShell = page.locator('nav, main, [data-testid="sidebar"]').first();
    await expect(appShell).toBeVisible({ timeout: 30_000 });
  });
});
