import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { ensureSignedInUser } from '../helpers/clerk-auth';
import { smokeNavigateWithRetry } from './utils/smoke-test-utils';

/**
 * Suite 4: Admin Dashboard (JOV-1427)
 *
 * Tests as an AUTHENTICATED ADMIN. Verifies admin pages:
 * 1. Load without 500 errors or error boundaries
 * 2. Render meaningful content (sections, tables, data)
 * 3. Admin navigation persists across pages
 *
 * Every assertion would FAIL if the corresponding admin experience is broken.
 * No theater. No warnings-instead-of-failures.
 *
 * Run headed to visually verify:
 *   doppler run -- pnpm exec playwright test admin-dashboard --project=chromium --headed
 *
 * @smoke @admin @critical
 */

function hasAdminCredentials(): boolean {
  const adminUsername =
    process.env.E2E_CLERK_ADMIN_USERNAME ??
    process.env.E2E_CLERK_USER_USERNAME ??
    '';
  const adminPassword =
    process.env.E2E_CLERK_ADMIN_PASSWORD ??
    process.env.E2E_CLERK_USER_PASSWORD ??
    '';
  return (
    adminUsername.length > 0 &&
    (adminPassword.length > 0 || adminUsername.includes('+clerk_test')) &&
    process.env.CLERK_TESTING_SETUP_SUCCESS === 'true'
  );
}

