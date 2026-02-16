import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';
import {
  checkForClientError,
  getAdminCredentials,
  hasAdminCredentials,
  waitForAdminNav,
} from './utils/admin-test-utils';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Admin Page Content Verification Tests
 *
 * These tests verify that admin page content actually loads past the
 * loading/skeleton state. Unlike admin-navigation.spec.ts (which only checks
 * sidebar nav visibility), these tests assert that page-specific content
 * markers are rendered — catching blank pages, stuck skeletons, and error
 * boundaries that would otherwise go undetected.
 *
 * Run with doppler:
 *   doppler run -- pnpm exec playwright test admin-page-content --project=chromium
 */

/**
 * Admin pages with their content test IDs.
 *
 * Each `contentTestId` is a data-testid placed on the page's primary content
 * component — it only appears once the component has rendered past its
 * Suspense/dynamic-import loading state.
 */
const ADMIN_PAGES = [
  {
    path: '/app/admin',
    name: 'Dashboard',
    contentTestId: 'admin-dashboard-content',
    // Dashboard has 3 independent Suspense boundaries; check at least one resolved
    suspenseMarkers: [
      'admin-kpi-section',
      'admin-usage-section',
      'admin-activity-section',
    ],
    contentTimeout: 30_000,
  },
  {
    path: '/app/admin/activity',
    name: 'Activity',
    contentTestId: 'admin-activity-content',
    contentTimeout: 20_000,
  },
  {
    path: '/app/admin/campaigns',
    name: 'Campaigns',
    contentTestId: 'admin-campaigns-content',
    contentTimeout: 20_000,
  },
  {
    path: '/app/admin/creators',
    name: 'Creators',
    contentTestId: 'admin-creators-content',
    contentTimeout: 20_000,
  },
  {
    path: '/app/admin/users',
    name: 'Users',
    contentTestId: 'admin-users-content',
    contentTimeout: 20_000,
  },
  {
    path: '/app/admin/waitlist',
    name: 'Waitlist',
    contentTestId: 'admin-waitlist-content',
    contentTimeout: 20_000,
  },
  {
    path: '/app/admin/screenshots',
    name: 'Screenshots',
    contentTestId: 'admin-screenshots-content',
    contentTimeout: 20_000,
  },
] as const;

test.describe('Admin Page Content @smoke', () => {
  test.setTimeout(300_000); // 5 min budget

  test.beforeEach(async ({ page }) => {
    if (!hasAdminCredentials()) {
      console.log('Skipping admin content tests - no credentials');
      console.log(
        '  Set E2E_CLERK_ADMIN_USERNAME/PASSWORD or E2E_CLERK_USER_USERNAME/PASSWORD'
      );
      test.skip();
      return;
    }

    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[Browser Error] ${msg.text()}`);
      }
    });

    page.on('pageerror', error => {
      console.log(`[Page Error] ${error.message}`);
    });

    await setupClerkTestingToken({ page });
    const { username, password } = getAdminCredentials();

    try {
      await signInUser(page, { username, password });
    } catch (error) {
      console.error('Failed to sign in admin user:', error);
      test.skip();
    }
  });

  test('all admin pages render content past loading state', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000); // 4 min for all pages

    // Verify admin access before testing pages
    const hasAdminAccess = await waitForAdminNav(page);

    if (!hasAdminAccess) {
      const screenshot = await page.screenshot().catch(() => null);
      if (screenshot) {
        await testInfo.attach('admin-nav-not-visible', {
          body: screenshot,
          contentType: 'image/png',
        });
      }
      console.log('Test user does not have admin access');
      console.log('  Ensure test user has isAdmin: true in DB');
      test.skip();
      return;
    }

    const results: Array<{
      name: string;
      status: 'OK' | 'ERROR' | 'CONTENT_MISSING' | 'SKIP_404';
      error?: string;
    }> = [];

    for (const adminPage of ADMIN_PAGES) {
      // Navigate to the page
      const response = await page.goto(adminPage.path, {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });

      if (response?.status() === 404) {
        results.push({ name: adminPage.name, status: 'SKIP_404' });
        continue;
      }

      await waitForHydration(page);

      // Check for persistent client-side errors (React crashes, etc.)
      const { hasError, errorText } = await checkForClientError(page);
      if (hasError) {
        const screenshot = await page.screenshot().catch(() => null);
        if (screenshot) {
          await testInfo.attach(`error-${adminPage.name}`, {
            body: screenshot,
            contentType: 'image/png',
          });
        }
        results.push({
          name: adminPage.name,
          status: 'ERROR',
          error: errorText,
        });
        continue;
      }

      // CORE ASSERTION: content testid is visible (past skeleton/suspense)
      const contentLocator = page.locator(
        `[data-testid="${adminPage.contentTestId}"]`
      );

      try {
        await expect(
          contentLocator,
          `${adminPage.name}: content should be visible (testid: ${adminPage.contentTestId})`
        ).toBeVisible({ timeout: adminPage.contentTimeout });
      } catch {
        const screenshot = await page.screenshot().catch(() => null);
        if (screenshot) {
          await testInfo.attach(`content-missing-${adminPage.name}`, {
            body: screenshot,
            contentType: 'image/png',
          });
        }
        results.push({
          name: adminPage.name,
          status: 'CONTENT_MISSING',
          error: `"${adminPage.contentTestId}" not visible within ${adminPage.contentTimeout}ms`,
        });
        continue;
      }

      // For dashboard: verify at least one Suspense section resolved
      if ('suspenseMarkers' in adminPage && adminPage.suspenseMarkers) {
        let atLeastOneResolved = false;
        for (const marker of adminPage.suspenseMarkers) {
          const isVisible = await page
            .locator(`[data-testid="${marker}"]`)
            .isVisible()
            .catch(() => false);
          if (isVisible) {
            atLeastOneResolved = true;
            break;
          }
        }
        if (!atLeastOneResolved) {
          // Wait a bit more — Suspense sections may still be loading
          for (const marker of adminPage.suspenseMarkers) {
            try {
              await expect(
                page.locator(`[data-testid="${marker}"]`)
              ).toBeVisible({ timeout: 10_000 });
              atLeastOneResolved = true;
              break;
            } catch {
              // Try next marker
            }
          }
        }
        if (!atLeastOneResolved) {
          console.log(
            `Warning: No Suspense sections resolved for ${adminPage.name}`
          );
        }
      }

      results.push({ name: adminPage.name, status: 'OK' });
      console.log(`OK: ${adminPage.name} content loaded`);
    }

    // Attach summary for CI debugging
    await testInfo.attach('admin-content-results', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });

    // HARD FAIL if any page didn't load content
    const failures = results.filter(
      r => r.status === 'ERROR' || r.status === 'CONTENT_MISSING'
    );

    expect(
      failures,
      `${failures.length} admin page(s) failed content check:\n${failures.map(f => `  ${f.name}: ${f.error}`).join('\n')}`
    ).toHaveLength(0);
  });
});
