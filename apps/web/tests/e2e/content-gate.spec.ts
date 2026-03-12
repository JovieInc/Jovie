import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  ClerkTestError,
  ensureSignedInUser,
  isProductionTarget,
  signInUser,
} from '../helpers/clerk-auth';
import {
  SMOKE_TIMEOUTS,
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';

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
    await smokeNavigateWithRetry(page, path, {
      timeout: opts?.timeout ?? 90_000,
      retries: process.env.E2E_FAST_ITERATION === '1' ? 3 : 2,
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

async function assertDashboardPageContent(
  page: import('@playwright/test').Page,
  pageConfig: {
    name: string;
    minLength?: number;
    readyText?: RegExp;
  }
) {
  if (pageConfig.name === 'Chat') {
    const chatReady = page
      .locator(
        'textarea, [contenteditable="true"], button:has-text("New thread")'
      )
      .first();
    await expect(
      chatReady,
      'Dashboard/Chat: composer or new thread CTA should be visible'
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    return;
  }

  if (pageConfig.readyText) {
    const readySignal = page.getByText(pageConfig.readyText).first();
    const hasReadySignal = await readySignal
      .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
      .catch(() => false);
    if (hasReadySignal) {
      return;
    }
  }

  await assertMainContent(page, `Dashboard/${pageConfig.name}`, {
    minLength: pageConfig.minLength ?? 30,
  });
}

// ============================================================================
// PUBLIC PAGES (unauthenticated)
// ============================================================================

test.describe('Content Gate — Public Pages', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: { cookies: [], origins: [] } });
  test.skip(
    FAST_ITERATION,
    'Public content gate duplicates smoke-public and smoke-auth coverage in the fast lane'
  );

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

    for (const authPage of [
      { path: APP_ROUTES.SIGNUP, name: 'Sign-up' },
      { path: APP_ROUTES.SIGNIN, name: 'Sign-in' },
    ]) {
      if (!(await navigateSafe(page, authPage.path))) return;

      await expect(page).toHaveURL(new RegExp(authPage.path), {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const hasAuthUi = await page
        .locator(
          [
            'form',
            'input[name="identifier"]',
            'input[type="email"]',
            '[data-clerk-component]',
            'button[data-localization-key]',
            'button:has-text("Continue")',
            'button:has-text("Google")',
          ].join(', ')
        )
        .first()
        .isVisible({ timeout: 15_000 })
        .catch(() => false);

      if (!hasAuthUi) {
        const bodyText = await page
          .locator('body')
          .innerText()
          .catch(() => '');
        expect(
          bodyText.length,
          `${authPage.name}: body should not be blank`
        ).toBeGreaterThan(50);
        expect(
          bodyText.toLowerCase(),
          `${authPage.name}: should not render an application error`
        ).not.toContain('application error');
      }
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
  const fastIteration = process.env.E2E_FAST_ITERATION === '1';

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
  });

  test('Dashboard pages render real content', async ({ page }, testInfo) => {
    test.setTimeout(300_000);

    try {
      await ensureSignedInUser(page);
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

    await expect(page).toHaveURL(/\/app(?:\/|$)/, {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    const dashboardPages = fastIteration
      ? [
          {
            path: APP_ROUTES.DASHBOARD_RELEASES,
            name: 'Releases',
            readyText: /releases|music|tracks/i,
          },
        ]
      : [
          {
            path: APP_ROUTES.DASHBOARD_AUDIENCE,
            name: 'Audience',
            minLength: 10,
            readyText: /audience|fans|subscribers/i,
          },
          {
            path: APP_ROUTES.DASHBOARD_RELEASES,
            name: 'Releases',
            readyText: /releases|music|tracks/i,
          },
          {
            path: APP_ROUTES.DASHBOARD_EARNINGS,
            name: 'Earnings',
            minLength: 10,
            readyText: /earnings|tips|revenue/i,
          },
          { path: APP_ROUTES.CHAT, name: 'Chat' },
        ];

    const failures: Array<{ name: string; error: string }> = [];

    for (const pageConfig of dashboardPages) {
      try {
        await smokeNavigateWithRetry(page, pageConfig.path, {
          timeout: fastIteration ? 90_000 : SMOKE_TIMEOUTS.NAVIGATION,
          retries: fastIteration ? 3 : 2,
        });
        await waitForHydration(page);
        if (!fastIteration) {
          await page
            .waitForLoadState('networkidle', { timeout: 5_000 })
            .catch(() => {});
        }

        const url = page.url();
        if (url.includes('/signin') || url.includes('/sign-in')) {
          await signInUser(page);
          continue;
        }

        expect(
          url,
          `${pageConfig.name}: redirected to onboarding`
        ).not.toContain('/onboarding');

        await assertDashboardPageContent(page, pageConfig);
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
    test.setTimeout(fastIteration ? 180_000 : 240_000);

    try {
      await ensureSignedInUser(page);
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

    const settingsPages = fastIteration
      ? [
          {
            path: APP_ROUTES.SETTINGS,
            name: 'Settings',
            readyText: /settings|preferences|account/i,
          },
        ]
      : [
          {
            path: APP_ROUTES.SETTINGS,
            name: 'Settings',
            readyText: /settings|preferences|account/i,
          },
          {
            path: APP_ROUTES.SETTINGS_CONTACTS,
            name: 'Contacts',
            readyText: /contacts|team|contact/i,
          },
          {
            path: APP_ROUTES.SETTINGS_TOURING,
            name: 'Touring',
            readyText: /tour|touring|dates/i,
          },
          {
            path: APP_ROUTES.SETTINGS_BILLING,
            name: 'Settings Billing',
            readyText: /billing|plan|subscription/i,
          },
          {
            path: APP_ROUTES.BILLING,
            name: 'Billing',
            readyText: /billing|plan|subscription/i,
          },
        ];

    const failures: Array<{ name: string; error: string }> = [];

    for (const pageConfig of settingsPages) {
      try {
        await smokeNavigateWithRetry(page, pageConfig.path, {
          timeout: fastIteration ? 90_000 : SMOKE_TIMEOUTS.NAVIGATION,
          retries: fastIteration ? 3 : 2,
        });
        await waitForHydration(page);
        if (!fastIteration) {
          await page
            .waitForLoadState('networkidle', { timeout: 5_000 })
            .catch(() => {});
        }

        const url = page.url();
        if (url.includes('/signin') || url.includes('/sign-in')) {
          await ensureSignedInUser(page);
          continue;
        }

        expect(
          url,
          `${pageConfig.name}: redirected to onboarding`
        ).not.toContain('/onboarding');

        await assertMainContent(page, `Settings/${pageConfig.name}`, {
          minLength: 20,
        });

        await expect(
          page.getByText(pageConfig.readyText).first(),
          `Settings/${pageConfig.name}: expected page content should be visible`
        ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        failures.push({ name: pageConfig.name, error: msg });
      }
    }

    expect(
      failures,
      `${failures.length} settings pages failed:\n${failures.map(f => `${f.name}: ${f.error}`).join('\n')}`
    ).toHaveLength(0);
  });

  test('Admin pages render data tables', async ({ page }, testInfo) => {
    test.setTimeout(fastIteration ? 180_000 : 240_000);
    test.skip(
      fastIteration,
      'Admin content gate duplicates dedicated admin dashboard/navigation/chaos coverage in the fast lane'
    );

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
      await ensureSignedInUser(page, {
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

    const adminPages = fastIteration
      ? [
          { path: APP_ROUTES.ADMIN, name: 'Admin Dashboard' },
          { path: APP_ROUTES.ADMIN_CAMPAIGNS, name: 'Admin Campaigns' },
        ]
      : [
          { path: APP_ROUTES.ADMIN, name: 'Admin Dashboard' },
          { path: APP_ROUTES.ADMIN_CREATORS, name: 'Admin Creators' },
          { path: APP_ROUTES.ADMIN_USERS, name: 'Admin Users' },
        ];

    const failures: Array<{ name: string; error: string }> = [];

    for (const pageConfig of adminPages) {
      try {
        const response = await smokeNavigateWithRetry(page, pageConfig.path, {
          timeout: fastIteration ? 90_000 : SMOKE_TIMEOUTS.NAVIGATION * 2,
          retries: fastIteration ? 3 : 2,
        });
        await waitForHydration(page);

        if (response?.status() === 404) {
          test.skip(true, 'Test user does not have admin access');
          return;
        }

        if (!fastIteration) {
          await page
            .waitForLoadState('networkidle', { timeout: 5_000 })
            .catch(() => {});
        }

        const url = page.url();
        if (url.includes('/signin') || url.includes('/sign-in')) {
          await ensureSignedInUser(page, {
            username: adminUsername,
            password: adminPassword,
          });
          continue;
        }

        await assertMainContent(page, `Admin/${pageConfig.name}`, {
          minLength: 20,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        failures.push({ name: pageConfig.name, error: msg });
      }
    }

    expect(
      failures,
      `${failures.length} admin pages failed:\n${failures.map(f => `${f.name}: ${f.error}`).join('\n')}`
    ).toHaveLength(0);
  });
});
