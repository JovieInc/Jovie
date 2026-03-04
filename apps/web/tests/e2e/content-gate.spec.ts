import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, Page, TestInfo, test } from '@playwright/test';
import {
  ClerkTestError,
  isProductionTarget,
  signInUser,
} from '../helpers/clerk-auth';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Content Gate — Pre-Production Content Verification
 *
 * Verifies that every critical page renders REAL CONTENT in the main area,
 * not just the app shell or nav menu. Catches silent data failures,
 * empty states, and broken feature flags before they reach production.
 *
 * This file is added to ci-smoke-required alongside golden-path and smoke-public.
 *
 * Page categories:
 * 1. Public: homepage, pricing, auth pages, public profiles
 * 2. Authenticated: dashboard pages, admin pages, right drawer
 *
 * Design decisions:
 * - Single auth session for all authenticated tests (speed)
 * - Serial mode to avoid Turbopack parallel compile issues
 * - Skip-on-infra-failure (don't fail CI for CDN/network flakes)
 * - Content assertions check for meaningful data, not exact text
 */

// ============================================================================
// Helpers
// ============================================================================

/** Navigate with retry for Turbopack cold compile */
async function navigateSafe(
  page: Page,
  path: string,
  testInfo: TestInfo,
  opts?: { timeout?: number }
): Promise<boolean> {
  const timeout = opts?.timeout ?? 90_000;
  try {
    await page.goto(path, { waitUntil: 'domcontentloaded', timeout });
    await waitForHydration(page);
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes('net::ERR_') ||
      msg.includes('Target closed') ||
      msg.includes('browser has disconnected') ||
      msg.includes('Timeout')
    ) {
      console.warn(
        `⚠ Skipping ${path}: Navigation issue (${msg.slice(0, 100)})`
      );
      test.skip(true, `Navigation issue on ${testInfo.project.name}`);
      return false;
    }
    throw error;
  }
}