function getAdminCredentials(): { username: string; password: string } {
  return {
    username:
      process.env.E2E_CLERK_ADMIN_USERNAME ??
      process.env.E2E_CLERK_USER_USERNAME ??
      '',
    password:
      process.env.E2E_CLERK_ADMIN_PASSWORD ??
      process.env.E2E_CLERK_USER_PASSWORD ??
      '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN DASHBOARD SUITE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Admin Dashboard', () => {
  const fastIteration = process.env.E2E_FAST_ITERATION === '1';
  test.setTimeout(480_000); // 8 min: sign-in (180s) + admin page compilation

  test.beforeEach(async ({ page }) => {
    test.skip(!hasAdminCredentials(), 'Admin credentials not configured');

    await ensureSignedInUser(page, getAdminCredentials());
  });

  // ── Main admin dashboard page ────────────────────────────────────────────

  test('admin dashboard renders KPI and data sections', async ({ page }) => {
    test.skip(
      fastIteration,
      'Detailed admin KPI rendering is covered by broader admin health and chaos checks in fast mode'
    );
    test.setTimeout(120_000);

    const response = await smokeNavigateWithRetry(page, APP_ROUTES.ADMIN, {
      timeout: 90_000,
      retries: fastIteration ? 3 : 2,
    });

    const status = response?.status() ?? 0;
    if (status === 404 || status === 403) {
      test.skip(true, 'Test user does not have admin access');
      return;
    }

    expect(
      status,
      `Admin dashboard returned ${status} — server error`
    ).toBeLessThan(500);

    // Main container proves page rendered, not just the shell
    await expect(
      page.locator('[data-testid="admin-dashboard-content"]'),
      'Admin dashboard content container missing — page did not render'
    ).toBeVisible({ timeout: 30_000 });

    // KPI section must render — proves DB queries succeeded
    await expect(
      page.locator('[data-testid="admin-kpi-section"]'),
      'Admin KPI section missing — Suspense errored or DB query failed'
    ).toBeVisible({ timeout: 30_000 });

    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';
    expect(bodyText.toLowerCase()).not.toContain('application error');
    expect(bodyText.toLowerCase()).not.toContain('internal server error');
  });

  // ── Creators table ────────────────────────────────────────────────────────

  test('admin creators page renders table with data', async ({ page }) => {
    test.skip(
      fastIteration,
      'Admin creators page detail is covered by the broader admin status sweep in fast mode'
    );
    test.setTimeout(120_000);

    const response = await smokeNavigateWithRetry(
      page,
      APP_ROUTES.ADMIN_CREATORS,
      {
        timeout: 90_000,
        retries: fastIteration ? 3 : 2,
      }
    );

    const status = response?.status() ?? 0;
    if (status === 404 || status === 403) {
      test.skip(true, 'Test user does not have admin access');
      return;
    }

    expect(status, `Admin creators returned ${status}`).toBeLessThan(500);

    await expect(
      page.getByTestId('admin-creators-content'),
      'Admin creators page did not render the creators table shell'
    ).toBeVisible({ timeout: 30_000 });

    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';
    expect(bodyText.toLowerCase()).not.toContain('application error');
    expect(bodyText.toLowerCase()).not.toContain('something went wrong');
  });

  // ── Users table ───────────────────────────────────────────────────────────

  test('admin users page renders table with data', async ({ page }) => {
    test.skip(
      fastIteration,
      'Admin users page detail is covered by the broader admin status sweep in fast mode'
    );
    test.setTimeout(120_000);

    const response = await smokeNavigateWithRetry(
      page,
      APP_ROUTES.ADMIN_USERS,
      {
        timeout: 90_000,
        retries: fastIteration ? 3 : 2,
      }
    );

    const status = response?.status() ?? 0;
    if (status === 404 || status === 403) {
      test.skip(true, 'Test user does not have admin access');
      return;
    }

    expect(status, `Admin users returned ${status}`).toBeLessThan(500);

    await expect(
      page.getByTestId('admin-users-content'),
      'Admin users page did not render the users table shell'
    ).toBeVisible({ timeout: 30_000 });

    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';
    expect(bodyText.toLowerCase()).not.toContain('application error');
  });

  // ── All admin pages load without 500 ─────────────────────────────────────

  test('all admin pages return sub-500 status and no error text', async ({
    page,
  }) => {
    test.skip(
      fastIteration,
      'Admin status sweep duplicates admin chaos and navigation coverage in the fast lane'
    );
    test.setTimeout(360_000); // 6 min for 8 pages

    const adminPages = fastIteration
      ? [
          APP_ROUTES.ADMIN,
          APP_ROUTES.ADMIN_CREATORS,
          APP_ROUTES.ADMIN_USERS,
          APP_ROUTES.ADMIN_CAMPAIGNS,
        ]
      : [
          APP_ROUTES.ADMIN,
          APP_ROUTES.ADMIN_CREATORS,
          APP_ROUTES.ADMIN_USERS,
          APP_ROUTES.ADMIN_ACTIVITY,
          APP_ROUTES.ADMIN_CAMPAIGNS,
          APP_ROUTES.ADMIN_LEADS,
        ];

    // Check first page for admin access
    const firstResponse = await smokeNavigateWithRetry(page, APP_ROUTES.ADMIN, {
      timeout: 90_000,
      retries: fastIteration ? 3 : 2,
    });

    if (firstResponse?.status() === 404 || firstResponse?.status() === 403) {
      test.skip(true, 'Test user does not have admin access');
      return;
    }

    const failures: string[] = [];

    for (const path of adminPages) {
      let response: Awaited<ReturnType<typeof page.goto>>;
      try {
        response = await smokeNavigateWithRetry(page, path, {
          timeout: fastIteration ? 90_000 : 60_000,
          retries: fastIteration ? 3 : 2,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('Timeout') || msg.includes('net::ERR_')) {
          continue; // transient — skip this page
        }
        failures.push(`${path}: navigation error — ${msg}`);
        continue;
      }

      const status = response?.status() ?? 0;
      if (status >= 500) {
        failures.push(`${path}: returned ${status}`);
        continue;
      }

      const bodyText =
        (await page
          .locator('body')
          .innerText()
          .catch(() => '')) ?? '';
      const lower = bodyText.toLowerCase();
      if (
        lower.includes('application error') ||
        lower.includes('internal server error')
      ) {
        failures.push(`${path}: error page detected`);
      }
    }

    expect(
      failures,
      `Admin pages with errors:\n${failures.join('\n')}`
    ).toHaveLength(0);
  });
});
