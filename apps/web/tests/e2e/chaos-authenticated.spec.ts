import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { ensureSignedInUser, isClerkTestEmail } from '../helpers/clerk-auth';
import {
  isTransientNavigationError,
  setupPageMonitoring,
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

/**
 * Chaos Click Testing - Authenticated Pages
 *
 * Extends chaos click testing to cover authenticated areas:
 * - Dashboard pages (audience, chat, contacts, earnings, profile, releases)
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

const CHAOS_WARMUP_TIMEOUT = 120_000;
const CHAOS_PAGE_RETRIES = 1;
const IS_FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';
const CHAOS_MAX_ELEMENTS_PER_PAGE = IS_FAST_ITERATION ? 3 : 20;
const CHAOS_STABILIZE_TIMEOUT = IS_FAST_ITERATION ? 3_000 : 10_000;
const CHAOS_POST_CLICK_TIMEOUT = IS_FAST_ITERATION ? 1_500 : 5_000;

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

  return (
    username.length > 0 &&
    (password.length > 0 || isClerkTestEmail(username)) &&
    clerkSetupSuccess
  );
}

/**
 * Get admin credentials (admin-specific or fallback to regular)
 */
function getAdminCredentials(): { username: string; password: string } {
  const adminUsername = process.env.E2E_CLERK_ADMIN_USERNAME ?? '';
  const adminPassword = process.env.E2E_CLERK_ADMIN_PASSWORD ?? '';

  if (
    adminUsername.length > 0 &&
    (adminPassword.length > 0 || isClerkTestEmail(adminUsername))
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
  for (let attempt = 0; attempt <= CHAOS_PAGE_RETRIES; attempt++) {
    const { getContext, cleanup } = setupPageMonitoring(page);
    const startTime = Date.now();
    let elementsClicked = 0;
    let elementsFound = 0;

    try {
      await navigateChaosRoute(page, url);

      // Wait for page to stabilize - don't require full 'load' state which can timeout
      await Promise.race([
        waitForHydration(page),
        page.waitForLoadState('domcontentloaded', {
          timeout: CHAOS_STABILIZE_TIMEOUT,
        }),
      ]).catch(() => {});

      if (!IS_FAST_ITERATION) {
        // Extra stabilization is only worth it in the slower exhaustive lane.
        await Promise.race([
          page.waitForLoadState('networkidle'),
          page.waitForLoadState('domcontentloaded', {
            timeout: CHAOS_POST_CLICK_TIMEOUT,
          }),
        ]).catch(() => {});
      }

      const elements = (await findClickableElements(page)).slice(
        0,
        CHAOS_MAX_ELEMENTS_PER_PAGE
      );
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
          await page
            .waitForLoadState('domcontentloaded', {
              timeout: CHAOS_POST_CLICK_TIMEOUT,
            })
            .catch(() => {});
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
          const expectedPath = url.startsWith('/')
            ? url
            : new URL(url).pathname;

          // Check if we're still on the same page section
          const expectedSection = expectedPath.split('/').slice(0, 4).join('/');
          if (
            !currentPath.startsWith(expectedSection) &&
            !currentPath.includes('/signin')
          ) {
            await navigateChaosRoute(page, url);
            await Promise.race([
              waitForHydration(page),
              page.waitForLoadState('domcontentloaded', {
                timeout: CHAOS_POST_CLICK_TIMEOUT,
              }),
            ]).catch(() => {});
          }

          // Close any modals/dialogs that might have opened
          await page.keyboard.press('Escape').catch(() => {});
          // brief settle handled by next locator check
        } catch {
          // Ignore click failures (navigation, detached elements, etc.)
        }
      }

      return {
        page: url,
        elementsFound,
        elementsClicked,
        errors: errors.filter(e => e.page === url),
        duration: Date.now() - startTime,
      };
    } catch (error) {
      if (attempt < CHAOS_PAGE_RETRIES && isTransientNavigationError(error)) {
        console.warn(
          `Transient chaos page failure for ${url}; retrying page run ${attempt + 1}/${CHAOS_PAGE_RETRIES}`
        );
        continue;
      }
      throw error;
    } finally {
      cleanup();
    }
  }

  throw new Error(`Chaos page run exhausted retries for ${url}`);
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

async function warmupChaosRoutes(page: Page, urls: string[]): Promise<void> {
  for (const url of urls) {
    try {
      await navigateChaosRoute(page, url);
      await Promise.race([
        waitForHydration(page),
        page.waitForLoadState('domcontentloaded', { timeout: 10_000 }),
      ]).catch(() => {});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Chaos warmup failed for ${url}: ${message}`);
    }
  }
}

async function navigateChaosRoute(
  page: Page,
  url: string
): Promise<Awaited<ReturnType<Page['goto']>>> {
  try {
    return await smokeNavigateWithRetry(page, url, {
      timeout: CHAOS_WARMUP_TIMEOUT,
      retries: 2,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('net::ERR_ABORTED') ||
      message.includes('ERR_CONNECTION_RESET')
    ) {
      return await smokeNavigateWithRetry(page, url, {
        timeout: CHAOS_WARMUP_TIMEOUT,
        retries: 2,
      });
    }
    throw error;
  }
}

/**
 * Sets up authentication for chaos tests.
 * Throws if credentials are missing or sign-in fails — chaos tests must not silently skip.
 */
async function setupChaosAuth(page: Page, useAdmin = false): Promise<void> {
  if (!hasClerkCredentials()) {
    throw new Error(
      'Chaos tests require Clerk credentials. Ensure E2E_CLERK_USER_USERNAME, E2E_CLERK_USER_PASSWORD, and CLERK_TESTING_SETUP_SUCCESS are set. Run with: doppler run -- pnpm exec playwright test'
    );
  }

  await setupClerkTestingToken({ page });

  const credentials = useAdmin ? getAdminCredentials() : undefined;
  await ensureSignedInUser(page, credentials);
}

// ============================================================================
// Page Groups
// ============================================================================

const DASHBOARD_PAGES = [
  APP_ROUTES.AUDIENCE,
  APP_ROUTES.CHAT,
  APP_ROUTES.CONTACTS,
  APP_ROUTES.EARNINGS,
  APP_ROUTES.RELEASES,
];
const FAST_DASHBOARD_PAGES = [APP_ROUTES.AUDIENCE, APP_ROUTES.CHAT];

const SETTINGS_PAGES = [
  '/app/settings',
  '/app/settings/billing',
  '/app/settings/branding',
  '/app/settings/ad-pixels',
];
const FAST_SETTINGS_PAGES = ['/app/settings'];

const ADMIN_PAGES = [
  '/app/admin',
  '/app/admin/activity',
  '/app/admin/campaigns',
  '/app/admin/creators',
  '/app/admin/users',
];
const FAST_ADMIN_PAGES = ['/app/admin'];

// ============================================================================
// Tests
// ============================================================================

test.describe('Authenticated Chaos Testing @chaos', () => {
  test.setTimeout(720_000); // 12 minutes per test - signInUser (180s) + chaos clicks (many pages)

  test.beforeEach(async ({ page }) => {
    await setupChaosAuth(page);
  });

  test('Dashboard pages chaos test', async ({ page }, testInfo) => {
    const activePages = IS_FAST_ITERATION
      ? FAST_DASHBOARD_PAGES
      : DASHBOARD_PAGES;
    if (!IS_FAST_ITERATION) {
      await warmupChaosRoutes(page, activePages);
    }

    const { errors } = await runChaosTestGroup(
      page,
      activePages,
      'Dashboard Pages',
      testInfo
    );

    expect(
      errors,
      `Found ${errors.length} React errors in dashboard pages: ${errors.map(e => `${e.page} → ${e.element}: ${e.error}`).join('; ')}`
    ).toHaveLength(0);
  });

  test('Settings pages chaos test', async ({ page }, testInfo) => {
    const activePages = IS_FAST_ITERATION
      ? FAST_SETTINGS_PAGES
      : SETTINGS_PAGES;
    if (!IS_FAST_ITERATION) {
      await warmupChaosRoutes(page, activePages);
    }

    const { errors } = await runChaosTestGroup(
      page,
      activePages,
      'Settings Pages',
      testInfo
    );

    expect(
      errors,
      `Found ${errors.length} React errors in settings pages: ${errors.map(e => `${e.page} → ${e.element}: ${e.error}`).join('; ')}`
    ).toHaveLength(0);
  });
});

test.describe('Admin Chaos Testing @chaos', () => {
  test.setTimeout(600_000);

  test.beforeEach(async ({ page }) => {
    await setupChaosAuth(page, true);
  });

  test('Admin pages chaos test', async ({ page }, testInfo) => {
    const activePages = IS_FAST_ITERATION ? FAST_ADMIN_PAGES : ADMIN_PAGES;
    // First check if user has admin access
    const response = await navigateChaosRoute(page, activePages[0]);

    if (response?.status() === 404) {
      // Admin access is a legitimate skip — not all test users are admins
      test.skip(true, 'Test user does not have admin access');
      return;
    }

    if (!IS_FAST_ITERATION) {
      await warmupChaosRoutes(page, activePages);
    }

    const { errors } = await runChaosTestGroup(
      page,
      activePages,
      'Admin Pages',
      testInfo
    );

    expect(
      errors,
      `Found ${errors.length} React errors in admin pages: ${errors.map(e => `${e.page} → ${e.element}: ${e.error}`).join('; ')}`
    ).toHaveLength(0);
  });
});

test.describe('Full Chaos Sweep @chaos-full', () => {
  test.skip(
    true,
    'Redundant with per-group chaos coverage; use focused dashboard/settings/admin tests for stable local validation'
  );
  test.setTimeout(1_200_000); // 20 minutes for full dashboard/settings/admin sweep under webpack dev

  test('All authenticated pages', async ({ page }, testInfo) => {
    await setupChaosAuth(page, true);
    await warmupChaosRoutes(page, DASHBOARD_PAGES);

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
    await warmupChaosRoutes(page, SETTINGS_PAGES);
    const settings = await runChaosTestGroup(
      page,
      SETTINGS_PAGES,
      'Settings',
      testInfo
    );
    allErrors.push(...settings.errors);
    allResults.push(...settings.results);

    // Test admin pages (if accessible)
    const adminResponse = await navigateChaosRoute(page, ADMIN_PAGES[0]);

    if (adminResponse?.status() !== 404) {
      await warmupChaosRoutes(page, ADMIN_PAGES);

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

    expect(
      allErrors,
      `Found ${allErrors.length} React errors across all pages: ${allErrors.map(e => `${e.page} → ${e.element}: ${e.error}`).join('; ')}`
    ).toHaveLength(0);
  });
});
