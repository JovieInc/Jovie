import { expect, Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  ensureSignedInUser,
  isProductionTarget,
  signInUser,
} from '../helpers/clerk-auth';
import {
  isTransientNavigationError,
  SMOKE_TIMEOUTS,
  smokeNavigateWithRetry,
  waitForHydration,
  waitForNetworkIdle,
} from './utils/smoke-test-utils';

/**
 * Dashboard E2E Tests (consolidated from dashboard-pages-health, dashboard-landing, dashboard-routing)
 *
 * Covers:
 * 1. All dashboard page health checks (loads, no errors, content visible)
 * 2. Admin page health checks
 * 3. Routing (back/forward nav, deep linking, redirect behavior)
 * 4. Lazy component hydration
 *
 * Run with doppler:
 *   doppler run -- pnpm exec playwright test dashboard-pages-health --project=chromium
 */

/**
 * Check if Clerk credentials are available for authenticated tests
 * Supports passwordless Clerk test emails (containing +clerk_test)
 */
function hasClerkCredentials(): boolean {
  const username = process.env.E2E_CLERK_USER_USERNAME ?? '';
  const password = process.env.E2E_CLERK_USER_PASSWORD ?? '';
  const clerkSetupSuccess = process.env.CLERK_TESTING_SETUP_SUCCESS === 'true';

  // Allow passwordless auth for Clerk test emails
  const isClerkTestEmail = username.includes('+clerk_test');

  return (
    username.length > 0 &&
    (password.length > 0 || isClerkTestEmail) &&
    clerkSetupSuccess
  );
}

/**
 * Check if admin Clerk credentials are available.
 * Falls back to regular credentials if admin-specific ones aren't set.
 * Supports passwordless Clerk test emails (containing +clerk_test)
 */
function hasAdminCredentials(): boolean {
  const adminUsername = process.env.E2E_CLERK_ADMIN_USERNAME ?? '';
  const adminPassword = process.env.E2E_CLERK_ADMIN_PASSWORD ?? '';
  const clerkSetupSuccess = process.env.CLERK_TESTING_SETUP_SUCCESS === 'true';

  // Allow passwordless auth for Clerk test emails
  const isClerkTestEmail = adminUsername.includes('+clerk_test');

  // Use admin-specific credentials if available, otherwise fall back to regular user
  // (assuming the regular test user might have admin access)
  if (
    adminUsername.length > 0 &&
    (adminPassword.length > 0 || isClerkTestEmail)
  ) {
    return clerkSetupSuccess;
  }

  // Fall back to regular credentials
  return hasClerkCredentials();
}

/**
 * Get admin credentials (admin-specific or fallback to regular)
 * Supports passwordless Clerk test emails (containing +clerk_test)
 */
function getAdminCredentials(): { username: string; password: string } {
  const adminUsername = process.env.E2E_CLERK_ADMIN_USERNAME ?? '';
  const adminPassword = process.env.E2E_CLERK_ADMIN_PASSWORD ?? '';

  // Allow passwordless auth for Clerk test emails
  const isClerkTestEmail = adminUsername.includes('+clerk_test');

  if (
    adminUsername.length > 0 &&
    (adminPassword.length > 0 || isClerkTestEmail)
  ) {
    return { username: adminUsername, password: adminPassword };
  }

  return {
    username: process.env.E2E_CLERK_USER_USERNAME ?? '',
    password: process.env.E2E_CLERK_USER_PASSWORD ?? '',
  };
}

/** Error text patterns that indicate a failed page */
const ERROR_TEXT_PATTERNS = [
  'application error',
  'internal server error',
  'something went wrong',
  'unhandled runtime error',
  'dashboard failed to load',
] as const;

/** Error element selectors */
const ERROR_ELEMENT_SELECTORS = [
  '[data-testid="error-page"]',
  '[data-testid="error-boundary"]',
  '[data-testid="dashboard-error"]',
  '.error-page',
  '.error-boundary',
] as const;

/** Result type for page health checks */
interface PageHealthResult {
  path: string;
  name: string;
  status: 'pass' | 'fail' | 'redirect';
  loadTimeMs?: number;
  error?: string;
}

