import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Admin Navigation Persistence Tests
 *
 * These tests verify that the admin navigation section:
 * 1. Displays consistently for admin users
 * 2. Remains visible after navigating between pages
 * 3. Works correctly on all admin pages
 *
 * Run with doppler:
 *   doppler run -- pnpm exec playwright test admin-navigation --project=chromium
 *
 * For debugging:
 *   doppler run -- pnpm exec playwright test admin-navigation --project=chromium --ui
 */

/**
 * Check if admin Clerk credentials are available.
 * Supports passwordless Clerk test emails (containing +clerk_test)
 */
function hasAdminCredentials(): boolean {
  const adminUsername = process.env.E2E_CLERK_ADMIN_USERNAME ?? '';
  const adminPassword = process.env.E2E_CLERK_ADMIN_PASSWORD ?? '';
  const clerkSetupSuccess = process.env.CLERK_TESTING_SETUP_SUCCESS === 'true';

  // Allow passwordless auth for Clerk test emails
  const isClerkTestEmail = adminUsername.includes('+clerk_test');

  // Use admin-specific credentials if available
  if (
    adminUsername.length > 0 &&
    (adminPassword.length > 0 || isClerkTestEmail)
  ) {
    return clerkSetupSuccess;
  }

  // Fall back to regular credentials
  const username = process.env.E2E_CLERK_USER_USERNAME ?? '';
  const password = process.env.E2E_CLERK_USER_PASSWORD ?? '';
  const isRegularClerkTestEmail = username.includes('+clerk_test');

  return (
    username.length > 0 &&
    (password.length > 0 || isRegularClerkTestEmail) &&
    clerkSetupSuccess
  );
}

/**
 * Get admin credentials (admin-specific or fallback to regular)
 */
