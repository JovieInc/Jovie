import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  assertPageHealthy,
  assertPageRendered,
  elementVisible,
  isExpectedError,
  SMOKE_SELECTORS,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
  TEST_PROFILES,
  waitForHydration,
} from './utils/smoke-test-utils';

const baseUrl = (process.env.BASE_URL ?? 'http://localhost:3100').trim();
const baseHostname = (() => {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return '';
  }
})();
const isMarketingBaseUrl =
  baseHostname === 'meetjovie.com' ||
  baseHostname === 'www.meetjovie.com' ||
  baseUrl.includes('meetjovie.com');

const describePublicProfile = isMarketingBaseUrl
  ? test.describe.skip
  : test.describe;
const describeErrorHandling = isMarketingBaseUrl
  ? test.describe.skip
  : test.describe;

/**
 * Public Smoke Tests - No Authentication Required
 *
 * CRITICAL: These tests run BEFORE production deploys.
 * They verify public-facing pages load without errors.
 *
 * Consolidates:
 * - smoke.spec.ts (homepage, 404, critical pages)
 * - homepage-smoke.spec.ts (homepage load, content, hydration)
 * - smoke-required.spec.ts (public profile, homepage)
 * - public-profile-smoke.spec.ts (public profile, 404)
 * - smoke.profile.spec.ts (profile modes)
 *
 * @smoke @critical
 */
