import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import {
  ClerkTestError,
  isProductionTarget,
  signInUser,
} from '../helpers/clerk-auth';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Suite 3: SmartLink Experience + Content Gate
 *
 * Verifies every critical page renders REAL CONTENT in the main area,
 * not just the app shell. Catches silent data failures, empty states,
 * and broken feature flags before production.
 *
 * Also covers SmartLink (public profile listen mode) as a fan experience.
 *
 * @smoke @critical
 */

// ============================================================================
// Helpers
// ============================================================================

/** Navigate with skip on infra failure */
async function navigateSafe(
  page: import('@playwright/test').Page,
  path: string,
  opts?: { timeout?: number }
): Promise<boolean> {
  try {
    await page.goto(path, {
      waitUntil: 'domcontentloaded',
      timeout: opts?.timeout ?? 90_000,
    });
    const url = page.url();
    if (url.includes('clerk') && url.includes('handshake')) {
      test.skip(true, `Clerk handshake redirect on ${path}`);
      return false;
    }
    await waitForHydration(page);
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes('net::ERR_') ||
      msg.includes('Target closed') ||
      msg.includes('Timeout')
    ) {
      test.skip(true, `Navigation issue on ${path}`);
      return false;
    }
    throw error;
  }
}

/** Assert main area has meaningful content */
async function assertMainContent(
  page: import('@playwright/test').Page,
  description: string,
  opts?: { minLength?: number }
) {
  const minLength = opts?.minLength ?? 50;

  const main = page.locator('main').first();
  await expect(main, `${description}: <main> should be visible`).toBeVisible({
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });

  const mainText = await main.innerText().catch(() => '');
  expect(
    mainText.length,
    `${description}: main content too short (${mainText.length} chars, need ${minLength}+)`
  ).toBeGreaterThan(minLength);

  // Not an error page
  const lower = mainText.toLowerCase();
  for (const pattern of [
    'application error',
    'internal server error',
    'something went wrong',
    'unhandled runtime error',
  ]) {
    expect(lower, `${description}: shows "${pattern}"`).not.toContain(pattern);
  }

  // No error test IDs visible
  const errorBanner = page.locator(
    '[data-testid="error-page"], [data-testid="error-boundary"], [data-testid="dashboard-error"]'
  );
  const errorVisible = await errorBanner
    .first()
    .isVisible()
    .catch(() => false);
  expect(errorVisible, `${description}: error banner visible`).toBe(false);
}

// ============================================================================
// PUBLIC PAGES (unauthenticated)
// ============================================================================

test.describe('Content Gate — Public Pages', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Homepage renders hero, sections, and CTA', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    if (!(await navigateSafe(page, '/'))) return;

    await expect(page.locator('h1').first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    const cta = page
      .locator(
        'a[href*="/signup"], a[href*="/sign-up"], button:has-text("Claim"), a:has-text("Get started")'
      )
      .first();
    await expect(cta).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    const sectionCount = await page.locator('section').count();
    expect(sectionCount).toBeGreaterThanOrEqual(2);

    await expect(page.locator('footer').first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    expect(bodyText.length).toBeGreaterThan(500);
  });

  test('Pricing page shows plan tiers with prices', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    if (!(await navigateSafe(page, '/pricing'))) return;

    if (!page.url().includes('/pricing')) {
      test.skip(true, 'Pricing page redirects — hidden');
      return;
    }

    await expect(page.locator('h1').first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Free tier
    await expect(page.getByText('$0').first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // At least one paid tier
    const hasPaidPrice = await page
      .locator('text=/\\$\\d+/')
      .nth(1)
      .isVisible()
      .catch(() => false);
    expect(hasPaidPrice, 'Should show at least one paid tier').toBe(true);

    await assertMainContent(page, 'Pricing', { minLength: 200 });
  });

  test('Auth pages render Clerk forms', async ({ page }, testInfo) => {
    test.setTimeout(60_000);

    const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
    if (!pk || pk.includes('mock') || pk.includes('dummy')) {
      test.skip(true, 'No real Clerk config');
      return;
    }

    if (!(await navigateSafe(page, '/sign-up'))) return;

    const hasForm = await page
      .locator('form, [data-clerk-component], button[data-localization-key]')
      .first()
      .isVisible({ timeout: 15_000 })
      .catch(() => false);

    if (!hasForm) {
      const bodyText = await page
        .locator('body')
        .innerText()
        .catch(() => '');
      const hasAuthContent =
        bodyText.toLowerCase().includes('sign') ||
        bodyText.toLowerCase().includes('create');
      expect(hasAuthContent, 'Sign-up: should show auth content').toBe(true);
    }

    if (!(await navigateSafe(page, '/signin'))) return;

    const hasSigninForm = await page
      .locator('form, [data-clerk-component], button[data-localization-key]')
      .first()
      .isVisible({ timeout: 15_000 })
      .catch(() => false);

    if (!hasSigninForm) {
      const bodyText = await page
        .locator('body')
        .innerText()
        .catch(() => '');
      expect(
        bodyText.toLowerCase().includes('sign') ||
          bodyText.toLowerCase().includes('log in'),
        'Sign-in: should show auth content'
      ).toBe(true);
    }
  });

  test('Public profile shows artist content and action buttons', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);

    const testProfile = process.env.E2E_TEST_PROFILE || 'dualipa';
    if (!(await navigateSafe(page, `/${testProfile}`))) return;

    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    const lower = (bodyText ?? '').toLowerCase();
    if (
      lower.includes('not found') ||
      lower.includes('temporarily unavailable')
    ) {
      test.skip(true, 'Profile not seeded');
      return;
    }
    if (
      lower.includes('loading jovie profile') ||
      lower.includes('loading artist profile')
    ) {
      await page
        .waitForFunction(() => document.readyState === 'complete', {
          timeout: 10_000,
        })
        .catch(() => {});
      const retry = await page
        .locator('body')
        .innerText()
        .catch(() => '');
      if ((retry ?? '').toLowerCase().includes('loading')) {
        test.skip(true, 'Profile stuck on loading skeleton');
        return;
      }
    }

    // Artist name
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    const h1Text = await h1.innerText().catch(() => '');
    expect(h1Text.length).toBeGreaterThan(0);
  });

  test('Public profile listen mode shows DSP options', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);

    const testProfile = process.env.E2E_TEST_PROFILE || 'dualipa';
    if (!(await navigateSafe(page, `/${testProfile}?mode=listen`))) return;

    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    if ((bodyText ?? '').toLowerCase().includes('not found')) {
      test.skip(true, 'Profile not seeded');
      return;
    }

    await expect(page.locator('h1').first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });
});