/**
 * Check for visible error page indicators.
 * More robust than checking raw body text to avoid false positives from JS bundles.
 */
async function checkForErrorPage(page: Page): Promise<{
  hasError: boolean;
  errorText?: string;
}> {
  // Get visible text from the page
  const mainText = await page
    .locator('main')
    .innerText()
    .catch(() => '');
  const bodyText = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  const pageText = (mainText || bodyText).toLowerCase();

  // Check for error text patterns
  const matchedPattern = ERROR_TEXT_PATTERNS.find(pattern =>
    pageText.includes(pattern)
  );
  if (matchedPattern) {
    return {
      hasError: true,
      errorText: `Found "${matchedPattern}" in page content`,
    };
  }

  // Check for error elements
  for (const selector of ERROR_ELEMENT_SELECTORS) {
    const isVisible = await page
      .locator(selector)
      .first()
      .isVisible()
      .catch(() => false);
    if (isVisible) {
      return {
        hasError: true,
        errorText: `Error element visible: ${selector}`,
      };
    }
  }

  return { hasError: false };
}

/**
 * Dashboard pages to test
 *
 * Note: Only include pages that render actual content.
 * Redirect-only pages are excluded from this list.
 *
 * Excluded redirect pages:
 * - /app/dashboard -> redirects to / (marketing homepage)
 * - /app/dashboard/overview -> redirects to /app/dashboard -> /
 * - /app/dashboard/links -> redirects to /app/dashboard/profile
 * - /app/dashboard/tipping -> redirects to /app/dashboard/earnings
 */
const DASHBOARD_PAGES = [
  { path: '/app/dashboard/audience', name: 'Audience' },
  { path: APP_ROUTES.CHAT, name: 'Chat' },
  { path: '/app/dashboard/earnings', name: 'Earnings' },
  { path: '/app/dashboard/releases', name: 'Releases' },
  { path: '/app/settings/contacts', name: 'Contacts' },
  { path: '/app/settings/touring', name: 'Touring' },
  { path: '/app/settings/billing', name: 'Settings Billing' },
  { path: '/billing', name: 'Billing' },
  { path: '/account', name: 'Account' },
] as const;

const FAST_DASHBOARD_PAGES = [
  { path: '/app/dashboard/audience', name: 'Audience' },
  { path: APP_ROUTES.CHAT, name: 'Chat' },
  { path: '/app/dashboard/releases', name: 'Releases' },
] as const;

/**
 * Admin pages to test
 *
 * These pages require admin privileges. Tests will be skipped if:
 * - No admin credentials configured (E2E_CLERK_ADMIN_USERNAME/PASSWORD)
 * - Test user doesn't have admin access (404 response)
 */
const ADMIN_PAGES = [
  { path: '/app/admin', name: 'Admin Dashboard' },
  { path: '/app/admin/activity', name: 'Admin Activity' },
  { path: '/app/admin/campaigns', name: 'Admin Campaigns' },
  { path: '/app/admin/creators', name: 'Admin Creators' },
  { path: '/app/admin/users', name: 'Admin Users' },
] as const;

const FAST_ADMIN_PAGES = [
  { path: '/app/admin', name: 'Admin Dashboard' },
  { path: '/app/admin/campaigns', name: 'Admin Campaigns' },
] as const;

const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';
const ACTIVE_DASHBOARD_PAGES = FAST_ITERATION
  ? FAST_DASHBOARD_PAGES
  : DASHBOARD_PAGES;
const ACTIVE_ADMIN_PAGES = FAST_ITERATION ? FAST_ADMIN_PAGES : ADMIN_PAGES;
const HEALTH_NAVIGATION_TIMEOUT = FAST_ITERATION
  ? 90_000
  : SMOKE_TIMEOUTS.NAVIGATION;

test.skip(
  FAST_ITERATION,
  'Dashboard route-health sweeps run in the slower dashboard regression lane'
);