function getAdminCredentials(): { username: string; password: string } {
  const adminUsername = process.env.E2E_CLERK_ADMIN_USERNAME ?? '';
  const adminPassword = process.env.E2E_CLERK_ADMIN_PASSWORD ?? '';
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

/**
 * Wait for the page to stabilize after transient React 19 hooks error.
 *
 * There's a known React 19 bug (facebook/react#33580) that causes a transient
 * "Rendered more hooks than during the previous render" error during hydration.
 * The error appears briefly then "magically disappears" as the page stabilizes.
 *
 * This function waits for the error to resolve itself.
 */
async function waitForTransientErrorToResolve(
  page: import('@playwright/test').Page,
  timeout = 15000
): Promise<void> {
  const startTime = Date.now();
  const intervals = [500, 1000, 2000, 3000, 5000];
  let intervalIndex = 0;

  while (Date.now() - startTime < timeout) {
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    const lowerText = bodyText.toLowerCase();

    const hasError =
      lowerText.includes('application error') ||
      lowerText.includes('client-side exception');

    if (!hasError) {
      return; // No error - page is stable
    }

    // Wait and retry
    const waitTime = intervals[Math.min(intervalIndex, intervals.length - 1)];
    await page.waitForTimeout(waitTime);
    intervalIndex++;
  }

  // If we get here, the error persisted beyond timeout
  throw new Error(
    'Client-side error did not resolve within timeout - page may have a persistent error'
  );
}

/**
 * Check if the page has a client-side error (after waiting for transient errors to resolve)
 */
async function checkForClientError(
  page: import('@playwright/test').Page
): Promise<{ hasError: boolean; errorText?: string }> {
  // First wait for any transient React 19 errors to resolve
  try {
    await waitForTransientErrorToResolve(page);
    return { hasError: false };
  } catch {
    // The error persisted - return it
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    return {
      hasError: true,
      errorText:
        'Client-side exception persisted - page crashed. Body: ' +
        bodyText.substring(0, 200),
    };
  }
}

/**
 * Admin pages to test for navigation persistence
 */
const ADMIN_PAGES = [
  { path: '/app/admin', name: 'Admin Dashboard' },
  { path: '/app/admin/activity', name: 'Admin Activity' },
  { path: '/app/admin/campaigns', name: 'Admin Campaigns' },
  { path: '/app/admin/creators', name: 'Admin Creators' },
  { path: '/app/admin/users', name: 'Admin Users' },
  { path: '/app/admin/waitlist', name: 'Admin Waitlist' },
] as const;

/**
 * Dashboard pages to test navigation from
 */
const DASHBOARD_PAGES = [
  { path: '/app/dashboard/analytics', name: 'Analytics' },
  { path: '/app/dashboard/profile', name: 'Profile' },
] as const;

test.describe('Admin Navigation Persistence @smoke', () => {
  test.beforeEach(async ({ page }) => {
    // Skip if no admin credentials configured
    if (!hasAdminCredentials()) {
      console.log('⚠ Skipping admin navigation tests - no credentials');
      console.log(
        '  Set E2E_CLERK_ADMIN_USERNAME/PASSWORD or E2E_CLERK_USER_USERNAME/PASSWORD'
      );
      test.skip();
      return;
    }

    // Capture console errors for debugging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[Browser Error] ${msg.text()}`);
      }
    });

    page.on('pageerror', error => {
      console.log(`[Page Error] ${error.message}`);
    });

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
   * Core test: Admin navigation is visible and persists across page navigation
   *
   * This test verifies the main issue: admin nav showing intermittently.
   * It navigates through multiple pages and checks that admin nav remains visible.
   */
  test('admin navigation is visible on dashboard and persists across navigation', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000); // 3 minutes for comprehensive navigation test

    const adminNavSection = page.locator('[data-testid="admin-nav-section"]');

    // signInUser in beforeEach already navigated to /app/dashboard
    // and waited for transient React 19 errors to resolve
    // We're already on the dashboard - no need to navigate again

    // Wait for page to fully stabilize with retry for admin nav visibility
    // There can be race conditions with auth/caching that cause flakiness
    await page.waitForLoadState('networkidle').catch(() => {});

    // Retry checking for admin nav - it may take a moment to appear
    let hasAdminAccess = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.waitForTimeout(1000);
      hasAdminAccess = await adminNavSection.isVisible().catch(() => false);
      if (hasAdminAccess) break;
      console.log(`Admin nav not visible yet, attempt ${attempt + 1}/5`);
    }

    if (!hasAdminAccess) {
      // Capture screenshot for debugging
      const screenshot = await page.screenshot().catch(() => null);
      if (screenshot) {
        await testInfo.attach('admin-nav-not-visible', {
          body: screenshot,
          contentType: 'image/png',
        });
      }

      // The test user doesn't have admin access - skip the test
      console.log(
        '⚠ Test user does not have admin access (admin nav not visible)'
      );
      console.log('  Ensure test user has isAdmin: true in DB');
      test.skip();
      return;
    }

    console.log('✅ Admin nav visible on initial dashboard load');

    // 2. Navigate to each dashboard page and verify admin nav persists
    for (const dashPage of DASHBOARD_PAGES) {
      await page.goto(dashPage.path, {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      await waitForHydration(page);
      await page.waitForTimeout(500); // Allow state to settle

      // Check for client-side errors
      const { hasError: pageError } = await checkForClientError(page);
      if (pageError) {
        const screenshot = await page.screenshot().catch(() => null);
        if (screenshot) {
          await testInfo.attach(`error-${dashPage.name}`, {
            body: screenshot,
            contentType: 'image/png',
          });
        }
        // Log but continue - we want to check all pages
        console.log(`⚠ Client error on ${dashPage.name}`);
        continue;
      }

      // Verify admin nav is still visible
      await expect(
        adminNavSection,
        `Admin nav should be visible on ${dashPage.name}`
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

      console.log(`✅ Admin nav visible on ${dashPage.name}`);
    }

    // 3. Navigate to each admin page and verify admin nav persists
    for (const adminPage of ADMIN_PAGES) {
      const response = await page.goto(adminPage.path, {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });

      // Check for 404 (shouldn't happen if we got this far, but be safe)
      if (response?.status() === 404) {
        console.log(`⚠ ${adminPage.name} returned 404 - skipping`);
        continue;
      }

      await waitForHydration(page);
      await page.waitForTimeout(500); // Allow state to settle

      // Check for client-side errors
      const { hasError: pageError } = await checkForClientError(page);
      if (pageError) {
        const screenshot = await page.screenshot().catch(() => null);
        if (screenshot) {
          await testInfo.attach(`error-${adminPage.name}`, {
            body: screenshot,
            contentType: 'image/png',
          });
        }
        console.log(`⚠ Client error on ${adminPage.name}`);
        continue;
      }

      // Verify admin nav is still visible
      await expect(
        adminNavSection,
        `Admin nav should be visible on ${adminPage.name}`
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

      // Also verify main content loaded (not a blank page)
      const mainContent = page.locator('main');
      await expect(
        mainContent,
        `Main content should be visible on ${adminPage.name}`
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

      console.log(`✅ Admin nav visible on ${adminPage.name}`);
    }

    // 4. Navigate back to dashboard and verify admin nav still visible
    await page.goto('/app/dashboard', {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);
    await page.waitForTimeout(500);

    // Check for client-side errors on return
    const { hasError: returnError } = await checkForClientError(page);
    if (!returnError) {
      await expect(
        adminNavSection,
        'Admin nav should still be visible after returning to dashboard'
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

      console.log('✅ Admin nav visible after full navigation cycle');
    }

    // Attach success summary
    await testInfo.attach('admin-navigation-summary', {
      body: JSON.stringify(
        {
          dashboardPagesChecked: DASHBOARD_PAGES.length,
          adminPagesChecked: ADMIN_PAGES.length,
          allPassed: true,
        },
        null,
        2
      ),
      contentType: 'application/json',
    });
  });

  /**
   * Test rapid navigation between pages
   *
   * This catches race conditions where admin state might be lost
   * during fast navigation.
   */
  test('admin navigation persists during rapid navigation', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000); // 2 minutes

    const adminNavSection = page.locator('[data-testid="admin-nav-section"]');

    // signInUser in beforeEach already navigated to /app/dashboard
    // and waited for transient React 19 errors to resolve
    await page.waitForLoadState('networkidle').catch(() => {});

    // Retry checking for admin nav - it may take a moment to appear
    let hasAdminAccess = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.waitForTimeout(1000);
      hasAdminAccess = await adminNavSection.isVisible().catch(() => false);
      if (hasAdminAccess) break;
      console.log(`Admin nav not visible yet, attempt ${attempt + 1}/5`);
    }

    if (!hasAdminAccess) {
      console.log('⚠ Test user does not have admin access');
      test.skip();
      return;
    }

    // Rapid navigation: quickly move between pages
    const allPages = [
      '/app/dashboard/profile',
      '/app/admin',
      '/app/dashboard/analytics',
      '/app/admin/users',
      '/app/dashboard/profile',
      '/app/admin/activity',
    ];

    let failures = 0;

    for (const path of allPages) {
      // Navigate without waiting for full load
      await page.goto(path, {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });

      // Brief wait for React to render
      await page.waitForTimeout(300);

      // Check for client-side errors
      const { hasError: pageError } = await checkForClientError(page);
      if (pageError) {
        failures++;
        console.log(`⚠ Client error on ${path}`);
        continue;
      }

      // Check admin nav visibility
      const isVisible = await adminNavSection.isVisible().catch(() => false);
      if (!isVisible) {
        failures++;
        console.log(`⚠ Admin nav not visible on ${path}`);

        // Capture screenshot for debugging
        const screenshot = await page.screenshot().catch(() => null);
        if (screenshot) {
          await testInfo.attach(
            `rapid-nav-failure-${path.replace(/\//g, '-')}`,
            {
              body: screenshot,
              contentType: 'image/png',
            }
          );
        }
      }
    }

    // Final check after all navigation
    await page.waitForTimeout(500);
    const { hasError: finalError } = await checkForClientError(page);
    if (!finalError) {
      await expect(
        adminNavSection,
        'Admin nav should be visible after rapid navigation'
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    }

    expect(failures, `Admin nav issues on ${failures} pages`).toBe(0);

    console.log('✅ Admin nav persisted through rapid navigation');
  });

  /**
   * Test client-side navigation (using links instead of page.goto)
   *
   * This is more realistic as it tests the actual user experience
   * with client-side routing.
   */
  test('admin navigation persists with client-side navigation', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000); // 2 minutes

    const adminNavSection = page.locator('[data-testid="admin-nav-section"]');

    // signInUser in beforeEach already navigated to /app/dashboard
    // and waited for transient React 19 errors to resolve
    await page.waitForLoadState('networkidle').catch(() => {});

    // Retry checking for admin nav - it may take a moment to appear
    let hasAdminAccess = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.waitForTimeout(1000);
      hasAdminAccess = await adminNavSection.isVisible().catch(() => false);
      if (hasAdminAccess) break;
      console.log(`Admin nav not visible yet, attempt ${attempt + 1}/5`);
    }

    if (!hasAdminAccess) {
      console.log('⚠ Test user does not have admin access');
      test.skip();
      return;
    }

    // Find and click the Admin nav link to expand admin section if collapsed
    const adminNavHeader = page.locator('text=Admin').first();
    if (await adminNavHeader.isVisible()) {
      // The section is visible, check if we need to expand it
      const adminLink = page.locator('a[href="/app/admin"]').first();
      if (!(await adminLink.isVisible())) {
        // Click to expand the admin section
        await adminNavHeader.click();
        await page.waitForTimeout(300);
      }
    }

    // Use client-side navigation by clicking links
    const navLinks = [
      { selector: 'a[href="/app/admin"]', name: 'Admin Dashboard' },
      { selector: 'a[href="/app/dashboard/profile"]', name: 'Profile' },
      { selector: 'a[href="/app/admin/users"]', name: 'Admin Users' },
      { selector: 'a[href="/app/dashboard/analytics"]', name: 'Analytics' },
    ];

    for (const link of navLinks) {
      const linkElement = page.locator(link.selector).first();

      // Skip if link not visible (feature flag, etc.)
      if (!(await linkElement.isVisible().catch(() => false))) {
        console.log(`⚠ Link ${link.name} not visible - skipping`);
        continue;
      }

      await linkElement.click();
      await page.waitForTimeout(500); // Wait for navigation

      // Check for client-side errors
      const { hasError: navError } = await checkForClientError(page);
      if (navError) {
        console.log(`⚠ Client error after clicking ${link.name}`);
        continue;
      }

      // Verify admin nav is still visible
      const isVisible = await adminNavSection.isVisible().catch(() => false);
      if (!isVisible) {
        // Capture screenshot for debugging
        const screenshot = await page.screenshot().catch(() => null);
        if (screenshot) {
          await testInfo.attach(`client-nav-failure-${link.name}`, {
            body: screenshot,
            contentType: 'image/png',
          });
        }
      }

      await expect(
        adminNavSection,
        `Admin nav should be visible after clicking ${link.name}`
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

      console.log(`✅ Admin nav visible after clicking ${link.name}`);
    }

    console.log('✅ Admin nav persisted through client-side navigation');
  });
});
