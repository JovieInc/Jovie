import type { Page } from '@playwright/test';
import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Auth UI Tests - Sign In and Sign Up pages
 *
 * These tests verify the UI structure and elements of auth pages.
 * They work with mock Clerk keys and don't require real authentication.
 */

/**
 * Common test helpers to reduce duplication
 */
async function expectPageHasBranding(page: Page): Promise<void> {
  const logo = page.locator('img[alt*="Jovie"], img[alt*="logo"]').first();
  const hasLogo = (await logo.count()) > 0;
  expect(hasLogo).toBe(true);
}

async function expectPageHasMetaDescription(page: Page): Promise<void> {
  const metaDescription = page.locator('meta[name="description"]');
  await expect(metaDescription).toHaveAttribute('content', /.+/);
}

async function expectPageIsResponsive(page: Page): Promise<void> {
  await page.setViewportSize({ width: 375, height: 667 });
  await expect(page.locator('body')).toBeVisible();

  const hasHorizontalScroll = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  expect(hasHorizontalScroll).toBe(false);
}

async function expectNoErrorBoundaries(page: Page): Promise<void> {
  const bodyText = await page.locator('body').textContent();
  expect(bodyText).not.toContain('Error boundary');
  expect(bodyText).not.toContain('Something went wrong');
  expect(bodyText).not.toContain('Unhandled Runtime Error');
}
test.describe('Auth UI - Sign In', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signin', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
  });

  test('sign in page loads and displays key elements', async ({ page }) => {
    // Check page loaded successfully
    await expect(page.locator('body')).toBeVisible();

    // Verify we're on the sign in page
    await expect(page).toHaveURL(/\/signin/);

    // Check that main content area exists
    const mainContent = page.locator('main').or(page.locator('[role="main"]'));
    await expect(mainContent.first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('sign in page has branding elements', async ({ page }) => {
    await expectPageHasBranding(page);
  });

  test('sign in page has proper page title', async ({ page }) => {
    // Check page title includes "Sign In" or "Jovie"
    await expect(page).toHaveTitle(/Sign In|Jovie/i);
  });

  test('sign in page has meta description', async ({ page }) => {
    await expectPageHasMetaDescription(page);
  });

  test('sign in page is responsive on mobile', async ({ page }) => {
    await expectPageIsResponsive(page);
  });

  test('sign in page does not show critical errors', async ({ page }) => {
    await expectNoErrorBoundaries(page);
  });
});

test.describe('Auth UI - Sign Up', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sign-up', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
  });

  test('sign up page loads and displays key elements', async ({ page }) => {
    // Check page loaded successfully
    await expect(page.locator('body')).toBeVisible();

    // Verify we're on the sign up page
    await expect(page).toHaveURL(/\/signup/);

    // Check that main content area exists
    const mainContent = page.locator('main').or(page.locator('[role="main"]'));
    await expect(mainContent.first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('sign up page has branding elements', async ({ page }) => {
    await expectPageHasBranding(page);
  });

  test('sign up page has proper page title', async ({ page }) => {
    // Check page title includes "Sign Up" or "Jovie"
    await expect(page).toHaveTitle(/Sign Up|Create|Jovie/i);
  });

  test('sign up page has meta description', async ({ page }) => {
    await expectPageHasMetaDescription(page);
  });

  test('sign up page is responsive on mobile', async ({ page }) => {
    await expectPageIsResponsive(page);
  });

  test('sign up page does not show critical errors', async ({ page }) => {
    await expectNoErrorBoundaries(page);
  });
});

test.describe('Auth UI - Navigation', () => {
  test('can navigate from sign in to sign up', async ({ page }) => {
    await page.goto('/signin', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    // Look for sign up link (common patterns)
    const signUpLink = page
      .getByRole('link', { name: /sign up|create account|get started/i })
      .first();

    // If sign up link exists, clicking it should navigate
    if ((await signUpLink.count()) > 0) {
      await signUpLink.click();
      await expect(page).toHaveURL(/\/sign-up/, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
    }
  });

  test('can navigate from sign up to sign in', async ({ page }) => {
    await page.goto('/sign-up', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    // Look for sign in link (common patterns)
    const signInLink = page
      .getByRole('link', { name: /sign in|log in|already have/i })
      .first();

    // If sign in link exists, clicking it should navigate
    if ((await signInLink.count()) > 0) {
      await signInLink.click();
      await expect(page).toHaveURL(/\/signin/, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
    }
  });
});