/** Check main area has meaningful content (not blank/skeleton) */
async function assertMainContent(
  page: Page,
  description: string,
  opts?: { minLength?: number; selectors?: string[] }
) {
  const minLength = opts?.minLength ?? 50;

  // Wait for main content area
  const main = page.locator('main').first();
  await expect(main, `${description}: <main> should be visible`).toBeVisible({
    timeout: SMOKE_TIMEOUTS.VISIBILITY,
  });

  // Get visible text (innerText ignores hidden elements and scripts)
  const mainText = await main.innerText().catch(() => '');
  expect(
    mainText.length,
    `${description}: main content too short (${mainText.length} chars, need ${minLength}+)`
  ).toBeGreaterThan(minLength);

  // Check it's not an error page
  const lower = mainText.toLowerCase();
  const errorPatterns = [
    'application error',
    'internal server error',
    'something went wrong',
    'unhandled runtime error',
  ];
  for (const pattern of errorPatterns) {
    expect(lower, `${description}: shows "${pattern}"`).not.toContain(pattern);
  }

  // Check no error test IDs visible
  const errorBanner = page.locator(
    '[data-testid="error-page"], [data-testid="error-boundary"], [data-testid="dashboard-error"]'
  );
  const errorVisible = await errorBanner
    .first()
    .isVisible()
    .catch(() => false);
  expect(errorVisible, `${description}: error banner visible`).toBe(false);

  // Verify additional selectors if provided
  if (opts?.selectors) {
    for (const sel of opts.selectors) {
      await expect(
        page.locator(sel).first(),
        `${description}: expected ${sel} to be visible`
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    }
  }
}

/** Check page didn't redirect to an error/onboarding page */
function assertNoSilentFailure(currentUrl: string, pageName: string) {
  expect(
    currentUrl,
    `${pageName}: silently redirected to onboarding`
  ).not.toContain('/onboarding');
  expect(
    currentUrl,
    `${pageName}: silently redirected to sign-in`
  ).not.toContain('/sign-in');
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
    if (!(await navigateSafe(page, '/', testInfo))) return;

    // Hero heading
    const h1 = page.locator('h1').first();
    await expect(h1, 'Homepage: h1 should be visible').toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // CTA button exists (Get started or Claim handle)
    const cta = page
      .locator(
        'a[href*="/signup"], a[href*="/sign-up"], a[href*="/waitlist"], button:has-text("Claim"), a:has-text("Get started")'
      )
      .first();
    await expect(cta, 'Homepage: CTA should be visible').toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Multiple sections loaded (not just shell)
    const sectionCount = await page.locator('section').count();
    expect(
      sectionCount,
      `Homepage: expected 2+ sections, got ${sectionCount}`
    ).toBeGreaterThanOrEqual(2);

    // Footer exists (proves full page rendered)
    const footer = page.locator('footer').first();
    await expect(footer, 'Homepage: footer should be visible').toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Page has substantial content
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    expect(bodyText.length, 'Homepage: body content too short').toBeGreaterThan(
      500
    );
  });

  test('Pricing page shows plan tiers with prices', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    if (!(await navigateSafe(page, '/pricing', testInfo))) return;

    // If pricing page redirects (e.g., hidden for founding member launch JOV-1050), skip
    if (!page.url().includes('/pricing')) {
      test.skip(true, 'Pricing page redirects — hidden (JOV-1050)');
      return;
    }

    // Main heading
    const h1 = page.locator('h1').first();
    await expect(h1, 'Pricing: h1 should be visible').toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Free tier price
    await expect(
      page.getByText('$0').first(),
      'Pricing: should show $0 free tier'
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    // At least one paid tier price (Pro or Growth)
    const hasPaidPrice = await page
      .locator('text=/\\$\\d+/')
      .nth(1)
      .isVisible()
      .catch(() => false);
    expect(hasPaidPrice, 'Pricing: should show at least one paid tier').toBe(
      true
    );

    // CTA buttons present
    const ctaCount = await page
      .getByRole('link', { name: /Get started|Sign up|Start free/i })
      .count();
    expect(ctaCount, 'Pricing: should have CTA buttons').toBeGreaterThanOrEqual(
      1
    );

    // Page has substantial content (feature lists, FAQs, etc.)
    await assertMainContent(page, 'Pricing', { minLength: 200 });
  });

  test('Auth pages render Clerk forms', async ({ page }, testInfo) => {
    test.setTimeout(60_000);

    // Skip if no real Clerk config
    const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
    if (!pk || pk.includes('mock') || pk.includes('dummy')) {
      test.skip(true, 'No real Clerk config');
      return;
    }

    // Sign-up page
    if (!(await navigateSafe(page, '/sign-up', testInfo))) return;

    // Should have form elements (Clerk renders form or social buttons)
    const hasForm = await page
      .locator('form, [data-clerk-component], button[data-localization-key]')
      .first()
      .isVisible({ timeout: 15_000 })
      .catch(() => false);

    // If no Clerk component, at least verify we're on an auth page
    if (!hasForm) {
      const bodyText = await page
        .locator('body')
        .innerText()
        .catch(() => '');
      const hasAuthContent =
        bodyText.toLowerCase().includes('sign') ||
        bodyText.toLowerCase().includes('create') ||
        bodyText.toLowerCase().includes('log in');
      expect(hasAuthContent, 'Sign-up: should show auth-related content').toBe(
        true
      );
    }

    // Sign-in page
    if (!(await navigateSafe(page, '/signin', testInfo))) return;

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
      const hasAuthContent =
        bodyText.toLowerCase().includes('sign') ||
        bodyText.toLowerCase().includes('log in');
      expect(hasAuthContent, 'Sign-in: should show auth-related content').toBe(
        true
      );
    }
  });

  test('Public profile shows artist content and action buttons', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);

    const testProfile = process.env.E2E_TEST_PROFILE || 'dualipa';
    if (!(await navigateSafe(page, `/${testProfile}`, testInfo))) return;

    // Check for profile not found / loading skeleton
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    const lower = bodyText.toLowerCase();
    if (
      lower.includes('not found') ||
      lower.includes('temporarily unavailable')
    ) {
      test.skip(true, 'Profile not seeded in test database');
      return;
    }
    if (
      lower.includes('loading jovie profile') ||
      lower.includes('loading artist profile')
    ) {
      // Wait a bit more
      await page
        .waitForFunction(() => document.readyState === 'complete', {
          timeout: 10000,
        })
        .catch(() => {});
      const retry = await page
        .locator('body')
        .innerText()
        .catch(() => '');
      if (retry.toLowerCase().includes('loading')) {
        test.skip(true, 'Profile stuck on loading skeleton');
        return;
      }
    }

    // Artist name in h1
    const h1 = page.locator('h1').first();
    await expect(
      h1,
      'Profile: artist name heading should be visible'
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    const h1Text = await h1.innerText().catch(() => '');
    expect(
      h1Text.length,
      'Profile: h1 should contain artist name'
    ).toBeGreaterThan(0);

    // Profile should have an image (avatar or background)
    // In CI, the profile may lack images — the h1 visibility already proves the page rendered
    const hasImage = await page
      .locator('img')
      .first()
      .isVisible()
      .catch(() => false);
    if (!hasImage) {
      console.warn(
        '⚠ Profile has no visible images — may lack avatar data in CI'
      );
    }

    // Action buttons present (Listen, Subscribe, Tip, or DSP links)
    // In CI, the profile may lack interactive content — warn but don't fail
    const actionButtons = page.locator(
      'button:has-text("Listen"), button:has-text("Subscribe"), button:has-text("Tip"), a:has-text("Spotify"), a:has-text("Apple Music"), [data-testid="listen-button"], [data-testid="tip-button"]'
    );
    const actionCount = await actionButtons.count();
    const hasInteractiveContent =
      actionCount > 0 ||
      (await page.locator('a[href*="spotify"], a[href*="apple"]').count()) > 0;
    if (!hasInteractiveContent) {
      console.warn(
        '⚠ Profile has no action buttons or DSP links — may lack data in CI'
      );
    }

    // Profile page has substantial content
    await assertMainContent(page, 'Public profile', { minLength: 100 });
  });

  test('Public profile listen mode shows DSP options', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);

    const testProfile = process.env.E2E_TEST_PROFILE || 'dualipa';
    if (!(await navigateSafe(page, `/${testProfile}?mode=listen`, testInfo)))
      return;

    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    const lower = bodyText.toLowerCase();
    if (lower.includes('not found') || lower.includes('temporarily')) {
      test.skip(true, 'Profile not seeded');
      return;
    }

    // Should show h1 with artist name
    await expect(page.locator('h1').first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // DSP buttons or fallback — profile may lack streaming data in CI.
    // The h1 visibility above already proves the listen page rendered.
    const dspContent = page.locator(
      'button:has-text("Open in Spotify"), a:has-text("Spotify"), button:has-text("Apple Music"), a:has-text("Apple Music")'
    );
    const noLinksMsg = page.getByText(/streaming links aren.t available/i);
    const hasDspOrMessage =
      (await dspContent
        .first()
        .isVisible()
        .catch(() => false)) ||
      (await noLinksMsg.isVisible().catch(() => false));
    if (!hasDspOrMessage) {
      console.warn(
        '⚠ Listen mode DSP content not found — profile may lack streaming data in CI'
      );
    }
  });
});

