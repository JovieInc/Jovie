import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { Page, test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';
import {
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
  waitForHydration,
} from './utils/smoke-test-utils';

/**
 * Chaos Click Testing - Authenticated Pages
 *
 * Extends chaos click testing to cover authenticated areas:
 * - Dashboard pages (analytics, audience, chat, contacts, earnings, profile, releases)
 * - Settings pages (main, billing, appearance, branding, ad-pixels, notifications)
 * - Admin pages (dashboard, activity, campaigns, creators, users, waitlist)
 *
 * Clicks all interactive elements to find hidden React errors that only
 * surface during user interactions.
 *
 * Run with:
 *   doppler run -- pnpm exec playwright test chaos-authenticated --project=chromium --workers=1
 */

// React error patterns to detect
const REACT_ERROR_PATTERNS = [
  'rendered more hooks than',
  'rendered fewer hooks',
  'invalid hook call',
  'rules of hooks',
  "can't perform a react state update on an unmounted",
  'cannot update a component while rendering',
  'maximum update depth exceeded',
  'too many re-renders',
  'hydration failed',
  'text content does not match',
  'minified react error',
  'unhandled runtime error',
  'uncaught error',
  'error boundary',
];

interface ChaosError {
  page: string;
  element: string;
  error: string;
}

interface ChaosResult {
  page: string;
  elementsFound: number;
  elementsClicked: number;
  errors: ChaosError[];
  duration: number;
}

function isReactError(text: string): boolean {
  const lower = text.toLowerCase();
  return REACT_ERROR_PATTERNS.some(p => lower.includes(p));
}

/**
 * Check if Clerk credentials are available for authenticated tests
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
 * Get admin credentials (admin-specific or fallback to regular)
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

/**
 * Find all clickable elements on the page
 * Returns unique selectors that can be used to locate and click elements
 */
async function findClickableElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selectors = [
      'button:not([disabled])',
      'a[href]:not([href^="mailto:"]):not([href^="tel:"]):not([href^="http"])', // Only internal links
      '[role="button"]:not([disabled])',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="checkbox"]',
      '[role="switch"]',
      'input[type="checkbox"]',
      'input[type="radio"]',
      'select',
      '[data-testid*="button"]',
      '[data-testid*="toggle"]',
      '[data-testid*="switch"]',
    ];

    const seen = new Set<Element>();
    const results: string[] = [];

    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (seen.has(el)) continue;
        seen.add(el);

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        // Skip elements that would navigate away or trigger dangerous actions
        const href = el.getAttribute('href');
        if (href?.startsWith('/signout') || href?.startsWith('/sign-out'))
          continue;
        if (el.textContent?.toLowerCase().includes('sign out')) continue;
        if (el.textContent?.toLowerCase().includes('log out')) continue;
        if (el.textContent?.toLowerCase().includes('delete')) continue;
        if (el.textContent?.toLowerCase().includes('remove account')) continue;

        // Build a stable selector
        const testId = el.getAttribute('data-testid');
        if (testId) {
          results.push(`[data-testid="${testId}"]`);
        } else if (el.id) {
          results.push(`#${el.id}`);
        } else {
          const label = el.getAttribute('aria-label');
          if (label) {
            results.push(`[aria-label="${label}"]`);
          }
        }
      }
    }
    return results;
  });
}

/**
 * Perform chaos testing on a single page
 * Clicks all interactive elements and records React errors
 */
