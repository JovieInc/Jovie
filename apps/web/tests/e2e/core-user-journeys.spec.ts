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
 */
test.describe('Core User Journeys', () => {
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

  test('Dashboard redirects unauthenticated users', async ({ page }) => {
    await smokeNavigate(page, '/app/dashboard');

    // Should redirect to sign-in (with timeout for redirect to complete)
    await expect(page).toHaveURL(/sign-?in/, {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
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