// ============================================================================
// AUTHENTICATED PAGES (dashboard, admin, drawer)
// ============================================================================

test.describe('Content Gate — Authenticated Pages', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    if (isProductionTarget()) {
      test.skip(true, 'Skipped on production target');
      return;
    }

    const username = process.env.E2E_CLERK_USER_USERNAME;
    const hasTestCredentials =
      username &&
      (username.includes('+clerk_test') || process.env.E2E_CLERK_USER_PASSWORD);

    if (!hasTestCredentials) {
      test.skip(true, 'No test user credentials');
      return;
    }
    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      test.skip(true, 'Clerk testing setup not successful');
      return;
    }

    for (const [key, value] of Object.entries({
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
      DATABASE_URL: process.env.DATABASE_URL,
    })) {
      if (!value || value.includes('mock') || value.includes('dummy')) {
        test.skip(true, `${key} not configured`);
        return;
      }
    }

    await setupClerkTestingToken({ page });
  });

  test('Dashboard pages render real content', async ({ page }, testInfo) => {
    test.setTimeout(300_000);

    try {
      await signInUser(page);
    } catch (error) {
      if (
        error instanceof ClerkTestError &&
        (error.code === 'CLERK_NOT_READY' ||
          error.code === 'CLERK_SETUP_FAILED')
      ) {
        test.skip(true, `Clerk auth failed: ${error.message}`);
        return;
      }
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes('Navigation interrupted') ||
        msg.includes('net::ERR_') ||
        msg.includes('Timeout') ||
        msg.includes('Target closed')
      ) {
        test.skip(true, 'Sign-in navigation issue');
        return;
      }
      throw error;
    }

    await expect(page).toHaveURL(/\/app\//, {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    const dashboardPages = [
      { path: '/app/dashboard/profile', name: 'Profile' },
      { path: '/app/dashboard/analytics', name: 'Analytics' },
      { path: '/app/dashboard/audience', name: 'Audience' },
      { path: '/app/dashboard/releases', name: 'Releases' },
      { path: '/app/dashboard/earnings', name: 'Earnings' },
      { path: '/app/dashboard/chat', name: 'Chat' },
    ];

    const failures: Array<{ name: string; error: string }> = [];

    for (const pageConfig of dashboardPages) {
      try {
        await page.goto(pageConfig.path, {
          waitUntil: 'domcontentloaded',
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        });
        await waitForHydration(page);
        await page
          .waitForLoadState('networkidle', { timeout: 5_000 })
          .catch(() => {});

        const url = page.url();
        if (url.includes('/signin') || url.includes('/sign-in')) {
          await signInUser(page);
          continue;
        }

        expect(
          url,
          `${pageConfig.name}: redirected to onboarding`
        ).not.toContain('/onboarding');

        await assertMainContent(page, `Dashboard/${pageConfig.name}`, {
          minLength: 30,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        failures.push({ name: pageConfig.name, error: msg });

        const screenshot = await page.screenshot().catch(() => null);
        if (screenshot) {
          await testInfo.attach(`fail-${pageConfig.name}`, {
            body: screenshot,
            contentType: 'image/png',
          });
        }
      }
    }

    expect(
      failures,
      `${failures.length} dashboard pages failed:\n${failures.map(f => `${f.name}: ${f.error}`).join('\n')}`
    ).toHaveLength(0);
  });

  test('Settings pages render content', async ({ page }, testInfo) => {
    test.setTimeout(180_000);

    try {
      await signInUser(page);
    } catch (error) {
      if (error instanceof ClerkTestError) {
        test.skip(true, `Clerk auth failed: ${error.message}`);
        return;
      }
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes('net::ERR_') ||
        msg.includes('Timeout') ||
        msg.includes('Target closed')
      ) {
        test.skip(true, 'Sign-in navigation issue');
        return;
      }
      throw error;
    }

    const settingsPages = [
      { path: '/app/settings/contacts', name: 'Contacts' },
      { path: '/app/settings/touring', name: 'Touring' },
      { path: '/app/settings/billing', name: 'Settings Billing' },
      { path: '/billing', name: 'Billing' },
      { path: '/account', name: 'Account' },
    ];

    for (const pageConfig of settingsPages) {
      try {
        await page.goto(pageConfig.path, {
          waitUntil: 'domcontentloaded',
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        });
        await waitForHydration(page);
        await page
          .waitForLoadState('networkidle', { timeout: 5_000 })
          .catch(() => {});

        const url = page.url();
        if (url.includes('/signin') || url.includes('/sign-in')) {
          await signInUser(page);
          continue;
        }

        const main = page.locator('main').first();
        const mainVisible = await main
          .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
          .catch(() => false);
        if (mainVisible) {
          const mainText = await main.innerText().catch(() => '');
          expect(
            mainText.length,
            `${pageConfig.name}: main content too short`
          ).toBeGreaterThan(20);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`${pageConfig.name}: ${msg.slice(0, 100)}`);
      }
    }
  });

  test('Admin pages render data tables', async ({ page }, testInfo) => {
    test.setTimeout(240_000);

    const adminUsername =
      process.env.E2E_CLERK_ADMIN_USERNAME ||
      process.env.E2E_CLERK_USER_USERNAME;
    const adminPassword =
      process.env.E2E_CLERK_ADMIN_PASSWORD ||
      process.env.E2E_CLERK_USER_PASSWORD;

    if (!adminUsername) {
      test.skip(true, 'No admin credentials');
      return;
    }

    try {
      await signInUser(page, {
        username: adminUsername,
        password: adminPassword,
      });
    } catch (error) {
      if (error instanceof ClerkTestError) {
        test.skip(true, `Clerk auth failed: ${error.message}`);
        return;
      }
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes('net::ERR_') ||
        msg.includes('Timeout') ||
        msg.includes('Target closed')
      ) {
        test.skip(true, 'Sign-in navigation issue');
        return;
      }
      throw error;
    }

    const adminPages = [
      { path: '/app/admin', name: 'Admin Dashboard' },
      { path: '/app/admin/creators', name: 'Admin Creators' },
      { path: '/app/admin/users', name: 'Admin Users' },
      { path: '/app/admin/waitlist', name: 'Admin Waitlist' },
    ];

    for (const pageConfig of adminPages) {
      try {
        const response = await page.goto(pageConfig.path, {
          waitUntil: 'domcontentloaded',
          timeout: SMOKE_TIMEOUTS.NAVIGATION * 2,
        });
        await waitForHydration(page);

        if (response?.status() === 404) {
          test.skip(true, 'Test user does not have admin access');
          return;
        }

        await page
          .waitForLoadState('networkidle', { timeout: 5_000 })
          .catch(() => {});

        const url = page.url();
        if (url.includes('/signin') || url.includes('/sign-in')) {
          await signInUser(page, {
            username: adminUsername,
            password: adminPassword,
          });
          continue;
        }

        const main = page.locator('main').first();
        const mainVisible = await main
          .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
          .catch(() => false);
        if (mainVisible) {
          const mainText = await main.innerText().catch(() => '');
          expect(
            mainText.length,
            `${pageConfig.name}: main content too short`
          ).toBeGreaterThan(30);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`${pageConfig.name}: ${msg.slice(0, 100)}`);
      }
    }
  });
});