async function chaosTestPage(
  page: Page,
  url: string,
  errors: ChaosError[]
): Promise<ChaosResult> {
  const { getContext, cleanup } = setupPageMonitoring(page);
  const startTime = Date.now();
  let elementsClicked = 0;
  let elementsFound = 0;

  try {
    await smokeNavigate(page, url, { timeout: SMOKE_TIMEOUTS.NAVIGATION });

    // Wait for page to stabilize - don't require full 'load' state which can timeout
    await Promise.race([
      waitForHydration(page),
      page.waitForTimeout(10000),
    ]).catch(() => {});

    // Additional stabilization wait
    await Promise.race([
      page.waitForLoadState('networkidle'),
      page.waitForTimeout(5000),
    ]).catch(() => {});

    const elements = await findClickableElements(page);
    elementsFound = elements.length;
    console.log(`  Found ${elementsFound} clickable elements on ${url}`);

    for (const selector of elements) {
      const errorsBefore = [...getContext().consoleErrors];

      try {
        const locator = page.locator(selector).first();
        if (!(await locator.isVisible().catch(() => false))) continue;

        // Scroll element into view
        await locator.scrollIntoViewIfNeeded().catch(() => {});

        await locator.click({ timeout: 2000, force: false });
        await page.waitForTimeout(200); // Shorter wait between clicks
        elementsClicked++;

        // Check for new React errors
        const newErrors = getContext().consoleErrors.filter(
          e => !errorsBefore.includes(e) && isReactError(e)
        );

        if (newErrors.length > 0) {
          errors.push({ page: url, element: selector, error: newErrors[0] });
          console.log(`  [ERROR] ${selector}: ${newErrors[0].slice(0, 100)}`);
        }

        // Navigate back if we left the page
        const currentPath = new URL(page.url()).pathname;
        const expectedPath = url.startsWith('/') ? url : new URL(url).pathname;

        // Check if we're still on the same page section
        const expectedSection = expectedPath.split('/').slice(0, 4).join('/');
        if (
          !currentPath.startsWith(expectedSection) &&
          !currentPath.includes('/signin')
        ) {
          await smokeNavigate(page, url);
          await Promise.race([
            waitForHydration(page),
            page.waitForTimeout(5000),
          ]).catch(() => {});
        }

        // Close any modals/dialogs that might have opened
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(100);
      } catch {
        // Ignore click failures (navigation, detached elements, etc.)
      }
    }
  } finally {
    cleanup();
  }

  return {
    page: url,
    elementsFound,
    elementsClicked,
    errors: errors.filter(e => e.page === url),
    duration: Date.now() - startTime,
  };
}

/**
 * Run chaos tests on a group of pages and generate report
 */
async function runChaosTestGroup(
  page: Page,
  urls: string[],
  groupName: string,
  testInfo: { attach: (name: string, options: object) => Promise<void> }
): Promise<{ errors: ChaosError[]; results: ChaosResult[] }> {
  const errors: ChaosError[] = [];
  const results: ChaosResult[] = [];
  const startTime = Date.now();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`CHAOS TEST: ${groupName}`);
  console.log(`${'='.repeat(60)}`);

  for (const url of urls) {
    console.log(`\nTesting: ${url}`);
    const result = await chaosTestPage(page, url, errors);
    results.push(result);
    console.log(
      `  Clicked ${result.elementsClicked}/${result.elementsFound} elements, ${result.errors.length} errors`
    );
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalClicked = results.reduce((sum, r) => sum + r.elementsClicked, 0);
  const totalElements = results.reduce((sum, r) => sum + r.elementsFound, 0);

  const report = [
    `\n${'='.repeat(60)}`,
    `CHAOS TEST SUMMARY: ${groupName}`,
    `${'='.repeat(60)}`,
    `Pages tested: ${urls.length}`,
    `Elements found: ${totalElements}`,
    `Elements clicked: ${totalClicked}`,
    `React errors: ${errors.length}`,
    `Duration: ${totalDuration}s`,
    '',
    errors.length > 0 ? 'ERRORS:' : '',
    ...errors.map(
      e => `\n  Page: ${e.page}\n  Element: ${e.element}\n  Error: ${e.error}`
    ),
    errors.length === 0
      ? '\n[PASS] No React errors found!'
      : '\n[FAIL] React errors detected',
  ].join('\n');

  console.log(report);

  await testInfo.attach(
    `chaos-report-${groupName.toLowerCase().replace(/\s+/g, '-')}`,
    {
      body: report,
      contentType: 'text/plain',
    }
  );

  await testInfo.attach(
    `chaos-errors-${groupName.toLowerCase().replace(/\s+/g, '-')}`,
    {
      body: JSON.stringify(errors, null, 2),
      contentType: 'application/json',
    }
  );

  await testInfo.attach(
    `chaos-results-${groupName.toLowerCase().replace(/\s+/g, '-')}`,
    {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    }
  );

  return { errors, results };
}

/**
 * Sets up authentication for chaos tests.
 * Returns false if setup failed and test should be skipped.
 */
async function setupChaosAuth(page: Page, useAdmin = false): Promise<boolean> {
  if (!hasClerkCredentials()) {
    console.log('Skipping chaos tests - no Clerk credentials');
    return false;
  }

  await setupClerkTestingToken({ page });

  const credentials = useAdmin ? getAdminCredentials() : undefined;

  try {
    await signInUser(page, credentials);
    return true;
  } catch (error) {
    console.error('Failed to sign in:', error);
    return false;
  }
}

// ============================================================================
// Page Groups
// ============================================================================

const DASHBOARD_PAGES = [
  '/app/dashboard/analytics',
  '/app/dashboard/audience',
  '/app/dashboard/chat',
  '/app/dashboard/contacts',
  '/app/dashboard/earnings',
  '/app/dashboard/profile',
  '/app/dashboard/releases',
];

