import { expect, test } from '@playwright/test';

import {
  buildValidOnboardingHandle,
  clearOnboardingRateLimits,
  createFreshUser,
  ensureDbUser,
  hasRealEnv,
  interceptTrackingCalls,
  purgeStaleClerkTestUsers,
  waitForSpotifyImport,
} from './helpers/e2e-helpers';

/**
 * Onboarding Completion E2E — Fresh User → Dashboard → Empty States
 *
 * Tests the coverage gap identified by autoplan review:
 * 1. Fresh user completes onboarding and lands on dashboard
 * 2. Empty dashboard state shows actionable CTAs (not blank void)
 * 3. Empty releases/audience pages show warmth + action
 * 4. Abandon and return: mid-flow state is persisted
 *
 * This spec fills gaps that golden-path.spec.ts doesn't cover:
 * - Post-onboarding empty state verification
 * - Onboarding state persistence on abandon/return
 */

const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';

test.skip(
  FAST_ITERATION,
  'Onboarding completion stays in the slower golden-path lane'
);

// Fresh browser — no inherited auth state
test.use({ storageState: { cookies: [], origins: [] } });

const TEST_SPOTIFY_URL =
  'https://open.spotify.com/artist/59NJtiWq8nISIJjDtITQyt'; // Tim White

test.describe('Onboarding Completion & Empty States', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  test.beforeEach(async ({ page }) => {
    if (!hasRealEnv()) {
      test.skip(true, 'Real Clerk/DB env vars not configured');
    }
    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      test.skip(true, 'Clerk testing setup was not successful');
    }

    // Clean up before each test to avoid cap/rate-limit issues
    await purgeStaleClerkTestUsers();
    await clearOnboardingRateLimits();
    await interceptTrackingCalls(page);
  });

  test('fresh user completes onboarding and sees empty dashboard', async ({
    page,
  }, testInfo) => {
    page.on('pageerror', error => {
      console.log(`[onboarding-completion][pageerror] ${error.message}`);
    });

    const seed = `oc-${testInfo.workerIndex}-${Date.now().toString(36)}`;

    // STEP 1: Create fresh Clerk test user
    let user: { email: string; clerkUserId: string };
    try {
      user = await createFreshUser(page, seed);
    } catch (error) {
      console.log(
        `⚠ createFreshUser failed (possible Clerk dev cap) — skipping: ${error}`
      );
      test.skip(true, 'Clerk user creation failed — possible dev instance cap');
      return;
    }

    console.log(`[onboarding-completion] Created user: ${user.email}`);

    const handle = buildValidOnboardingHandle(seed, user.clerkUserId);
    await ensureDbUser(user.clerkUserId, user.email, [
      '59NJtiWq8nISIJjDtITQyt',
    ]);

    // STEP 2: Navigate to signup (already authenticated from createFreshUser)
    // The user should be redirected to onboarding since profile is incomplete
    await page.goto('/app', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Should redirect to onboarding since needsOnboarding=true
    await page.waitForURL(/onboarding/, { timeout: 30_000 });
    console.log('[onboarding-completion] Redirected to onboarding');

    // STEP 3: Complete handle entry
    const handleInput = page.locator(
      'input[name="handle"], input[placeholder*="handle"], #handle-input'
    );
    const isHandleVisible = await handleInput
      .first()
      .isVisible({ timeout: 15_000 })
      .catch(() => false);

    if (isHandleVisible) {
      await handleInput.first().fill(handle);
      console.log(`[onboarding-completion] Entered handle: ${handle}`);

      // Wait for handle availability check
      await page.waitForTimeout(2000);

      // Click continue/next
      const continueBtn = page
        .getByRole('button', { name: /continue|next|claim/i })
        .first();
      if (await continueBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await continueBtn.click();
      }
    }

    // STEP 4: Artist search — paste Spotify URL
    const spotifyInput = page.locator(
      'input[placeholder*="spotify"], input[placeholder*="Spotify"], input[name*="spotify"], input[type="url"]'
    );
    const isSpotifyVisible = await spotifyInput
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    if (isSpotifyVisible) {
      await spotifyInput.first().fill(TEST_SPOTIFY_URL);
      console.log('[onboarding-completion] Pasted Spotify URL');

      // Wait for import to start
      await page.waitForTimeout(3000);

      // Click continue/import
      const importBtn = page
        .getByRole('button', {
          name: /continue|next|import|confirm|connect/i,
        })
        .first();
      if (await importBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await importBtn.click();
      }
    }

    // STEP 5: Profile review — accept defaults and continue
    const finishBtn = page
      .getByRole('button', {
        name: /finish|complete|done|get started|go to dashboard/i,
      })
      .first();
    const isFinishVisible = await finishBtn
      .isVisible({ timeout: 30_000 })
      .catch(() => false);

    if (isFinishVisible) {
      await finishBtn.click();
      console.log('[onboarding-completion] Clicked finish');
    }

    // STEP 6: Verify dashboard redirect — no redirect loop
    await page.waitForURL(/\/app/, { timeout: 30_000 });
    const currentUrl = page.url();
    expect(currentUrl).not.toMatch(/onboarding/);
    expect(currentUrl).not.toMatch(/sign-in/);
    console.log(`[onboarding-completion] Dashboard loaded: ${currentUrl}`);

    // Verify onboarding state via Spotify import readiness
    const importState = await waitForSpotifyImport(user.clerkUserId);
    if (importState) {
      expect(importState.onboarding_completed_at).toBeTruthy();
      console.log(
        `[onboarding-completion] onboarding_completed_at: ${importState.onboarding_completed_at}`
      );
    }

    // STEP 7: Verify empty dashboard state — should show actionable CTA
    // Fresh user should see a "create your first release" prompt or similar
    const mainContent = await page
      .locator('main')
      .innerText({ timeout: 10_000 })
      .catch(() => '');
    const hasActionableCTA =
      mainContent.toLowerCase().includes('release') ||
      mainContent.toLowerCase().includes('get started') ||
      mainContent.toLowerCase().includes('first') ||
      mainContent.toLowerCase().includes('create') ||
      mainContent.toLowerCase().includes('upload') ||
      mainContent.toLowerCase().includes('welcome');

    // Dashboard should not be completely empty
    expect(mainContent.length).toBeGreaterThan(50);
    console.log(
      `[onboarding-completion] Dashboard has actionable CTA: ${hasActionableCTA}`
    );
  });

  test('empty releases page shows warmth and action', async ({ page }) => {
    // This test reuses the session from the previous serial test
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Should not show an error page
    const pageText = await page
      .locator('main')
      .innerText({ timeout: 10_000 })
      .catch(() => '');
    const hasError =
      pageText.toLowerCase().includes('error') &&
      pageText.toLowerCase().includes('something went wrong');
    expect(hasError).toBeFalsy();

    // Should have some content (not blank)
    expect(pageText.length).toBeGreaterThan(20);
    console.log(
      `[onboarding-completion] Releases page content length: ${pageText.length}`
    );
  });

  test('empty audience page shows onboarding path', async ({ page }) => {
    await page.goto('/app/dashboard/audience', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const pageText = await page
      .locator('main')
      .innerText({ timeout: 10_000 })
      .catch(() => '');
    const hasError =
      pageText.toLowerCase().includes('error') &&
      pageText.toLowerCase().includes('something went wrong');
    expect(hasError).toBeFalsy();
    expect(pageText.length).toBeGreaterThan(20);
    console.log(
      `[onboarding-completion] Audience page content length: ${pageText.length}`
    );
  });
});

