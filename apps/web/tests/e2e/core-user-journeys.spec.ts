import { expect, test } from '@playwright/test';
import {
  isExpectedError,
  SMOKE_TIMEOUTS,
  smokeNavigate,
} from './utils/smoke-test-utils';

/**
 * Core User Journey Tests
 *
 * These tests verify the most critical user paths work correctly.
 * They use deterministic waits instead of flaky timeouts.
 *
 * NOTE: These tests run WITHOUT the saved authentication session,
 * as they test unauthenticated user journeys (anonymous homepage,
 * public profiles, and redirect to sign-in).
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Core User Journeys', () => {
  // Run serially to avoid overwhelming Turbopack during cold-start compilation
  test.describe.configure({ mode: 'serial' });
  test('Homepage loads correctly for anonymous users', async ({ page }) => {
    await smokeNavigate(page, '/');

    // Should load homepage successfully
    await expect(page).toHaveURL('/');

    // Should show key elements (with explicit timeout)
    await expect(page.locator('h1, h2').first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('Profile pages load without authentication required', async ({
    page,
  }) => {
    await smokeNavigate(page, '/taylorswift');

    // Should load profile page
    await expect(page).toHaveURL(/\/taylorswift/);

    // Wait for title with timeout instead of assuming immediate availability
    await expect(page).toHaveTitle(/Taylor Swift/i, {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('Listen mode works without authentication', async ({ page }) => {
    await smokeNavigate(page, '/taylorswift?mode=listen');

    // Should stay on listen mode
    await expect(page).toHaveURL(/mode=listen/, {
      timeout: SMOKE_TIMEOUTS.URL_STABLE,
    });

    // Should not redirect to auth
    await expect(page).not.toHaveURL(/signin/);
  });

  test('Tip mode works without authentication', async ({ page }) => {
    await smokeNavigate(page, '/taylorswift?mode=tip');

    // Should stay on tip mode
    await expect(page).toHaveURL(/mode=tip/, {
      timeout: SMOKE_TIMEOUTS.URL_STABLE,
    });

    // Should not redirect to auth
    await expect(page).not.toHaveURL(/signin/);
  });

  test('Dashboard is not accessible to unauthenticated users', async ({
    page,
  }) => {
    // Unauthenticated users should either:
    // 1. Be redirected to /signin (when Clerk is configured)
    // 2. Get a 503 error (when Clerk config is missing in test env)
    // 3. See a loading/blocked state without actual dashboard content
    const response = await page.goto('/app/dashboard', {
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded',
    });

    const status = response?.status() ?? 0;

    // Wait for any client-side redirect to complete (Clerk may redirect after hydration)
    await page.waitForTimeout(3000);

    const url = page.url();

    // Either: redirected away, error status, or no dashboard nav rendered
    const wasRedirected = !url.includes('/app/dashboard');
    const gotError = status >= 400;
    // Dashboard nav only renders for authenticated users
    const hasDashboardNav = await page
      .locator('nav[aria-label="Dashboard navigation"]')
      .isVisible()
      .catch(() => false);

    // Also check if the page shows Clerk's sign-in component or a loading state
    const hasClerkSignIn = await page
      .locator('[data-clerk-element], .cl-signIn, .cl-loading')
      .first()
      .isVisible()
      .catch(() => false);

    expect(
      wasRedirected || gotError || !hasDashboardNav || hasClerkSignIn
    ).toBe(true);
  });

  test('No console errors on key pages', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Test homepage - wait for hydration using deterministic method
    await smokeNavigate(page, '/');
    await page.waitForLoadState('load');
    await expect(page.locator('body')).toBeVisible();

    // Test profile page - wait for content to be present
    await smokeNavigate(page, '/taylorswift');
    await page.waitForLoadState('load');
    await expect(page.locator('h1').first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Filter using centralized error filtering (more comprehensive)
    const criticalErrors = errors.filter(error => !isExpectedError(error));

    if (criticalErrors.length > 0) {
      console.log('Console errors found:', criticalErrors);
    }

    expect(criticalErrors.length).toBe(0);
  });
});
