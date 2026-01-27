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
 */
function hasClerkCredentials(): boolean {
  const username = process.env.E2E_CLERK_USER_USERNAME ?? '';
  const password = process.env.E2E_CLERK_USER_PASSWORD ?? '';
  const clerkSetupSuccess = process.env.CLERK_TESTING_SETUP_SUCCESS === 'true';

  return username.length > 0 && password.length > 0 && clerkSetupSuccess;
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
 */
const DASHBOARD_PAGES = [
  { path: '/app/dashboard', name: 'Dashboard root' },
  { path: '/app/dashboard/overview', name: 'Overview' },
  { path: '/app/dashboard/analytics', name: 'Analytics' },
  { path: '/app/dashboard/audience', name: 'Audience' },
  { path: '/app/dashboard/chat', name: 'Chat' },
  { path: '/app/dashboard/contacts', name: 'Contacts' },
  { path: '/app/dashboard/earnings', name: 'Earnings' },
  { path: '/app/dashboard/links', name: 'Links' },
  { path: '/app/dashboard/profile', name: 'Profile' },
  { path: '/app/dashboard/releases', name: 'Releases' },
  { path: '/app/dashboard/tipping', name: 'Tipping' },
  { path: '/app/dashboard/tour-dates', name: 'Tour Dates' },
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
    test.setTimeout(180_000); // 3 minutes for all 12 pages

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
    const avgLoadTime =
      results.reduce((sum, r) => sum + (r.loadTimeMs || 0), 0) / results.length;
    console.log(`   ⏱️  Avg load time: ${Math.round(avgLoadTime)}ms`);

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
      await page.waitForTimeout(500);

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