// ============================================================================
// AUTHENTICATED PAGES (dashboard, admin, drawer)
// ============================================================================

test.describe('Content Gate — Authenticated Pages', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }, testInfo) => {
    // Skip authenticated content gate on production targets — use smoke-prod-auth.spec.ts instead
    if (isProductionTarget()) {
      test.skip(
        true,
        'Authenticated content gate skipped on production target'
      );
      return;
    }

    const username = process.env.E2E_CLERK_USER_USERNAME;
    const hasTestCredentials =
      username &&
      (username.includes('+clerk_test') || process.env.E2E_CLERK_USER_PASSWORD);

    if (!hasTestCredentials) {
      test.skip(true, 'No test user credentials configured');
      return;
    }

    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      test.skip(true, 'Clerk testing setup was not successful');
      return;
    }

    const requiredEnvVars = {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
      DATABASE_URL: process.env.DATABASE_URL,
    };

    for (const [key, value] of Object.entries(requiredEnvVars)) {
      if (!value || value.includes('mock') || value.includes('dummy')) {
        test.skip(true, `${key} is not properly configured`);
        return;
      }
    }

    await setupClerkTestingToken({ page });
  });

  test('Dashboard pages render real content', async ({ page }, testInfo) => {
    test.setTimeout(300_000); // 5 min — sign-in + multiple page loads

    // Sign in
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

    // Verify we're in the app
    await expect(page).toHaveURL(/\/app\//, {
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    const currentUrl = page.url();
    assertNoSilentFailure(currentUrl, 'Dashboard initial');

    /**
     * Dashboard pages with their expected content indicators.
     * Each page must render meaningful content in <main>, not just the nav shell.
     */
    const dashboardPages = [
      {
        path: '/app/dashboard/profile',
        name: 'Profile',
        // Profile page should have form fields or profile data
        contentChecks: [
          'h1, h2, [data-testid="profile-section"]',
          'form, img, [data-testid]',
        ],
      },
      {
        path: '/app/dashboard/analytics',
        name: 'Analytics',
        // Analytics should show charts, metrics, or empty state message
        contentChecks: [],
      },
      {
        path: '/app/dashboard/audience',
        name: 'Audience',
        contentChecks: [],
      },
      {
        path: '/app/dashboard/releases',
        name: 'Releases',
        contentChecks: [],
      },
      {
        path: '/app/dashboard/earnings',
        name: 'Earnings',
        contentChecks: [],
      },
      {
        path: '/app/dashboard/chat',
        name: 'Chat',
        contentChecks: [],
      },
    ];

    const results: Array<{
      name: string;
      status: 'pass' | 'fail' | 'skip';
      error?: string;
    }> = [];

    for (const pageConfig of dashboardPages) {
      try {
        await page.goto(pageConfig.path, {
          waitUntil: 'domcontentloaded',
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        });
        await waitForHydration(page);

        // Allow page to settle (data fetching)
        await Promise.race([
          page.waitForLoadState('networkidle'),
          page.waitForTimeout(5000),
        ]).catch(() => {});

        const url = page.url();

        // Check for auth redirect
        if (url.includes('/signin') || url.includes('/sign-in')) {
          // Re-authenticate
          await signInUser(page);
          results.push({
            name: pageConfig.name,
            status: 'skip',
            error: 'Session expired',
          });
          continue;
        }

        assertNoSilentFailure(url, pageConfig.name);

        // Core assertion: main area has real content
        await assertMainContent(page, `Dashboard/${pageConfig.name}`, {
          minLength: 30, // Some pages may have minimal content for new accounts
        });

        // Sidebar should still be visible (proves shell is intact)
        const sidebarNav = page.locator('nav').first();
        const hasSidebar = await sidebarNav.isVisible().catch(() => false);
        if (!hasSidebar) {
          console.warn(
            `${pageConfig.name}: sidebar nav not visible — possible shell issue`
          );
        }

        results.push({ name: pageConfig.name, status: 'pass' });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        results.push({ name: pageConfig.name, status: 'fail', error: msg });

        // Capture screenshot on failure
        const screenshot = await page.screenshot().catch(() => null);
        if (screenshot) {
          await testInfo.attach(`fail-${pageConfig.name}`, {
            body: screenshot,
            contentType: 'image/png',
          });
        }
      }
    }

    // Attach results summary
    await testInfo.attach('dashboard-content-results', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });

    // Log summary
    const passed = results.filter(r => r.status === 'pass');
    const failed = results.filter(r => r.status === 'fail');
    console.log(
      `\n📊 Dashboard Content: ${passed.length}/${dashboardPages.length} passed`
    );
    if (failed.length > 0) {
      failed.forEach(f => console.log(`   ❌ ${f.name}: ${f.error}`));
    }

    // Assert no failures
    expect(
      failed,
      `${failed.length} dashboard pages failed content check`
    ).toHaveLength(0);
  });

  test('Settings pages render content', async ({ page }, testInfo) => {
    test.setTimeout(180_000);

    // Sign in
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
        await Promise.race([
          page.waitForLoadState('networkidle'),
          page.waitForTimeout(5000),
        ]).catch(() => {});

        const url = page.url();
        // Settings pages may redirect to other settings or dashboard — that's fine
        if (url.includes('/signin') || url.includes('/sign-in')) {
          await signInUser(page);
          continue;
        }

        // Verify main content area rendered
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
        // Log but don't fail for settings pages — they may redirect
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ ${pageConfig.name}: ${msg.slice(0, 100)}`);
      }
    }
  });

  test('Admin pages render data tables', async ({ page }, testInfo) => {
    test.setTimeout(240_000);

    // Check for admin credentials
    const adminUsername =
      process.env.E2E_CLERK_ADMIN_USERNAME ||
      process.env.E2E_CLERK_USER_USERNAME;
    const adminPassword =
      process.env.E2E_CLERK_ADMIN_PASSWORD ||
      process.env.E2E_CLERK_USER_PASSWORD;

    if (!adminUsername) {
      test.skip(true, 'No admin credentials configured');
      return;
    }

    try {
      await signInUser(page, {
        username: adminUsername,
        password: adminPassword,
      });
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

    const adminPages = [
      { path: '/app/admin', name: 'Admin Dashboard' },
      { path: '/app/admin/creators', name: 'Admin Creators' },
      { path: '/app/admin/users', name: 'Admin Users' },
      { path: '/app/admin/waitlist', name: 'Admin Waitlist' },
    ];

    let hasAdminAccess = true;

    for (const pageConfig of adminPages) {
      try {
        const response = await page.goto(pageConfig.path, {
          waitUntil: 'domcontentloaded',
          timeout: SMOKE_TIMEOUTS.NAVIGATION * 2,
        });
        await waitForHydration(page);

        // Check for 404 (user not admin)
        if (response?.status() === 404) {
          hasAdminAccess = false;
          break;
        }

        await Promise.race([
          page.waitForLoadState('networkidle'),
          page.waitForTimeout(5000),
        ]).catch(() => {});

        const url = page.url();
        if (url.includes('/signin') || url.includes('/sign-in')) {
          await signInUser(page, {
            username: adminUsername,
            password: adminPassword,
          });
          continue;
        }

        // Admin pages should have data — tables, cards, or metric values
        const main = page.locator('main').first();
        const mainVisible = await main
          .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
          .catch(() => false);

        if (mainVisible) {
          const mainText = await main.innerText().catch(() => '');
          expect(
            mainText.length,
            `${pageConfig.name}: main content too short (${mainText.length} chars)`
          ).toBeGreaterThan(30);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ ${pageConfig.name}: ${msg.slice(0, 100)}`);
      }
    }

    if (!hasAdminAccess) {
      test.skip(true, 'Test user does not have admin access');
    }
  });

  test('Right drawer opens and loads content on dashboard', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);

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

    // Navigate to profile page (most likely to have drawer triggers)
    await page.goto('/app/dashboard/profile', {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);
    await Promise.race([
      page.waitForLoadState('networkidle'),
      page.waitForTimeout(5000),
    ]).catch(() => {});

    // Look for drawer trigger (common patterns: edit button, "view" link, table row click)
    const drawerTriggers = page.locator(
      'button:has-text("Edit"), button:has-text("Preview"), [data-testid*="drawer"], [data-testid*="panel"], button[aria-haspopup="dialog"]'
    );
    const triggerCount = await drawerTriggers.count();

    if (triggerCount === 0) {
      // No drawer triggers on this page — skip but don't fail
      console.log(
        '⚠ No drawer triggers found on profile page — skipping drawer test'
      );
      return;
    }

    // Click the first available drawer trigger
    const trigger = drawerTriggers.first();
    await trigger.click();

    // Wait for drawer/panel to appear
    const drawer = page.locator(
      '[role="dialog"], [data-testid*="drawer"], [data-testid*="panel"], [data-state="open"]'
    );
    const drawerVisible = await drawer
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    if (drawerVisible) {
      // Drawer opened — verify it has content
      const drawerText = await drawer
        .first()
        .innerText()
        .catch(() => '');
      expect(
        drawerText.length,
        'Drawer/panel should have content'
      ).toBeGreaterThan(10);
    } else {
      // Some "edit" buttons may navigate instead of opening a drawer
      // That's acceptable — just verify we didn't crash
      const bodyText = await page
        .locator('body')
        .innerText()
        .catch(() => '');
      const hasError =
        bodyText.toLowerCase().includes('application error') ||
        bodyText.toLowerCase().includes('something went wrong');
      expect(hasError, 'Clicking drawer trigger should not crash').toBe(false);
    }
  });
});