const SETTINGS_PAGES = [
  '/app/settings',
  '/app/settings/billing',
  '/app/settings/appearance',
  '/app/settings/branding',
  '/app/settings/ad-pixels',
  '/app/settings/notifications',
];

const ADMIN_PAGES = [
  '/app/admin',
  '/app/admin/activity',
  '/app/admin/campaigns',
  '/app/admin/creators',
  '/app/admin/users',
  '/app/admin/waitlist',
];

// ============================================================================
// Tests
// ============================================================================

test.describe('Authenticated Chaos Testing @chaos', () => {
  test.setTimeout(600_000); // 10 minutes per test - chaos tests need time for many clicks

  test.beforeEach(async ({ page }) => {
    const success = await setupChaosAuth(page);
    if (!success) test.skip();
  });

  test('Dashboard pages chaos test', async ({ page }, testInfo) => {
    const { errors } = await runChaosTestGroup(
      page,
      DASHBOARD_PAGES,
      'Dashboard Pages',
      testInfo
    );

    // Log errors but don't fail the test (chaos tests are informational)
    if (errors.length > 0) {
      console.log(
        `\n[WARNING] Found ${errors.length} React errors in dashboard pages`
      );
    }
  });

  test('Settings pages chaos test', async ({ page }, testInfo) => {
    const { errors } = await runChaosTestGroup(
      page,
      SETTINGS_PAGES,
      'Settings Pages',
      testInfo
    );

    if (errors.length > 0) {
      console.log(
        `\n[WARNING] Found ${errors.length} React errors in settings pages`
      );
    }
  });
});

test.describe('Admin Chaos Testing @chaos', () => {
  test.setTimeout(300_000);

  test.beforeEach(async ({ page }) => {
    const success = await setupChaosAuth(page, true);
    if (!success) test.skip();
  });

  test('Admin pages chaos test', async ({ page }, testInfo) => {
    // First check if user has admin access
    const response = await page.goto(ADMIN_PAGES[0], {
      waitUntil: 'domcontentloaded',
    });

    if (response?.status() === 404) {
      console.log(
        'Test user does not have admin access - skipping admin chaos tests'
      );
      test.skip();
      return;
    }

    const { errors } = await runChaosTestGroup(
      page,
      ADMIN_PAGES,
      'Admin Pages',
      testInfo
    );

    if (errors.length > 0) {
      console.log(
        `\n[WARNING] Found ${errors.length} React errors in admin pages`
      );
    }
  });
});

test.describe('Full Chaos Sweep @chaos-full', () => {
  test.setTimeout(600_000); // 10 minutes

  test('All authenticated pages', async ({ page }, testInfo) => {
    const success = await setupChaosAuth(page, true);
    if (!success) {
      test.skip();
      return;
    }

    const allErrors: ChaosError[] = [];
    const allResults: ChaosResult[] = [];

    // Test dashboard pages
    const dashboard = await runChaosTestGroup(
      page,
      DASHBOARD_PAGES,
      'Dashboard',
      testInfo
    );
    allErrors.push(...dashboard.errors);
    allResults.push(...dashboard.results);

    // Test settings pages
    const settings = await runChaosTestGroup(
      page,
      SETTINGS_PAGES,
      'Settings',
      testInfo
    );
    allErrors.push(...settings.errors);
    allResults.push(...settings.results);

    // Test admin pages (if accessible)
    const adminResponse = await page.goto(ADMIN_PAGES[0], {
      waitUntil: 'domcontentloaded',
    });

    if (adminResponse?.status() !== 404) {
      const admin = await runChaosTestGroup(
        page,
        ADMIN_PAGES,
        'Admin',
        testInfo
      );
      allErrors.push(...admin.errors);
      allResults.push(...admin.results);
    } else {
      console.log('\nSkipping admin pages - user does not have admin access');
    }

    // Final summary
    const summary = [
      '\n' + '='.repeat(60),
      'FULL CHAOS SWEEP SUMMARY',
      '='.repeat(60),
      `Total pages tested: ${allResults.length}`,
      `Total elements clicked: ${allResults.reduce((s, r) => s + r.elementsClicked, 0)}`,
      `Total React errors: ${allErrors.length}`,
      '',
      allErrors.length === 0
        ? '[PASS] All pages passed chaos testing!'
        : `[ISSUES] Found ${allErrors.length} React errors to investigate`,
    ].join('\n');

    console.log(summary);

    await testInfo.attach('chaos-full-summary', {
      body: summary,
      contentType: 'text/plain',
    });

    await testInfo.attach('chaos-full-all-errors', {
      body: JSON.stringify(allErrors, null, 2),
      contentType: 'application/json',
    });
  });
});
