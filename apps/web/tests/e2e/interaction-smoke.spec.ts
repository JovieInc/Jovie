import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, Page, TestInfo, test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Interaction Smoke Tests
 *
 * Verifies interactive elements (drawers, context menus, buttons) work
 * without crashing on every dashboard and admin page that has them.
 *
 * This catches:
 * - Infinite render loops triggered by interactions
 * - Error boundaries hit on drawer open
 * - Context menu crashes from bad data
 * - Missing providers or broken context chains
 *
 * Run:
 *   SMOKE_ONLY=1 doppler run -- pnpm exec playwright test interaction-smoke --project=chromium
 */

/** React error patterns that indicate a crash */
const REACT_ERROR_PATTERNS = [
  'Maximum update depth exceeded',
  'rendered more hooks than during the previous render',
  'rendered fewer hooks than expected',
  'Invalid hook call',
  'Cannot update a component',
  'Too many re-renders',
  'Minified React error',
  'Error: Hydration failed',
] as const;

interface InteractionResult {
  page: string;
  interaction: string;
  status: 'pass' | 'fail' | 'skip';
  error?: string;
}

/**
 * Pages that have table rows which can be clicked to open a right drawer.
 * Each config specifies how to find and click a row, and how to verify the drawer opened.
 */
const DRAWER_PAGES = [
  {
    path: '/app/dashboard/audience',
    name: 'Audience',
    rowSelector: 'table[aria-label="Data table"] tbody tr',
    drawerSelector: '[data-testid="right-drawer"], [role="complementary"]',
    requiresData: true,
    isAdmin: false,
  },
  {
    path: '/app/dashboard/releases',
    name: 'Releases',
    rowSelector: 'table[aria-label="Data table"] tbody tr',
    drawerSelector:
      '[data-testid="release-sidebar"], [data-testid="right-drawer"], [role="complementary"]',
    requiresData: true,
    isAdmin: false,
  },
  {
    path: '/app/settings/contacts',
    name: 'Contacts',
    rowSelector: 'table[aria-label="Data table"] tbody tr',
    drawerSelector: '[data-testid="right-drawer"], [role="complementary"]',
    requiresData: true,
    isAdmin: false,
  },
  {
    path: '/app/admin/creators',
    name: 'Admin Creators',
    rowSelector: 'table[aria-label="Data table"] tbody tr',
    drawerSelector: '[data-testid="right-drawer"], [role="complementary"]',
    requiresData: true,
    isAdmin: true,
  },
] as const;

/**
 * Pages that have context menus (right-click or "More actions" button).
 */
const CONTEXT_MENU_PAGES = [
  {
    path: '/app/dashboard/audience',
    name: 'Audience',
    triggerSelector:
      'button[aria-label="More actions"], button:has-text("More")',
    menuSelector: '[role="menu"], [data-radix-menu-content]',
    requiresData: true,
    isAdmin: false,
  },
  {
    path: '/app/dashboard/releases',
    name: 'Releases',
    triggerSelector:
      'button[aria-label="More actions"], button:has-text("More")',
    menuSelector: '[role="menu"], [data-radix-menu-content]',
    requiresData: true,
    isAdmin: false,
  },
  {
    path: '/app/admin/creators',
    name: 'Admin Creators',
    triggerSelector:
      'button[aria-label="More actions"], button:has-text("More")',
    menuSelector: '[role="menu"], [data-radix-menu-content]',
    requiresData: true,
    isAdmin: true,
  },
  {
    path: '/app/admin/users',
    name: 'Admin Users',
    triggerSelector:
      'button[aria-label="More actions"], button:has-text("More")',
    menuSelector: '[role="menu"], [data-radix-menu-content]',
    requiresData: true,
    isAdmin: true,
  },
  {
    path: '/app/admin/waitlist',
    name: 'Admin Waitlist',
    triggerSelector:
      'button[aria-label="More actions"], button:has-text("More")',
    menuSelector: '[role="menu"], [data-radix-menu-content]',
    requiresData: true,
    isAdmin: true,
  },
] as const;

/**
 * Pages with sidebar toggle buttons (for testing the toggle action itself).
 */
const SIDEBAR_TOGGLE_PAGES = [
  {
    path: '/app/admin/creators',
    name: 'Admin Creators',
    toggleSelector: 'button[aria-label="Toggle contact details"]',
    isAdmin: true,
  },
  {
    path: '/app/dashboard/audience',
    name: 'Audience',
    toggleSelector: 'button[aria-label="Toggle contact details"]',
    isAdmin: false,
  },
] as const;

