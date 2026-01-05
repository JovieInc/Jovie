import { expect, test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';
import { setOnboardingComplete } from '../helpers/onboarding-toggle';
import { setWaitlistState } from '../helpers/waitlist-toggle';
import {
  SMOKE_TIMEOUTS,
  smokeNavigate,
  TEST_PROFILES,
} from './utils/smoke-test-utils';

/**
 * Required Smoke Tests - MUST PASS for every deploy to main
 *
 * These tests are intentionally minimal and fast (<2 min total).
 * They verify the two most critical user flows:
 * 1. Public profiles load (unauthenticated)
 * 2. Auth works and dashboard is accessible (authenticated)
 *
 * For comprehensive E2E testing, use the 'testing' label on PRs.
 *
 * @smoke @required
 */

function hasRealClerkConfig(): boolean {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  const sk = process.env.CLERK_SECRET_KEY ?? '';
  return (
    pk.length > 0 &&
    sk.length > 0 &&
    !pk.toLowerCase().includes('dummy') &&
    !pk.toLowerCase().includes('mock') &&
    !sk.toLowerCase().includes('dummy') &&
    !sk.toLowerCase().includes('mock')
  );
}

function canRunAuthenticatedTests(): boolean {
  return (
    hasRealClerkConfig() &&
    Boolean(process.env.E2E_CLERK_USER_USERNAME) &&
    Boolean(process.env.DATABASE_URL)
  );
}

test.describe('Required Smoke Tests @smoke @required', () => {
  test('public profile loads without errors', async ({ page }) => {
    // Navigate to a known seeded profile
    const response = await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}`);

    // Must not be a server error
    const status = response?.status() ?? 0;
    expect(status, `Expected <500 but got ${status}`).toBeLessThan(500);

    // Check if database is available
    const pageTitle = await page.title();
    const isTemporarilyUnavailable = pageTitle.includes(
      'temporarily unavailable'
    );

    // If profile exists and DB is available, verify core elements
    if (status === 200 && !isTemporarilyUnavailable) {
      // Verify page title contains creator name
      await expect(page).toHaveTitle(/Dua Lipa/i, {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Verify h1 displays creator name
      await expect(page.locator('h1')).toContainText('Dua Lipa', {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Verify profile image is visible
      const profileImage = page.locator('img').first();
      await expect(profileImage).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
    } else {
      // For 404/400/temporarily unavailable, just verify page renders
      await page.waitForLoadState('domcontentloaded');
      const bodyContent = await page.locator('body').textContent();
      expect(bodyContent).toBeTruthy();
    }
  });

  test('auth works and dashboard is accessible', async ({ page }) => {
    test.setTimeout(60_000);

    if (!canRunAuthenticatedTests()) {
      test.skip();
    }

    // Sign in with test user
    await signInUser(page);

    // Set up user state: waitlist claimed + onboarding complete
    await setWaitlistState(page, 'claimed');
    await setOnboardingComplete(page);

    // Navigate to dashboard
    await smokeNavigate(page, '/app/dashboard');

    // Verify we're on the dashboard (not redirected to signin/onboarding)
    await expect(page).toHaveURL(/\/app\/dashboard/, {
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });

    // Verify dashboard content loaded
    await expect(
      page.locator('h1, h2, [data-testid="dashboard-content"]')
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Verify user is authenticated (user button or menu visible)
    await expect(
      page.locator(
        '[data-clerk-element="userButton"], [data-testid="user-menu"]'
      )
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });
});
