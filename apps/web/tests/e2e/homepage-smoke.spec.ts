import { expect, test } from './setup';
import {
  assertNoCriticalErrors,
  elementVisible,
  isExpectedError,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  waitForHydration,
} from './utils/smoke-test-utils';

/**
 * Homepage Smoke Test
 *
 * CRITICAL: This test runs BEFORE production deploys to prevent broken homepages
 * from reaching production. It verifies the homepage renders without errors.
 *
 * If this test fails, the deploy will be blocked.
 *
 * Hardened for reliability:
 * - Uses shared error filtering from smoke-test-utils
 * - Uses proper hydration wait instead of arbitrary timeouts
 * - Consistent timeout constants
 * - Enhanced error diagnostics
 *
 * @smoke
 * @critical
 */
test.describe('Homepage Smoke @smoke @critical', () => {
  test('homepage loads without server errors', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      // Navigate to homepage
      const response = await page.goto('/', {
        timeout: SMOKE_TIMEOUTS.NAVIGATION * 2, // Extra time for critical test
      });

      // CRITICAL: Must not be a server error (5xx)
      const status = response?.status() ?? 0;
      expect(
        status,
        `Homepage returned ${status} - server error!`
      ).toBeLessThan(500);

      // Must return 200 OK
      expect(status, `Homepage returned ${status} - expected 200`).toBe(200);

      // Wait for page to be interactive
      await page.waitForLoadState('domcontentloaded');

      // Get context and assert no unexpected console errors
      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('homepage renders main content', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await page.goto('/', { timeout: SMOKE_TIMEOUTS.NAVIGATION * 2 });
      await page.waitForLoadState('domcontentloaded');

      // Verify body has content (not blank page)
      const bodyContent = await page.locator('body').textContent();
      expect(
        bodyContent && bodyContent.length > 100,
        'Homepage body is empty or too short'
      ).toBe(true);

      // Verify main heading exists (h1)
      const h1 = page.locator('h1').first();
      await expect(h1, 'Homepage missing h1 heading').toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      // Verify it's not an error page
      const pageText = bodyContent?.toLowerCase() ?? '';
      const errorIndicators = [
        'application error',
        'internal server error',
        'something went wrong',
        'unhandled runtime error',
      ];

      const hasErrorIndicator = errorIndicators.some(indicator =>
        pageText.includes(indicator)
      );

      expect(hasErrorIndicator, 'Homepage shows error message').toBe(false);

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('homepage has no React hydration errors', async ({ page }, testInfo) => {
    const hydrationErrors: string[] = [];

    page.on('console', msg => {
      const text = msg.text();
      // Check for hydration-specific errors (not covered by general filtering)
      const hydrationPatterns = [
        'Hydration failed',
        'hydration mismatch',
        'Text content does not match',
        'did not match',
        'server rendered HTML',
      ];

      const isHydrationError = hydrationPatterns.some(pattern =>
        text.toLowerCase().includes(pattern.toLowerCase())
      );

      // Only track actual hydration errors, not expected ones
      if (isHydrationError && !isExpectedError(text)) {
        hydrationErrors.push(text);
      }
    });

    await page.goto('/', { timeout: SMOKE_TIMEOUTS.NAVIGATION * 2 });

    // Wait for hydration to complete properly instead of arbitrary timeout
    await waitForHydration(page, { timeout: SMOKE_TIMEOUTS.VISIBILITY });

    // Attach hydration errors for debugging if any found
    if (hydrationErrors.length > 0 && testInfo) {
      await testInfo.attach('hydration-errors', {
        body: hydrationErrors.join('\n'),
        contentType: 'text/plain',
      });
    }

    expect(
      hydrationErrors,
      `Homepage has hydration errors: ${hydrationErrors.join(', ')}`
    ).toHaveLength(0);
  });

  test('homepage critical elements are visible', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await page.goto('/', { timeout: SMOKE_TIMEOUTS.NAVIGATION * 2 });
      await page.waitForLoadState('domcontentloaded');

      // Verify page has substantial content (not blank)
      const bodyText = await page.locator('body').textContent();
      expect(
        bodyText && bodyText.length > 100,
        'Homepage body is empty or too short'
      ).toBe(true);

      // Check for logo using data-testid (more reliable than generic svg/img selector)
      // First try the data-testid approach (preferred)
      const hasLogoByTestId = await elementVisible(
        page,
        '[data-testid="site-logo"]',
        {
          timeout: SMOKE_TIMEOUTS.QUICK,
        }
      );
      const hasLogoLinkByTestId = await elementVisible(
        page,
        '[data-testid="site-logo-link"]',
        {
          timeout: SMOKE_TIMEOUTS.QUICK,
        }
      );

      // Fallback to generic selector if data-testid not found (backwards compatibility)
      const hasLogoGeneric =
        !hasLogoByTestId &&
        ((await elementVisible(page, 'svg', {
          timeout: SMOKE_TIMEOUTS.QUICK,
        })) ||
          (await elementVisible(page, 'img', {
            timeout: SMOKE_TIMEOUTS.QUICK,
          })));

      expect(
        hasLogoByTestId || hasLogoLinkByTestId || hasLogoGeneric,
        'Homepage missing logo/icon'
      ).toBe(true);

      // Check for main CTA or navigation using robust checks
      const hasButton = await elementVisible(page, 'button', {
        timeout: SMOKE_TIMEOUTS.QUICK,
      });
      const hasLink = await elementVisible(page, 'a[href]', {
        timeout: SMOKE_TIMEOUTS.QUICK,
      });

      expect(
        hasButton || hasLink,
        'Homepage missing interactive elements'
      ).toBe(true);

      // Check for header navigation
      const hasHeader = await elementVisible(
        page,
        '[data-testid="header-nav"]',
        {
          timeout: SMOKE_TIMEOUTS.QUICK,
        }
      );
      expect(hasHeader, 'Homepage missing header navigation').toBe(true);

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});
