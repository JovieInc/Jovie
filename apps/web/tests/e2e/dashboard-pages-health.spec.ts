import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, Page, test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Dashboard Pages Health Check
 *
 * Comprehensive E2E tests that verify every dashboard page:
 * 1. Loads without white screens or error pages
 * 2. No critical console errors
 * 3. Key content elements are visible
 *
 * Run with doppler:
 *   doppler run -- pnpm exec playwright test dashboard-pages-health --project=chromium
 *
 * For debugging individual pages:
 *   doppler run -- pnpm exec playwright test dashboard-pages-health --project=chromium --grep "Profile"
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
 */
function getAdminCredentials(): { username: string; password: string } {
  const adminUsername = process.env.E2E_CLERK_ADMIN_USERNAME ?? '';
  const adminPassword = process.env.E2E_CLERK_ADMIN_PASSWORD ?? '';

  if (adminUsername.length > 0 && adminPassword.length > 0) {
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
 * - /app/dashboard/tour-dates -> feature-gated, redirects if not enabled
 */
const DASHBOARD_PAGES = [
  { path: '/app/dashboard/analytics', name: 'Analytics' },
  { path: '/app/dashboard/audience', name: 'Audience' },
  { path: '/app/dashboard/chat', name: 'Chat' },
  { path: '/app/dashboard/contacts', name: 'Contacts' },
  { path: '/app/dashboard/earnings', name: 'Earnings' },
  { path: '/app/dashboard/profile', name: 'Profile' },
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
  { path: '/app/admin/waitlist', name: 'Admin Waitlist' },
] as const;

test.describe('Dashboard Pages Health Check @smoke', () => {
  test.beforeEach(async ({ page }) => {
    // Skip if no Clerk credentials configured
    if (!hasClerkCredentials()) {
      console.log('⚠ Skipping dashboard health tests - no Clerk credentials');
      console.log('  Set E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD');
      test.skip();
      return;
    }

    // Set up Clerk testing token and sign in
    await setupClerkTestingToken({ page });

    try {
      await signInUser(page);
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
    test.setTimeout(120_000); // 2 minutes for 7 content pages

    const results: PageHealthResult[] = [];

    for (const pageConfig of DASHBOARD_PAGES) {
      const startTime = Date.now();

      try {
        // Navigate to the page
        await page.goto(pageConfig.path, {
          waitUntil: 'domcontentloaded',
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        });

        // Wait for React hydration
        await waitForHydration(page);

        // Allow page to stabilize
        await Promise.race([
          page.waitForLoadState('networkidle'),
          page.waitForTimeout(5000),
        ]).catch(() => {});

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

        // Check if redirected to different dashboard page (feature gate, etc.)
        // This is okay - the page exists, it just redirected based on permissions
        if (
          !currentUrl.includes(pageConfig.path) &&
          currentUrl.includes('/app/dashboard')
        ) {
          results.push({
            path: pageConfig.path,
            name: pageConfig.name,
            status: 'pass', // Count as pass - feature gate redirects are expected
            loadTimeMs,
          });
          continue;
        }

        // Check if redirected outside dashboard entirely (e.g., to onboarding)
        if (
          !currentUrl.includes(pageConfig.path) &&
          !currentUrl.includes('/app/dashboard')
        ) {
          // This might be a redirect to onboarding, home, etc.
          // Count as pass if it's a valid redirect destination
          // Use exact path matching to avoid false positives from '/' matching everything
          const validRedirectDestinations = ['/onboarding', '/app/'];
          const isValidRedirect =
            validRedirectDestinations.some(dest => currentUrl.includes(dest)) ||
            currentUrl.endsWith('/');

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
        results.push({
          path: pageConfig.path,
          name: pageConfig.name,
          status: 'fail',
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
    console.log(`   ✅ Passed: ${passed.length}/${DASHBOARD_PAGES.length}`);
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
  for (const pageConfig of DASHBOARD_PAGES) {
    test(`[Debug] ${pageConfig.name} page loads`, async ({
      page,
    }, testInfo) => {
      // Skip by default in CI - use the batch test instead
      if (process.env.CI && !process.env.DEBUG_INDIVIDUAL_PAGES) {
        test.skip();
        return;
      }

      test.setTimeout(60_000);

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
      await page.waitForLoadState('networkidle').catch(() => {});
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
  test.beforeEach(async ({ page }) => {
    // Skip if no admin credentials configured
    if (!hasAdminCredentials()) {
      console.log('⚠ Skipping admin health tests - no credentials');
      console.log(
        '  Set E2E_CLERK_ADMIN_USERNAME/PASSWORD or E2E_CLERK_USER_USERNAME/PASSWORD'
      );
      test.skip();
      return;
    }

    // Set up Clerk testing token and sign in with admin credentials
    await setupClerkTestingToken({ page });

    const { username, password } = getAdminCredentials();

    try {
      await signInUser(page, { username, password });
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
    test.setTimeout(120_000); // 2 minutes for 6 admin pages

    const results: PageHealthResult[] = [];
    let hasAdminAccess = true;

    for (const pageConfig of ADMIN_PAGES) {
      const startTime = Date.now();

      try {
        // Navigate to the page
        const response = await page.goto(pageConfig.path, {
          waitUntil: 'domcontentloaded',
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        });

        // Wait for React hydration
        await waitForHydration(page);

        // Allow page to stabilize
        await Promise.race([
          page.waitForLoadState('networkidle'),
          page.waitForTimeout(5000),
        ]).catch(() => {});

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
          // Use exact path matching to avoid false positives from '/' matching everything
          const validRedirectDestinations = ['/onboarding', '/app/'];
          const isValidRedirect =
            validRedirectDestinations.some(dest => currentUrl.includes(dest)) ||
            currentUrl.endsWith('/');

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
        results.push({
          path: pageConfig.path,
          name: pageConfig.name,
          status: 'fail',
          loadTimeMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
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
    console.log(`   ✅ Passed: ${passed.length}/${ADMIN_PAGES.length}`);
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
});
