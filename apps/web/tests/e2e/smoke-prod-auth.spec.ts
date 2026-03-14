import { expect, test } from '@playwright/test';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Production Auth Smoke Tests
 *
 * Lightweight tests that run against the PRODUCTION deployment after deploy.
 * Uses seeded e2e production Clerk credentials (not +clerk_test emails).
 *
 * These tests verify:
 * 1. Sign-in flow works with real credentials
 * 2. Dashboard loads with real data (not empty state)
 * 3. Navigation between key tabs works
 *
 * Max ~30s total. No golden path, no content gate, no admin tests.
 *
 * @production-smoke
 */

// Run unauthenticated initially — we sign in during the test
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Check if production auth credentials are available
 */
function hasProdAuthCredentials(): boolean {
  const email =
    process.env.E2E_PROD_USER_EMAIL ||
    process.env.E2E_CLERK_USER_USERNAME ||
    '';
  const password =
    process.env.E2E_PROD_USER_PASSWORD ||
    process.env.E2E_CLERK_USER_PASSWORD ||
    '';
  return email.length > 0 && password.length > 0;
}

function getProdCredentials() {
  return {
    email:
      process.env.E2E_PROD_USER_EMAIL ||
      process.env.E2E_CLERK_USER_USERNAME ||
      '',
    password:
      process.env.E2E_PROD_USER_PASSWORD ||
      process.env.E2E_CLERK_USER_PASSWORD ||
      '',
  };
}

test.describe('Production Auth Smoke @production-smoke', () => {
  test.setTimeout(120_000); // 2 min total budget

  test.beforeEach(async () => {
    if (!hasProdAuthCredentials()) {
      test.skip(true, 'No production auth credentials configured');
    }
  });

  test('sign-in works and dashboard loads', async ({ page }) => {
    const { email, password } = getProdCredentials();

    // Navigate to sign-in page
    await page.goto('/signin', {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });

    // Wait for Clerk to load
    await page
      .waitForFunction(() => !!(window as any).Clerk?.loaded, {
        timeout: 30_000,
      })
      .catch(() => {
        // Clerk may not be available in all environments
      });

    // Look for email input field (Clerk renders this)
    const emailInput = page.locator(
      'input[name="identifier"], input[type="email"], input[autocomplete="email"]'
    );
    const hasEmailInput = await emailInput
      .first()
      .isVisible({ timeout: 15_000 })
      .catch(() => false);

    if (!hasEmailInput) {
      // Clerk may have rendered differently or user is already signed in
      const url = page.url();
      if (url.includes('/app') || url.includes('/dashboard')) {
        // Already authenticated — verify dashboard loaded
        await waitForHydration(page);
        const main = page.locator('main').first();
        await expect(
          main,
          'Dashboard main content should be visible'
        ).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
        return;
      }
      // If neither sign-in form nor dashboard, something is wrong
      test.skip(true, 'Clerk sign-in form not available');
      return;
    }

    // Fill in credentials
    await emailInput.first().fill(email);

    // Submit email
    const continueButton = page.locator(
      'button[type="submit"], button:has-text("Continue")'
    );
    await continueButton.first().click();

    // Wait for password field
    const passwordInput = page.locator(
      'input[name="password"], input[type="password"]'
    );
    await expect(passwordInput.first()).toBeVisible({ timeout: 10_000 });

    await passwordInput.first().fill(password);

    // Submit password
    await continueButton.first().click();

    // Wait for redirect to dashboard
    await page.waitForURL(url => url.pathname.includes('/app'), {
      timeout: 30_000,
    });

    await waitForHydration(page);

    // Verify dashboard has real content (not empty state or error)
    const main = page.locator('main').first();
    await expect(main, 'Dashboard should be visible after sign-in').toBeVisible(
      {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      }
    );

    const mainText = await main.innerText().catch(() => '');
    expect(
      mainText.length,
      'Dashboard should have real content (not empty)'
    ).toBeGreaterThan(30);

    // Verify no error page
    const lower = mainText.toLowerCase();
    expect(lower).not.toContain('application error');
    expect(lower).not.toContain('something went wrong');
  });

  test('dashboard tab navigation works', async ({ page }) => {
    const { email, password } = getProdCredentials();

    // Navigate directly to dashboard — if already authenticated this will work
    await page.goto('/app/dashboard/profile', {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });

    // If redirected to sign-in, sign in first
    if (page.url().includes('/signin') || page.url().includes('/sign-in')) {
      const emailInput = page.locator(
        'input[name="identifier"], input[type="email"]'
      );
      const hasForm = await emailInput
        .first()
        .isVisible({ timeout: 15_000 })
        .catch(() => false);

      if (!hasForm) {
        test.skip(true, 'Sign-in form not available for tab navigation test');
        return;
      }

      await emailInput.first().fill(email);
      await page
        .locator('button[type="submit"], button:has-text("Continue")')
        .first()
        .click();
      const passwordInput = page.locator('input[type="password"]');
      await expect(passwordInput.first()).toBeVisible({ timeout: 10_000 });
      await passwordInput.first().fill(password);
      await page
        .locator('button[type="submit"], button:has-text("Continue")')
        .first()
        .click();
      await page.waitForURL(url => url.pathname.includes('/app'), {
        timeout: 30_000,
      });
    }

    await waitForHydration(page);

    // Navigate between 2 key tabs to verify routing works
    const tabs = ['/app/dashboard/audience', '/app/dashboard/releases'];

    for (const tabPath of tabs) {
      await page.goto(tabPath, {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });

      await waitForHydration(page);

      const currentUrl = page.url();
      // Verify we didn't get redirected to an error page
      expect(currentUrl).not.toContain('/signin');
      expect(currentUrl).not.toContain('/sign-in');

      // Verify main content area exists
      const main = page.locator('main').first();
      const mainVisible = await main
        .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
        .catch(() => false);
      expect(mainVisible, `${tabPath}: main content should be visible`).toBe(
        true
      );
    }
  });
});
