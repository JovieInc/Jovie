import { expect, test } from './setup';
import {
  assertNoCriticalErrors,
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
 * @smoke @critical
 */
test.describe('Homepage Smoke @smoke @critical', () => {
  test('homepage loads without server errors', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      const response = await page.goto('/', {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });

      // CRITICAL: Must not be a server error (5xx)
      const status = response?.status() ?? 0;
      expect(
        status,
        `Homepage returned ${status} - server error!`
      ).toBeLessThan(500);

      // Must return 200 OK
      expect(status, `Homepage returned ${status} - expected 200`).toBe(200);

      await page.waitForLoadState('domcontentloaded');

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('homepage renders main content', async ({ page }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await page.goto('/', { timeout: SMOKE_TIMEOUTS.NAVIGATION });
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
      const hydrationPatterns = [
        'Hydration failed',
        'hydration mismatch',
        'Text content does not match',
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

    await page.goto('/', { timeout: SMOKE_TIMEOUTS.NAVIGATION });

    await waitForHydration(page, { timeout: SMOKE_TIMEOUTS.VISIBILITY });

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
});