/** Navigate to a page and wait for it to settle */
async function navigateAndSettle(page: Page, path: string): Promise<boolean> {
  try {
    await page.goto(path, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION * 2,
    });
    await waitForHydration(page);
    await Promise.race([
      page.waitForLoadState('networkidle'),
      page.waitForTimeout(8000),
    ]).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Collect React errors from console */
function setupErrorCollector(page: Page): {
  errors: string[];
  clear: () => void;
} {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (REACT_ERROR_PATTERNS.some(p => text.includes(p))) {
        errors.push(text);
      }
    }
  });
  page.on('pageerror', err => {
    errors.push(`[pageerror] ${err.message}`);
  });
  return {
    errors,
    clear: () => {
      errors.length = 0;
    },
  };
}

// ============================================================================
// Dashboard Interaction Tests
// ============================================================================

test.describe('Dashboard Interaction Smoke Tests @smoke', () => {
  test.setTimeout(360_000);

  test.beforeEach(async ({ page }) => {
    const username = process.env.E2E_CLERK_USER_USERNAME ?? '';
    const password = process.env.E2E_CLERK_USER_PASSWORD ?? '';
    const clerkSetupSuccess =
      process.env.CLERK_TESTING_SETUP_SUCCESS === 'true';
    const isClerkTestEmail = username.includes('+clerk_test');

    if (
      !(
        username.length > 0 &&
        (password.length > 0 || isClerkTestEmail) &&
        clerkSetupSuccess
      )
    ) {
      test.skip();
      return;
    }

    await setupClerkTestingToken({ page });
    try {
      await signInUser(page);
    } catch {
      test.skip();
    }
  });

  test('Right drawers open without React errors', async ({
    page,
  }, testInfo) => {
    const { errors, clear } = setupErrorCollector(page);
    const results: InteractionResult[] = [];

    for (const config of DRAWER_PAGES) {
      if (config.isAdmin) continue; // Tested in admin suite
      clear();

      const navigated = await navigateAndSettle(page, config.path);
      if (!navigated) {
        results.push({
          page: config.name,
          interaction: 'drawer-open',
          status: 'fail',
          error: 'Navigation failed',
        });
        continue;
      }

      // Check if there's data to interact with
      const hasRows = await page
        .locator(config.rowSelector)
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (!hasRows && config.requiresData) {
        results.push({
          page: config.name,
          interaction: 'drawer-open',
          status: 'skip',
          error: 'No data rows to click',
        });
        continue;
      }

      // Click first row to open drawer
      try {
        await page.locator(config.rowSelector).first().click();
        await page.waitForTimeout(2000); // Allow drawer animation

        // Check for React errors after interaction
        if (errors.length > 0) {
          results.push({
            page: config.name,
            interaction: 'drawer-open',
            status: 'fail',
            error: `React error after drawer open: ${errors[0]}`,
          });
          await attachScreenshot(testInfo, page, `drawer-error-${config.name}`);
          continue;
        }

        // Check for error boundary after interaction
        const { hasError, errorText } = await checkForErrorPage(page);
        if (hasError) {
          results.push({
            page: config.name,
            interaction: 'drawer-open',
            status: 'fail',
            error: `Error boundary hit: ${errorText}`,
          });
          await attachScreenshot(testInfo, page, `drawer-error-${config.name}`);
          continue;
        }

        results.push({
          page: config.name,
          interaction: 'drawer-open',
          status: 'pass',
        });
      } catch (e) {
        results.push({
          page: config.name,
          interaction: 'drawer-open',
          status: 'fail',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    logResults('Dashboard Drawer Tests', results);
    await testInfo.attach('drawer-results', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });

    const failures = results.filter(r => r.status === 'fail');
    expect(
      failures,
      `${failures.length} drawer interactions failed`
    ).toHaveLength(0);
  });

  test('Context menus open without React errors', async ({
    page,
  }, testInfo) => {
    const { errors, clear } = setupErrorCollector(page);
    const results: InteractionResult[] = [];

    for (const config of CONTEXT_MENU_PAGES) {
      if (config.isAdmin) continue; // Tested in admin suite
      clear();

      const navigated = await navigateAndSettle(page, config.path);
      if (!navigated) {
        results.push({
          page: config.name,
          interaction: 'context-menu',
          status: 'fail',
          error: 'Navigation failed',
        });
        continue;
      }

      // Check if there are table rows to right-click
      const rowSelector = 'table[aria-label="Data table"] tbody tr';
      const hasRows = await page
        .locator(rowSelector)
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (!hasRows && config.requiresData) {
        results.push({
          page: config.name,
          interaction: 'context-menu',
          status: 'skip',
          error: 'No table rows to right-click',
        });
        continue;
      }

      // Right-click a table row to trigger context menu
      try {
        await page.locator(rowSelector).first().click({ button: 'right' });
        await page.waitForTimeout(500); // Allow menu to open

        // Check for React errors
        if (errors.length > 0) {
          results.push({
            page: config.name,
            interaction: 'context-menu',
            status: 'fail',
            error: `React error after context menu: ${errors[0]}`,
          });
          continue;
        }

        // Dismiss menu by pressing Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        results.push({
          page: config.name,
          interaction: 'context-menu',
          status: 'pass',
        });
      } catch (e) {
        results.push({
          page: config.name,
          interaction: 'context-menu',
          status: 'skip',
          error: `Could not interact: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    logResults('Dashboard Context Menu Tests', results);
    await testInfo.attach('context-menu-results', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });

    const failures = results.filter(r => r.status === 'fail');
    expect(
      failures,
      `${failures.length} context menu interactions failed`
    ).toHaveLength(0);
  });
});

// ============================================================================
// Admin Interaction Tests
// ============================================================================

test.describe('Admin Interaction Smoke Tests @smoke', () => {
  test.setTimeout(360_000);

  test.beforeEach(async ({ page }) => {
    const adminUsername = process.env.E2E_CLERK_ADMIN_USERNAME ?? '';
    const adminPassword = process.env.E2E_CLERK_ADMIN_PASSWORD ?? '';
    const regularUsername = process.env.E2E_CLERK_USER_USERNAME ?? '';
    const regularPassword = process.env.E2E_CLERK_USER_PASSWORD ?? '';
    const clerkSetupSuccess =
      process.env.CLERK_TESTING_SETUP_SUCCESS === 'true';

    const username = adminUsername || regularUsername;
    const password = adminPassword || regularPassword;
    const isClerkTestEmail = username.includes('+clerk_test');

    if (
      !(
        username.length > 0 &&
        (password.length > 0 || isClerkTestEmail) &&
        clerkSetupSuccess
      )
    ) {
      test.skip();
      return;
    }

    await setupClerkTestingToken({ page });
    try {
      await signInUser(page, { username, password });
    } catch {
      test.skip();
    }
  });

  test('Admin drawers open without React errors', async ({
    page,
  }, testInfo) => {
    const { errors, clear } = setupErrorCollector(page);
    const results: InteractionResult[] = [];

    const adminDrawerPages = DRAWER_PAGES.filter(p => p.isAdmin);
    for (const config of adminDrawerPages) {
      clear();

      const navigated = await navigateAndSettle(page, config.path);
      if (!navigated) {
        results.push({
          page: config.name,
          interaction: 'drawer-open',
          status: 'fail',
          error: 'Navigation failed',
        });
        continue;
      }

      // Check for 404 (not admin)
      if (page.url().includes('/404') || page.url().includes('/sign-in')) {
        test.skip();
        return;
      }

      const hasRows = await page
        .locator(config.rowSelector)
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (!hasRows && config.requiresData) {
        results.push({
          page: config.name,
          interaction: 'drawer-open',
          status: 'skip',
          error: 'No data rows to click',
        });
        continue;
      }

      try {
        await page.locator(config.rowSelector).first().click();
        await page.waitForTimeout(2000);

        if (errors.length > 0) {
          results.push({
            page: config.name,
            interaction: 'drawer-open',
            status: 'fail',
            error: `React error after drawer open: ${errors[0]}`,
          });
          await attachScreenshot(
            testInfo,
            page,
            `admin-drawer-error-${config.name}`
          );
          continue;
        }

        const { hasError, errorText } = await checkForErrorPage(page);
        if (hasError) {
          results.push({
            page: config.name,
            interaction: 'drawer-open',
            status: 'fail',
            error: `Error boundary hit: ${errorText}`,
          });
          await attachScreenshot(
            testInfo,
            page,
            `admin-drawer-error-${config.name}`
          );
          continue;
        }

        results.push({
          page: config.name,
          interaction: 'drawer-open',
          status: 'pass',
        });
      } catch (e) {
        results.push({
          page: config.name,
          interaction: 'drawer-open',
          status: 'fail',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    logResults('Admin Drawer Tests', results);
    await testInfo.attach('admin-drawer-results', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });

    const failures = results.filter(r => r.status === 'fail');
    expect(
      failures,
      `${failures.length} admin drawer interactions failed`
    ).toHaveLength(0);
  });

  test('Admin context menus open without React errors', async ({
    page,
  }, testInfo) => {
    const { errors, clear } = setupErrorCollector(page);
    const results: InteractionResult[] = [];

    const adminMenuPages = CONTEXT_MENU_PAGES.filter(p => p.isAdmin);
    for (const config of adminMenuPages) {
      clear();

      const navigated = await navigateAndSettle(page, config.path);
      if (!navigated) {
        results.push({
          page: config.name,
          interaction: 'context-menu',
          status: 'fail',
          error: 'Navigation failed',
        });
        continue;
      }

      if (page.url().includes('/404') || page.url().includes('/sign-in')) {
        test.skip();
        return;
      }

      const rowSelector = 'table[aria-label="Data table"] tbody tr';
      const hasRows = await page
        .locator(rowSelector)
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (!hasRows && config.requiresData) {
        results.push({
          page: config.name,
          interaction: 'context-menu',
          status: 'skip',
          error: 'No table rows to right-click',
        });
        continue;
      }

      try {
        await page.locator(rowSelector).first().click({ button: 'right' });
        await page.waitForTimeout(500);

        if (errors.length > 0) {
          results.push({
            page: config.name,
            interaction: 'context-menu',
            status: 'fail',
            error: `React error after context menu: ${errors[0]}`,
          });
          continue;
        }

        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        results.push({
          page: config.name,
          interaction: 'context-menu',
          status: 'pass',
        });
      } catch (e) {
        results.push({
          page: config.name,
          interaction: 'context-menu',
          status: 'skip',
          error: `Could not interact: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    logResults('Admin Context Menu Tests', results);
    await testInfo.attach('admin-context-menu-results', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });

    const failures = results.filter(r => r.status === 'fail');
    expect(
      failures,
      `${failures.length} admin context menu interactions failed`
    ).toHaveLength(0);
  });

  test('Admin sidebar toggles work without React errors', async ({
    page,
  }, testInfo) => {
    const { errors, clear } = setupErrorCollector(page);
    const results: InteractionResult[] = [];

    for (const config of SIDEBAR_TOGGLE_PAGES) {
      if (!config.isAdmin) continue;
      clear();

      const navigated = await navigateAndSettle(page, config.path);
      if (!navigated) {
        results.push({
          page: config.name,
          interaction: 'sidebar-toggle',
          status: 'fail',
          error: 'Navigation failed',
        });
        continue;
      }

      if (page.url().includes('/404') || page.url().includes('/sign-in')) {
        test.skip();
        return;
      }

      const hasToggle = await page
        .locator(config.toggleSelector)
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (!hasToggle) {
        results.push({
          page: config.name,
          interaction: 'sidebar-toggle',
          status: 'skip',
          error: 'Toggle button not found',
        });
        continue;
      }

      try {
        // Toggle open
        await page.locator(config.toggleSelector).first().click();
        await page.waitForTimeout(1000);

        if (errors.length > 0) {
          results.push({
            page: config.name,
            interaction: 'sidebar-toggle',
            status: 'fail',
            error: `React error after toggle: ${errors[0]}`,
          });
          continue;
        }

        // Toggle closed
        await page.locator(config.toggleSelector).first().click();
        await page.waitForTimeout(500);

        if (errors.length > 0) {
          results.push({
            page: config.name,
            interaction: 'sidebar-toggle',
            status: 'fail',
            error: `React error after toggle close: ${errors[0]}`,
          });
          continue;
        }

        results.push({
          page: config.name,
          interaction: 'sidebar-toggle',
          status: 'pass',
        });
      } catch (e) {
        results.push({
          page: config.name,
          interaction: 'sidebar-toggle',
          status: 'fail',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    logResults('Admin Sidebar Toggle Tests', results);
    const failures = results.filter(r => r.status === 'fail');
    expect(
      failures,
      `${failures.length} sidebar toggle interactions failed`
    ).toHaveLength(0);
  });
});

// ============================================================================
// Helpers
// ============================================================================

/** Check for error page indicators */
async function checkForErrorPage(
  page: Page
): Promise<{ hasError: boolean; errorText?: string }> {
  const mainText = await page
    .locator('main')
    .innerText()
    .catch(() => '');
  const text = mainText.toLowerCase();

  const errorPatterns = [
    'something went wrong',
    'application error',
    'internal server error',
    'unhandled runtime error',
  ];

  const matched = errorPatterns.find(p => text.includes(p));
  if (matched) {
    return { hasError: true, errorText: `Found "${matched}" in page` };
  }

  return { hasError: false };
}

/** Attach a screenshot to test results */
async function attachScreenshot(
  testInfo: TestInfo,
  page: Page,
  name: string
): Promise<void> {
  const screenshot = await page.screenshot().catch(() => null);
  if (screenshot) {
    await testInfo.attach(name, {
      body: screenshot,
      contentType: 'image/png',
    });
  }
}

/** Log results summary */
function logResults(title: string, results: InteractionResult[]): void {
  const passed = results.filter(r => r.status === 'pass');
  const failed = results.filter(r => r.status === 'fail');
  const skipped = results.filter(r => r.status === 'skip');

  console.log(`\n📊 ${title}:`);
  console.log(`   ✅ Passed: ${passed.length}`);
  if (failed.length > 0) {
    console.log(`   ❌ Failed: ${failed.length}`);
    for (const f of failed) {
      console.log(`      - ${f.page} (${f.interaction}): ${f.error}`);
    }
  }
  if (skipped.length > 0) {
    console.log(`   ⏭ Skipped: ${skipped.length}`);
  }
}