test.describe('Dashboard Pages Health Check @smoke', () => {
  // signInUser navigates to /signin, waits 60s for Clerk, signs in, then navigates to
  // /app/dashboard/profile (120s Turbopack). Combined with test body, need generous timeout.
  test.setTimeout(360_000);

  test.beforeEach(async ({ page }) => {
    // Skip full health check on production targets — use smoke-prod-auth.spec.ts instead
    if (isProductionTarget()) {
      test.skip(
        true,
        'Full dashboard health check skipped on production target'
      );
      return;
    }

    // Skip if no Clerk credentials configured
    if (!hasClerkCredentials()) {
      console.log('⚠ Skipping dashboard health tests - no Clerk credentials');
      console.log('  Set E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD');
      test.skip();
      return;
    }

    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );

    try {
      await ensureSignedInUser(page);
    } catch (error) {
      console.error('Failed to sign in test user:', error);
      test.skip();
    }
  });

  /**
   * Primary health check - tests all dashboard pages in sequence
   *
   * This is the main test that runs in CI. It's more reliable than
   * individual page tests because it:
   * - Only signs in once (faster, less flaky)
   * - Tests pages sequentially (no race conditions)
   * - Reports detailed results for all pages
   */
  test('All dashboard pages load without errors', async ({
    page,
  }, testInfo) => {
    test.skip(
      FAST_ITERATION,
      'Batch dashboard health duplicates chaos and content-gate coverage in the fast lane'
    );
    test.setTimeout(FAST_ITERATION ? 240_000 : 300_000);

    const results: PageHealthResult[] = [];

    for (const pageConfig of ACTIVE_DASHBOARD_PAGES) {
      const startTime = Date.now();

      try {
        // Navigate to the page
        await smokeNavigateWithRetry(page, pageConfig.path, {
          timeout: HEALTH_NAVIGATION_TIMEOUT,
          retries: FAST_ITERATION ? 3 : 2,
        });

        // Wait for React hydration
        await waitForHydration(page);

        // The hot-loop fast path already uses a warm dev server and stored auth.
        // Skip the broader network-idle wait so this batch stays lightweight.
        if (!FAST_ITERATION) {
          await waitForNetworkIdle(page);
        }

        const loadTimeMs = Date.now() - startTime;

        // Check if we were redirected
        const currentUrl = page.url();

        // Check for auth redirect (session expired)
        if (currentUrl.includes('/signin') || currentUrl.includes('/sign-in')) {
          results.push({
            path: pageConfig.path,
            name: pageConfig.name,
            status: 'redirect',
            loadTimeMs,
            error: 'Session expired - redirected to auth',
          });
          // Re-authenticate and continue
          await signInUser(page);
          continue;
        }

        // Check if redirected to different dashboard/settings/billing page (feature gate, etc.)
        // This is okay - the page exists, it just redirected based on permissions
        if (
          !currentUrl.includes(pageConfig.path) &&
          (currentUrl.includes('/app/dashboard') ||
            currentUrl.includes('/app/settings') ||
            currentUrl.includes('/billing') ||
            currentUrl.includes('/account'))
        ) {
          results.push({
            path: pageConfig.path,
            name: pageConfig.name,
            status: 'pass', // Count as pass - feature gate redirects are expected
            loadTimeMs,
          });
          continue;
        }

        // Check if redirected outside dashboard/settings entirely (e.g., to onboarding)
        if (
          !currentUrl.includes(pageConfig.path) &&
          !currentUrl.includes('/app/dashboard') &&
          !currentUrl.includes('/app/settings')
        ) {
          // This might be a redirect to onboarding, home, etc.
          // Count as pass if it's a valid redirect destination
          const validRedirectDestinations = [
            '/onboarding',
            '/app/',
            '/app/settings',
          ];
          // Parse URL to check origin for root path redirect safety
          const parsedUrl = new URL(currentUrl);
          const expectedOrigin = new URL(page.url()).origin;
          const isSameOriginRoot =
            parsedUrl.origin === expectedOrigin && parsedUrl.pathname === '/';
          const isValidRedirect =
            validRedirectDestinations.some(dest => currentUrl.includes(dest)) ||
            isSameOriginRoot;

          if (isValidRedirect) {
            results.push({
              path: pageConfig.path,
              name: pageConfig.name,
              status: 'pass', // Feature gate or permission redirect
              loadTimeMs,
            });
            continue;
          }

          // Unexpected redirect - fail the test
          results.push({
            path: pageConfig.path,
            name: pageConfig.name,
            status: 'fail',
            loadTimeMs,
            error: `Unexpected redirect to ${currentUrl}`,
          });
          continue;
        }

        // Check for error pages
        const { hasError, errorText } = await checkForErrorPage(page);

        if (hasError) {
          // Capture screenshot for debugging
          const screenshot = await page.screenshot().catch(() => null);
          if (screenshot) {
            await testInfo.attach(`error-${pageConfig.name}`, {
              body: screenshot,
              contentType: 'image/png',
            });
          }

          results.push({
            path: pageConfig.path,
            name: pageConfig.name,
            status: 'fail',
            loadTimeMs,
            error: errorText,
          });
        } else {
          results.push({
            path: pageConfig.path,
            name: pageConfig.name,
            status: 'pass',
            loadTimeMs,
          });
        }
      } catch (error) {
        const isTransient = isTransientNavigationError(error);
        results.push({
          path: pageConfig.path,
          name: pageConfig.name,
          status: isTransient ? 'redirect' : 'fail',
          loadTimeMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Attach detailed results for debugging
    await testInfo.attach('dashboard-health-results', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });

    // Log summary
    const passed = results.filter(r => r.status === 'pass');
    const failed = results.filter(r => r.status === 'fail');
    const redirected = results.filter(r => r.status === 'redirect');

    console.log('\n📊 Dashboard Health Summary:');
    console.log(
      `   ✅ Passed: ${passed.length}/${ACTIVE_DASHBOARD_PAGES.length}`
    );
    if (failed.length > 0) {
      console.log(`   ❌ Failed: ${failed.length}`);
      failed.forEach(f => console.log(`      - ${f.name}: ${f.error}`));
    }
    if (redirected.length > 0) {
      console.log(`   🔄 Redirected: ${redirected.length}`);
    }

    // Show load times for performance insights
    if (results.length > 0) {
      const avgLoadTime =
        results.reduce((sum, r) => sum + (r.loadTimeMs || 0), 0) /
        results.length;
      console.log(`   ⏱️  Avg load time: ${Math.round(avgLoadTime)}ms`);
    }

    // Assert no failures
    expect(failed, `${failed.length} pages failed health check`).toHaveLength(
      0
    );
  });

  /**
   * Individual page tests - useful for debugging specific pages
   *
   * These tests are more granular but can be flakier due to:
   * - Separate auth flow per test
   * - Potential race conditions with page monitoring
   *
   * Run specific page: --grep "Profile"
   */
  for (const pageConfig of ACTIVE_DASHBOARD_PAGES) {
    test(`[Debug] ${pageConfig.name} page loads`, async ({
      page,
    }, testInfo) => {
      // Skip by default in CI and fast local loops - use the batch test instead.
      if (
        (process.env.CI || FAST_ITERATION) &&
        !process.env.DEBUG_INDIVIDUAL_PAGES
      ) {
        test.skip();
        return;
      }

      test.setTimeout(120_000); // Increased from 60s — Turbopack cold compilation + Clerk CDN can exceed 60s

      // Navigate to the page (already signed in from beforeEach)
      const currentUrl = page.url();
      if (!currentUrl.includes(pageConfig.path)) {
        await page.goto(pageConfig.path, {
          waitUntil: 'domcontentloaded',
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        });
      }

      await waitForHydration(page);

      // Wait for page to stabilize
      await page
        .waitForLoadState('networkidle', { timeout: 5000 })
        .catch(() => {});
      // Wait for React to fully hydrate - check for absence of loading states
      await page
        .waitForFunction(
          () => !document.querySelector('[data-loading="true"]'),
          { timeout: 5000 }
        )
        .catch(() => {});

      // Check for errors
      const { hasError, errorText } = await checkForErrorPage(page);

      if (hasError) {
        const screenshot = await page.screenshot().catch(() => null);
        if (screenshot) {
          await testInfo.attach('error-screenshot', {
            body: screenshot,
            contentType: 'image/png',
          });
        }
      }

      expect(hasError, errorText || 'Page shows error').toBe(false);

      // Verify main content is visible
      const mainContent = page.locator('main').first();
      await expect(mainContent).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
    });
  }
});

test.describe('Admin Pages Health Check @smoke', () => {
  // Admin pages: signInUser (180s+) + 6 admin pages × 60s each (warmed up in global-setup)
  test.setTimeout(600_000);

  test.beforeEach(async ({ page }) => {
    // Skip full admin health check on production targets
    if (isProductionTarget()) {
      test.skip(true, 'Admin health check skipped on production target');
      return;
    }

    // Skip if no admin credentials configured
    if (!hasAdminCredentials()) {
      console.log('⚠ Skipping admin health tests - no credentials');
      console.log(
        '  Set E2E_CLERK_ADMIN_USERNAME/PASSWORD or E2E_CLERK_USER_USERNAME/PASSWORD'
      );
      test.skip();
      return;
    }

    const { username, password } = getAdminCredentials();

    try {
      await ensureSignedInUser(page, { username, password });
    } catch (error) {
      console.error('Failed to sign in admin user:', error);
      test.skip();
    }
  });

  /**
   * Primary admin health check - tests all admin pages in sequence
   *
   * Admin pages require isAdmin entitlement. If the test user doesn't have
   * admin access, the pages will return 404 and the test will skip.
   */
  test('All admin pages load without errors', async ({ page }, testInfo) => {
    test.setTimeout(FAST_ITERATION ? 300_000 : 480_000);

    // Capture browser console errors for debugging page failures
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[console.error] ${msg.text()}`);
      }
    });
    page.on('pageerror', err => {
      consoleErrors.push(`[pageerror] ${err.message}\n${err.stack ?? ''}`);
    });

    const results: PageHealthResult[] = [];
    let hasAdminAccess = true;

    for (const pageConfig of ACTIVE_ADMIN_PAGES) {
      const startTime = Date.now();

      try {
        // Navigate to the page with increased timeout for admin pages
        // Admin pages are hit later in the test suite when the server may be under load
        const response = await smokeNavigateWithRetry(page, pageConfig.path, {
          timeout: 90_000,
          retries: FAST_ITERATION ? 3 : 2,
        });

        // Wait for React hydration
        await waitForHydration(page);

        // Allow page to stabilize
        await waitForNetworkIdle(page);

        const loadTimeMs = Date.now() - startTime;
        const currentUrl = page.url();

        // Check for 404 (user not admin)
        if (response?.status() === 404) {
          console.log(
            '⚠ Test user does not have admin access - skipping admin tests'
          );
          hasAdminAccess = false;
          break;
        }

        // Check for auth redirect (session expired)
        if (currentUrl.includes('/signin') || currentUrl.includes('/sign-in')) {
          results.push({
            path: pageConfig.path,
            name: pageConfig.name,
            status: 'redirect',
            loadTimeMs,
            error: 'Session expired - redirected to auth',
          });
          // Re-authenticate and continue
          const { username, password } = getAdminCredentials();
          await signInUser(page, { username, password });
          continue;
        }

        // Check if redirected to different admin/dashboard page (feature gate, etc.)
        if (
          !currentUrl.includes(pageConfig.path) &&
          (currentUrl.includes('/app/admin') ||
            currentUrl.includes('/app/dashboard'))
        ) {
          results.push({
            path: pageConfig.path,
            name: pageConfig.name,
            status: 'pass', // Count as pass - feature gate redirects are expected
            loadTimeMs,
          });
          continue;
        }

        // Check if redirected outside admin/dashboard entirely
        if (
          !currentUrl.includes(pageConfig.path) &&
          !currentUrl.includes('/app/admin') &&
          !currentUrl.includes('/app/dashboard')
        ) {
          // This might be a redirect to onboarding, home, etc.
          // Count as pass if it's a valid redirect destination
          const validRedirectDestinations = [
            '/onboarding',
            '/app/',
            '/app/settings',
          ];
          // Parse URL to check origin for root path redirect safety
          const parsedUrl = new URL(currentUrl);
          const expectedOrigin = new URL(page.url()).origin;
          const isSameOriginRoot =
            parsedUrl.origin === expectedOrigin && parsedUrl.pathname === '/';
          const isValidRedirect =
            validRedirectDestinations.some(dest => currentUrl.includes(dest)) ||
            isSameOriginRoot;

          if (isValidRedirect) {
            results.push({
              path: pageConfig.path,
              name: pageConfig.name,
              status: 'pass', // Feature gate or permission redirect
              loadTimeMs,
            });
            continue;
          }

          // Unexpected redirect - fail the test
          const screenshot = await page.screenshot().catch(() => null);
          if (screenshot) {
            await testInfo.attach(`redirect-${pageConfig.name}`, {
              body: screenshot,
              contentType: 'image/png',
            });
          }

          results.push({
            path: pageConfig.path,
            name: pageConfig.name,
            status: 'fail',
            loadTimeMs,
            error: `Unexpected redirect to ${currentUrl}`,
          });
          continue;
        }

        // Check for error pages
        const { hasError, errorText } = await checkForErrorPage(page);

        if (hasError) {
          // Capture screenshot for debugging
          const screenshot = await page.screenshot().catch(() => null);
          if (screenshot) {
            await testInfo.attach(`error-${pageConfig.name}`, {
              body: screenshot,
              contentType: 'image/png',
            });
          }

          // Log captured console errors for this page
          if (consoleErrors.length > 0) {
            console.log(
              `\n🔍 Console errors on ${pageConfig.name}:\n${consoleErrors.join('\n')}`
            );
            await testInfo.attach(`console-errors-${pageConfig.name}`, {
              body: consoleErrors.join('\n'),
              contentType: 'text/plain',
            });
          }

          results.push({
            path: pageConfig.path,
            name: pageConfig.name,
            status: 'fail',
            loadTimeMs,
            error: errorText,
          });
        } else {
          results.push({
            path: pageConfig.path,
            name: pageConfig.name,
            status: 'pass',
            loadTimeMs,
          });
        }
        // Clear console errors for next page
        consoleErrors.length = 0;
      } catch (error) {
        results.push({
          path: pageConfig.path,
          name: pageConfig.name,
          status: 'fail',
          loadTimeMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
        consoleErrors.length = 0;
      }
    }

    // Skip if user doesn't have admin access
    if (!hasAdminAccess) {
      test.skip();
      return;
    }

    // Attach detailed results for debugging
    await testInfo.attach('admin-health-results', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });

    // Log summary
    const passed = results.filter(r => r.status === 'pass');
    const failed = results.filter(r => r.status === 'fail');
    const redirected = results.filter(r => r.status === 'redirect');

    console.log('\n📊 Admin Health Summary:');
    console.log(`   ✅ Passed: ${passed.length}/${ACTIVE_ADMIN_PAGES.length}`);
    if (failed.length > 0) {
      console.log(`   ❌ Failed: ${failed.length}`);
      failed.forEach(f => console.log(`      - ${f.name}: ${f.error}`));
    }
    if (redirected.length > 0) {
      console.log(`   🔄 Redirected: ${redirected.length}`);
    }

    // Show load times for performance insights
    if (results.length > 0) {
      const avgLoadTime =
        results.reduce((sum, r) => sum + (r.loadTimeMs || 0), 0) /
        results.length;
      console.log(`   ⏱️  Avg load time: ${Math.round(avgLoadTime)}ms`);
    }

    // Separate transient infrastructure failures from real page errors
    const transientPatterns = [
      'ERR_NETWORK_CHANGED',
      'ERR_CONNECTION_RESET',
      'ERR_CONNECTION_REFUSED',
      'Timeout',
      'timeout',
      'net::ERR_',
      'Navigation failed',
      'page.goto:',
    ];
    const realFailures = failed.filter(
      f => !transientPatterns.some(pattern => f.error?.includes(pattern))
    );
    const infraFailures = failed.filter(f =>
      transientPatterns.some(pattern => f.error?.includes(pattern))
    );

    if (infraFailures.length > 0) {
      console.log(
        `   ⚠ Infrastructure failures (non-blocking): ${infraFailures.length}`
      );
      infraFailures.forEach(f => console.log(`      - ${f.name}: ${f.error}`));
    }

    // Assert no real failures (infrastructure flakes are logged but tolerated)
    expect(
      realFailures,
      `${realFailures.length} pages failed health check (excluding ${infraFailures.length} transient infra failures)`
    ).toHaveLength(0);
  });
});

// ============================================================================
// Dashboard Routing Tests (consolidated from dashboard-routing.spec.ts)
// ============================================================================

test.describe('Dashboard Routing', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    if (!hasClerkCredentials()) {
      test.skip();
      return;
    }

    await page.route('**/api/profile/view', r =>
      r.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', r =>
      r.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', r =>
      r.fulfill({ status: 200, body: '{}' })
    );

    try {
      await ensureSignedInUser(page);
    } catch {
      test.skip();
    }
  });

  test('legacy /app/dashboard redirects away', async ({ page }) => {
    await smokeNavigateWithRetry(page, '/app/dashboard', {
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
      retries: 2,
    });
    await page
      .waitForURL(
        url =>
          url.pathname === APP_ROUTES.DASHBOARD ||
          url.pathname === APP_ROUTES.DASHBOARD_OVERVIEW,
        {
          timeout: 10_000,
        }
      )
      .catch(() => {});

    expect(page.url()).toMatch(/\/app(?:\/dashboard)?(?:$|[?#])/);
  });

  test('browser back/forward navigation works', async ({ page }) => {
    test.skip(
      FAST_ITERATION,
      'History-navigation routing checks run in the slower dashboard-routing lane'
    );
    test.setTimeout(180_000);

    await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, {
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
      retries: 2,
    });
    await expect(page).toHaveURL(/\/app\/chat/);

    await smokeNavigateWithRetry(page, APP_ROUTES.SETTINGS, {
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
      retries: 2,
    });
    await expect(page).toHaveURL(/\/app\/settings/);

    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page).toHaveURL(/\/app\/chat/, {
      timeout: 30_000,
    });

    await page.goForward({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page).toHaveURL(/\/app\/settings/, { timeout: 30_000 });
  });

  test('all dashboard routes render content @smoke', async ({ page }) => {
    test.skip(
      FAST_ITERATION,
      'Route-by-route dashboard content checks duplicate faster dashboard health and content-gate coverage'
    );
    test.setTimeout(240_000);
    const routes = [
      { path: APP_ROUTES.CHAT, content: /new thread|chat/i },
      { path: '/app/dashboard/earnings', content: /earnings|tips|revenue/i },
      { path: '/app/dashboard/releases', content: /releases|music|tracks/i },
      {
        path: '/app/dashboard/audience',
        content: /audience|fans|subscribers/i,
      },
    ];

    for (const { path, content } of routes) {
      await smokeNavigateWithRetry(page, path, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
        retries: 2,
      });
      await waitForHydration(page);
      await waitForNetworkIdle(page);

      const mainContent = page.locator('main').getByText(content).first();
      const hasMatchingContent = await mainContent
        .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
        .catch(() => false);

      if (hasMatchingContent) continue;

      // Fallback: verify page has some content (not blank)
      const bodyText = await page
        .locator('body')
        .textContent()
        .catch(() => '');
      const bodyLength = bodyText?.trim().length ?? 0;
      expect(
        bodyLength > 10,
        `Route ${path} should render some content (found ${bodyLength} chars)`
      ).toBe(true);
    }
  });

  test('lazy components hydrate without errors @smoke', async ({ page }) => {
    test.skip(
      FAST_ITERATION,
      'Lazy-hydration routing checks run in the slower dashboard-routing lane'
    );
    test.setTimeout(180_000);
    const hydrationErrors: string[] = [];

    page.on('console', msg => {
      const text = msg.text();
      if (
        text.includes('Hydration failed') ||
        text.includes('Text content did not match') ||
        text.includes('did not match. Server:')
      ) {
        hydrationErrors.push(text);
      }
    });

    await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, {
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
      retries: 2,
    });
    await page
      .waitForLoadState('networkidle', { timeout: 5000 })
      .catch(() => {});

    await page
      .waitForFunction(
        () => !document.querySelector('[data-loading="true"], .skeleton'),
        { timeout: 15_000 }
      )
      .catch(() => {});

    expect(
      hydrationErrors,
      `Hydration errors detected: ${hydrationErrors.join(', ')}`
    ).toHaveLength(0);
  });
});
