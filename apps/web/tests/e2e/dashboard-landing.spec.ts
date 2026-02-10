import { Page } from '@playwright/test';
import { expect, test } from './setup';
import { SMOKE_TIMEOUTS } from './utils/smoke-test-utils';

/**
 * Checks if a page has rendered meaningful content.
 * Tries multiple selectors, falling back to body text length.
 */
async function hasPageContent(
  page: Page,
  timeout = SMOKE_TIMEOUTS.VISIBILITY
): Promise<boolean> {
  const selectors = [
    page.locator('main').first(),
    page.getByRole('heading').first(),
    page.locator('[data-testid]').first(),
    page.locator('nav').first(),
  ];

  for (const selector of selectors) {
    const isVisible = await selector
      .isVisible({ timeout: timeout / 2 })
      .catch(() => false);
    if (isVisible) return true;
  }

  // Fallback: check body has meaningful text (>100 chars)
  const bodyText = await page.locator('body').textContent();
  return (bodyText?.trim().length ?? 0) > 100;
}

/**
 * Dashboard Landing Smoke Tests (ENG-002)
 *
 * Verifies that authenticated users can access the dashboard
 * without being redirected back to onboarding.
 *
 * Note: /app/dashboard is a legacy redirect to /.
 * Tests use /app/dashboard/profile which is the actual dashboard page.
 *
 * @smoke
 */

test.describe('Dashboard Landing @smoke', () => {
  // Dashboard pages need Turbopack cold compile (30-55s) + Clerk JS load
  test.setTimeout(180_000);

  // The actual dashboard page (legacy /app/dashboard redirects to /)
  const DASHBOARD_PAGE = '/app/dashboard/profile';

  test.beforeEach(async ({ page, context }) => {
    // Set onboarding completion cookie to bypass redirect check in proxy.ts
    // This simulates a user who has just completed onboarding
    await context.addCookies([
      {
        name: 'jovie_onboarding_complete',
        value: '1',
        domain: 'localhost',
        path: '/',
        httpOnly: false,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    // Mock authentication for testing
    await page.route('**/api/auth/**', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ authenticated: true }),
      });
    });
  });

  test('dashboard page loads without redirect to onboarding', async ({
    page,
  }) => {
    // Track all navigations to detect redirect loops
    const navigatedUrls: string[] = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        navigatedUrls.push(frame.url());
      }
    });

    await page.goto(DASHBOARD_PAGE, {
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded',
    });
    await page.waitForLoadState('load', { timeout: 60_000 }).catch(() => {});

    // Wait for URL to stabilize
    const currentUrl = page.url();

    // Should NOT redirect to onboarding
    expect(currentUrl).not.toContain('/onboarding');

    // Verify onboarding page was never loaded during navigation
    const wentToOnboarding = navigatedUrls.some(url =>
      url.includes('/onboarding')
    );
    expect(
      wentToOnboarding,
      `Redirect loop detected. Navigation history: ${navigatedUrls.join(' -> ')}`
    ).toBe(false);
  });

  test('dashboard does not flash onboarding page', async ({ page }) => {
    // Track all navigations
    const navigatedUrls: string[] = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        navigatedUrls.push(frame.url());
      }
    });

    await page.goto(DASHBOARD_PAGE, {
      timeout: 120_000,
      waitUntil: 'domcontentloaded',
    });
    // Best-effort wait for full load — may exceed timeout on Turbopack cold compile
    await page.waitForLoadState('load', { timeout: 60_000 }).catch(() => {});

    // Verify onboarding page was never loaded
    const wentToOnboarding = navigatedUrls.some(url =>
      url.includes('/onboarding')
    );
    expect(wentToOnboarding).toBe(false);

    // Also verify no waitlist redirect
    const wentToWaitlist = navigatedUrls.some(url => url.includes('/waitlist'));
    expect(wentToWaitlist).toBe(false);
  });

  test('dashboard content is visible after navigation', async ({ page }) => {
    await page.goto(DASHBOARD_PAGE, {
      timeout: 120_000,
      waitUntil: 'domcontentloaded',
    });
    await page.waitForLoadState('load', { timeout: 60_000 }).catch(() => {});

    // Wait for any loading states to complete
    await page.waitForLoadState('networkidle').catch(() => {
      // networkidle may timeout, continue anyway
    });

    // Verify dashboard rendered content (not blank)
    const hasContent = await hasPageContent(page);
    expect(hasContent, 'Dashboard should show content, not be blank').toBe(
      true
    );
  });

  test('onboarding completion cookie bypasses redirect loop', async ({
    page,
  }) => {
    // Simulate the cookie that gets set after onboarding completion
    await page.context().addCookies([
      {
        name: 'jovie_onboarding_complete',
        value: '1',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    // Track navigations
    const navigatedUrls: string[] = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        navigatedUrls.push(frame.url());
      }
    });

    await page.goto(DASHBOARD_PAGE, {
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded',
    });
    await page.waitForLoadState('load', { timeout: 60_000 }).catch(() => {});

    // With the cookie set, user should NOT be redirected to onboarding
    const wentToOnboarding = navigatedUrls.some(url =>
      url.includes('/onboarding')
    );
    expect(
      wentToOnboarding,
      'Onboarding completion cookie should prevent redirect'
    ).toBe(false);
  });

  test('multiple dashboard page loads do not cause redirect loops', async ({
    page,
  }) => {
    // Load dashboard multiple times to ensure no accumulating redirect issues
    for (let i = 0; i < 2; i++) {
      let navigationSuccess = false;
      let retries = 2;

      while (!navigationSuccess && retries > 0) {
        try {
          await page.goto(DASHBOARD_PAGE, {
            timeout: SMOKE_TIMEOUTS.NAVIGATION,
            waitUntil: 'domcontentloaded',
          });
          navigationSuccess = true;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('ERR_ABORTED') && retries > 1) {
            await page.waitForTimeout(500);
            retries--;
          } else {
            throw error;
          }
        }
      }

      await page.waitForLoadState('load', { timeout: 60_000 }).catch(() => {});

      const currentUrl = page.url();
      expect(
        currentUrl,
        `Load ${i + 1}: Should not redirect to onboarding`
      ).not.toContain('/onboarding');
    }
  });
});