test.describe('Public Smoke Tests @smoke @critical', () => {
  // =========================================================================
  // HOMEPAGE TESTS
  // =========================================================================
  test.describe('Homepage', () => {
    test('loads without server errors', async ({ page }, testInfo) => {
      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        const response = await smokeNavigate(page, '/');

        // CRITICAL: Must not be a server error (5xx)
        const status = response?.status() ?? 0;
        expect(
          status,
          `Homepage returned ${status} - server error!`
        ).toBeLessThan(500);
        expect(status, `Homepage returned ${status} - expected 200`).toBe(200);

        await waitForHydration(page);
        await assertPageRendered(page);

        const context = getContext();
        await assertPageHealthy(page, context, testInfo);
      } finally {
        cleanup();
      }
    });

    test('renders main content with h1', async ({ page }, testInfo) => {
      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        await smokeNavigate(page, '/');
        await page.waitForLoadState('domcontentloaded');

        // Verify body has content (not blank page)
        const bodyContent = await page.locator('body').textContent();
        expect(
          bodyContent && bodyContent.length > 100,
          'Homepage body is empty or too short'
        ).toBe(true);

        // Verify main heading exists
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

    test('has no React hydration errors', async ({ page }, testInfo) => {
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

        if (isHydrationError && !isExpectedError(text)) {
          hydrationErrors.push(text);
        }
      });

      await smokeNavigate(page, '/');
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

  // =========================================================================
  // PUBLIC PROFILE TESTS
  // =========================================================================
  describePublicProfile('Public Profile', () => {
    test('loads and displays creator name', async ({ page }, testInfo) => {
      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        const response = await smokeNavigate(page, `/${TEST_PROFILES.DUALIPA}`);

        // Must not be a server error
        const status = response?.status() ?? 0;
        expect(status, `Expected <500 but got ${status}`).toBeLessThan(500);

        // Check if database is available
        const pageTitle = await page.title();
        const isTemporarilyUnavailable = pageTitle.includes(
          'temporarily unavailable'
        );
        const isNotFound = pageTitle
          .toLowerCase()
          .includes('profile not found');

        if (status === 200 && !isTemporarilyUnavailable) {
          expect(isNotFound, 'Expected profile to exist').toBe(false);

          // Verify page title contains creator name
          await expect(page).toHaveTitle(/Dua Lipa/i, {
            timeout: SMOKE_TIMEOUTS.VISIBILITY,
          });

          // Verify h1 displays creator name
          await expect(page.locator('h1')).toContainText('Dua Lipa', {
            timeout: SMOKE_TIMEOUTS.VISIBILITY,
          });

          // Verify profile image is visible
          const hasProfileAvatar = await elementVisible(
            page,
            SMOKE_SELECTORS.PROFILE_AVATAR
          );
          if (hasProfileAvatar) {
            await expect(
              page.locator(SMOKE_SELECTORS.PROFILE_AVATAR).first()
            ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
          } else {
            const hasExplicitImage = await elementVisible(
              page,
              'img[alt*="Dua Lipa"]'
            );
            if (hasExplicitImage) {
              await expect(
                page.locator('img[alt*="Dua Lipa"]').first()
              ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
            } else {
              const hasAnyImage = await elementVisible(page, 'img');
              expect(
                hasAnyImage,
                'Profile should have at least one image'
              ).toBe(true);
            }
          }
        } else {
          // For 404/400/temporarily unavailable, just verify page renders
          await page.waitForLoadState('domcontentloaded');
          const bodyContent = await page.locator('body').textContent();
          expect(bodyContent, 'Page should have content').toBeTruthy();
        }

        const context = getContext();
        await assertNoCriticalErrors(context, testInfo);
      } finally {
        cleanup();
      }
    });

    test('listen mode displays DSP options', async ({ page }, testInfo) => {
      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        const response = await smokeNavigate(
          page,
          `/${TEST_PROFILES.TAYLORSWIFT}?mode=listen`
        );

        // Must not be a server error
        const status = response?.status() ?? 0;
        expect(status, `Expected <500 but got ${status}`).toBeLessThan(500);

        await expect(page).toHaveURL(/\/taylorswift\?mode=listen/, {
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });

        const pageTitle = await page.title();
        const isTemporarilyUnavailable = pageTitle.includes(
          'temporarily unavailable'
        );
        const isNotFound = pageTitle
          .toLowerCase()
          .includes('profile not found');

        if (status === 200 && !isTemporarilyUnavailable) {
          expect(isNotFound, 'Expected profile to exist').toBe(false);

          const dspButtons = page.locator(
            'button[aria-label^="Open in"], button:has-text("Open in")'
          );

          await expect(dspButtons.first()).toBeVisible({
            timeout: SMOKE_TIMEOUTS.VISIBILITY,
          });
        } else {
          // For 404/400/temporarily unavailable, just verify page renders
          await page.waitForLoadState('domcontentloaded');
          const bodyContent = await page.locator('body').textContent();
          expect(bodyContent, 'Page should have content').toBeTruthy();
        }

        const context = getContext();
        await assertNoCriticalErrors(context, testInfo);
      } finally {
        cleanup();
      }
    });
  });

  // =========================================================================
  // 404 / ERROR HANDLING TESTS
  // =========================================================================
  describeErrorHandling('Error Handling', () => {
    test('404 for non-existent profile', async ({ page }, testInfo) => {
      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        const response = await smokeNavigate(
          page,
          '/nonexistent-handle-xyz-123'
        );
        const status = response?.status() ?? 0;

        // Should return 200, 400, or 404 - not a 500 server error
        expect(
          status < 500,
          `Expected non-5xx but got ${status} (server error)`
        ).toBe(true);

        await page.waitForLoadState('domcontentloaded');
        const bodyContent = await page.locator('body').textContent();
        expect(bodyContent, 'Page should have content').toBeTruthy();

        // Should not have server error indicators
        const bodyText = bodyContent?.toLowerCase() ?? '';
        expect(
          bodyText.includes('internal server error'),
          'Page should not show internal server error'
        ).toBe(false);

        const context = getContext();
        await assertNoCriticalErrors(context, testInfo);
      } finally {
        cleanup();
      }
    });

    test('unknown routes handled gracefully', async ({ page }, testInfo) => {
      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        const response = await smokeNavigate(page, '/non-existent-route-123');

        const status = response?.status() ?? 0;
        expect(
          status,
          `Expected non-5xx status but got ${status}`
        ).toBeLessThan(500);

        await page.waitForLoadState('domcontentloaded');
        const pageContent = await page.textContent('body');
        expect(pageContent, 'Page should have content').toBeTruthy();

        const context = getContext();
        await assertNoCriticalErrors(context, testInfo);
      } finally {
        cleanup();
      }
    });
  });

  // =========================================================================
  // CRITICAL PAGES TEST
  // =========================================================================
  test('critical pages respond without 500 errors', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);
    const routes = ['/', '/sign-up', '/pricing'];

    try {
      for (const route of routes) {
        const response = await smokeNavigate(page, route);

        const status = response?.status() ?? 0;
        expect(
          status,
          `Route ${route} returned status ${status} (server error)`
        ).toBeLessThan(500);

        await page.waitForLoadState('domcontentloaded');

        const bodyContent = await page.locator('body').textContent();
        expect(
          bodyContent && bodyContent.length > 50,
          `Route ${route} should have meaningful content`
        ).toBe(true);
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});