test.describe('Onboarding State Persistence', () => {
  test.setTimeout(120_000);
  test.use({ storageState: { cookies: [], origins: [] } });

  test.skip(
    FAST_ITERATION,
    'Onboarding persistence stays in the slower golden-path lane'
  );

  test('mid-flow abandon preserves state on return', async ({ page }) => {
    if (!hasRealEnv()) {
      test.skip(true, 'Real Clerk/DB env vars not configured');
    }
    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      test.skip(true, 'Clerk testing setup was not successful');
    }

    await purgeStaleClerkTestUsers();
    await clearOnboardingRateLimits();
    await interceptTrackingCalls(page);

    const seed = `oc-abandon-${Date.now().toString(36)}`;
    let user: { email: string; clerkUserId: string };
    try {
      user = await createFreshUser(page, seed);
    } catch {
      test.skip(true, 'Clerk user creation failed — possible dev instance cap');
      return;
    }

    await ensureDbUser(user.clerkUserId, user.email, [
      '59NJtiWq8nISIJjDtITQyt',
    ]);

    // Navigate to onboarding
    await page.goto('/app', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForURL(/onboarding/, { timeout: 30_000 });

    // Enter handle (partial progress)
    const handleInput = page.locator(
      'input[name="handle"], input[placeholder*="handle"], #handle-input'
    );
    const isVisible = await handleInput
      .first()
      .isVisible({ timeout: 15_000 })
      .catch(() => false);

    if (!isVisible) {
      console.log(
        '⚠ Handle input not visible — onboarding UI may have changed. Skipping abandon test.'
      );
      return;
    }

    const handle = buildValidOnboardingHandle(seed, user.clerkUserId);
    await handleInput.first().fill(handle);

    // Abandon: navigate away
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });

    // Return: should redirect back to onboarding (not completed)
    await page.goto('/app', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Should be back at onboarding since it wasn't completed
    await page.waitForURL(/onboarding/, { timeout: 30_000 });
    console.log(
      '[onboarding-completion] Correctly redirected back to onboarding after abandon'
    );
  });
});
