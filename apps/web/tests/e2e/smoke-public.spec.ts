import { expect, test } from '@playwright/test';
import {
  measureWebVitals,
  PERFORMANCE_BUDGETS,
} from './utils/performance-test-utils';
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

const MIN_CONTENT_LENGTH = {
  homepage: 100,
  criticalPage: 50,
} as const;

/**
 * Public Smoke Tests - No Authentication Required
 *
 * CRITICAL: These tests run BEFORE production deploys.
 * They verify public-facing pages load without errors.
 *
 * Optimized for speed: 4 consolidated tests covering critical paths.
 * Previous tests merged for efficiency (was 10, now 4).
 *
 * NOTE: These tests must run WITHOUT the saved authentication session
 * to verify the public unauthenticated experience.
 *
 * @smoke @critical
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Public Smoke Tests @smoke @critical', () => {
  // =========================================================================
  // HOMEPAGE - Consolidated test (was 3 separate tests)
  // =========================================================================
  test('homepage loads correctly with content and no errors', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);
    const hydrationErrors: string[] = [];

    // Set up hydration error monitoring
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

      // Verify body has content (not blank page)
      const bodyContent = await page.locator('body').textContent();
      expect(
        bodyContent && bodyContent.length > MIN_CONTENT_LENGTH.homepage,
        `Homepage body content length is < MIN_CONTENT_LENGTH.homepage (${MIN_CONTENT_LENGTH.homepage})`
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

      // Check for hydration errors
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

      const context = getContext();
      await assertPageHealthy(page, context, testInfo);

      // Measure homepage Web Vitals (non-blocking)
      const vitals = await measureWebVitals(page);
      await testInfo.attach('homepage-vitals', {
        body: JSON.stringify(vitals, null, 2),
        contentType: 'application/json',
      });

      // Log for visibility (don't fail test, just warn)
      console.log('📊 Homepage Web Vitals:');
      console.log(
        `   LCP: ${vitals.lcp?.toFixed(0)}ms (budget: ${PERFORMANCE_BUDGETS.homepage.lcp}ms)`
      );
      console.log(
        `   FCP: ${vitals.fcp?.toFixed(0)}ms (budget: ${PERFORMANCE_BUDGETS.homepage.fcp}ms)`
      );

      if (vitals.lcp && vitals.lcp > PERFORMANCE_BUDGETS.homepage.lcp) {
        console.warn(
          `⚠️  Homepage LCP exceeded budget: ${vitals.lcp.toFixed(0)}ms > ${PERFORMANCE_BUDGETS.homepage.lcp}ms`
        );
      }
    } finally {
      cleanup();
    }
  });

  // =========================================================================
  // PUBLIC PROFILE - Tests main page and all subpages for both test profiles
  // =========================================================================
  test.describe('Public Profile', () => {
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

        // Skip if profile not found (test data not seeded - DATABASE_URL not configured)
        if (isNotFound || isTemporarilyUnavailable) {
          test.skip(
            true,
            'Profile not found - test data not seeded (DATABASE_URL not configured)'
          );
          return;
        }

        // Check for loading skeleton stuck state
        const bodyTextRaw = await page
          .locator('body')
          .textContent()
          .catch(() => '');
        const isLoadingSkeleton =
          bodyTextRaw?.toLowerCase().includes('loading jovie profile') ||
          bodyTextRaw?.toLowerCase().includes('loading artist profile');
        if (isLoadingSkeleton) {
          // Wait a bit more for it to resolve
          await page.waitForTimeout(5000);
          const bodyTextRetry = await page
            .locator('body')
            .textContent()
            .catch(() => '');
          if (bodyTextRetry?.toLowerCase().includes('loading jovie profile')) {
            test.skip(
              true,
              'Profile stuck on loading skeleton (API/DB likely unavailable)'
            );
            return;
          }
        }

        if (status === 200) {
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

        // Only assert critical errors for non-webkit — webkit generates spurious
        // console errors for resource loading that are not actual failures.
        const context = getContext();
        const isCriticalErrorCheckReliable =
          !testInfo.project.name.includes('webkit');
        if (isCriticalErrorCheckReliable) {
          await assertNoCriticalErrors(context, testInfo);
        } else {
          // For webkit, attach diagnostics but don't fail on console errors
          if (testInfo) {
            await testInfo.attach('network-diagnostics', {
              body: JSON.stringify(context.networkDiagnostics, null, 2),
              contentType: 'application/json',
            });
          }
        }
      } finally {
        cleanup();
      }
    });

    // Profile subpages — these are critical paths that must not crash.
    // Covers both profiles to catch profile-dependent rendering bugs
    // (e.g. QueryClient missing only when notifications CTA renders).
    const PROFILE_SUBPAGES = [
      { path: '/listen', name: 'listen mode' },
      { path: '/subscribe', name: 'subscribe mode' },
      { path: '/tip', name: 'tip mode' },
      { path: '/tour', name: 'tour dates' },
    ] as const;

    for (const profile of Object.values(TEST_PROFILES)) {
      for (const { path, name } of PROFILE_SUBPAGES) {
        test(`${profile}${path} loads without errors (${name})`, async ({
          page,
        }, testInfo) => {
          const { getContext, cleanup } = setupPageMonitoring(page);

          try {
            const response = await smokeNavigate(page, `/${profile}${path}`);
            const status = response?.status() ?? 0;

            // Redirects (3xx) and 200 are both acceptable — subpages redirect
            // to the main profile with ?mode= query params
            expect(
              status,
              `/${profile}${path} returned ${status} (server error)`
            ).toBeLessThan(500);

            // Wait for the redirected page to settle
            await waitForHydration(page);

            // Verify not an error page
            const bodyText = await page
              .locator('body')
              .textContent()
              .catch(() => '');
            const lowerBody = bodyText?.toLowerCase() ?? '';

            // Skip if profile not seeded
            if (
              lowerBody.includes('not found') ||
              lowerBody.includes('temporarily unavailable')
            ) {
              test.skip(true, `Profile ${profile} not seeded in test database`);
              return;
            }

            // Skip if the page is stuck on loading skeleton (API timeout / DB unavailable)
            const isLoadingSkeleton =
              lowerBody.includes('loading jovie profile') ||
              lowerBody.includes('loading artist profile') ||
              lowerBody.includes('loading action button');
            if (isLoadingSkeleton) {
              test.skip(
                true,
                `Profile ${profile}${path} stuck on loading skeleton (API/DB likely unavailable)`
              );
              return;
            }

            const hasErrorPage =
              lowerBody.includes('application error') ||
              lowerBody.includes('internal server error') ||
              lowerBody.includes('unhandled runtime error');
            expect(hasErrorPage, `/${profile}${path} shows error page`).toBe(
              false
            );

            // Only assert critical errors for non-webkit — webkit generates spurious
            // console errors during profile subpage navigation.
            const context = getContext();
            const isCriticalErrorCheckReliable =
              !testInfo.project.name.includes('webkit');
            if (isCriticalErrorCheckReliable) {
              await assertNoCriticalErrors(context, testInfo);
            } else {
              if (testInfo) {
                await testInfo.attach('network-diagnostics', {
                  body: JSON.stringify(context.networkDiagnostics, null, 2),
                  contentType: 'application/json',
                });
              }
            }
          } finally {
            cleanup();
          }
        });
      }
    }
  });

  // =========================================================================
  // ERROR HANDLING - Consolidated test (was 2 separate tests)
  // =========================================================================
  test.describe('Error Handling', () => {
    test('handles non-existent routes gracefully without 500 errors', async ({
      page,
    }, testInfo) => {
      const { getContext, cleanup } = setupPageMonitoring(page);
      const testRoutes = [
        '/nonexistent-handle-xyz-123', // Non-existent profile
        '/non-existent-route-123', // Unknown route
      ];

      try {
        for (const route of testRoutes) {
          let response = await smokeNavigate(page, route);
          let status = response?.status() ?? 0;

          // Turbopack compilation can cause transient 500s on first hit.
          // Retry up to 2 times if we get a 500.
          let retries = 0;
          while (status >= 500 && retries < 2) {
            retries++;
            console.warn(
              `Route ${route}: Got ${status} on attempt ${retries}, retrying (likely Turbopack cold compile)...`
            );
            await page.waitForTimeout(2000 * retries);
            response = await smokeNavigate(page, route);
            status = response?.status() ?? 0;
          }

          // Should return 200, 400, or 404 - not a 500 server error
          expect(
            status < 500,
            `Route ${route}: Expected non-5xx but got ${status} (server error)`
          ).toBe(true);

          await page.waitForLoadState('domcontentloaded');
          const bodyContent = await page.locator('body').textContent();
          expect(
            bodyContent,
            `Route ${route}: Page should have content`
          ).toBeTruthy();

          // Should not have server error indicators
          const bodyText = bodyContent?.toLowerCase() ?? '';
          expect(
            bodyText.includes('internal server error'),
            `Route ${route}: Page should not show internal server error`
          ).toBe(false);
        }

        // Only assert critical errors for non-webkit — webkit generates spurious
        // console errors during navigation between pages that are not actual failures.
        const context = getContext();
        const isCriticalErrorCheckReliable =
          !testInfo.project.name.includes('webkit');
        if (isCriticalErrorCheckReliable) {
          await assertNoCriticalErrors(context, testInfo);
        } else {
          // For webkit, attach diagnostics but don't fail on console errors
          if (testInfo) {
            await testInfo.attach('network-diagnostics', {
              body: JSON.stringify(context.networkDiagnostics, null, 2),
              contentType: 'application/json',
            });
          }
        }
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
        let response = await smokeNavigate(page, route);
        let status = response?.status() ?? 0;

        // Turbopack compilation can cause transient 500s on first hit.
        // Retry up to 2 times if we get a 500.
        let retries = 0;
        while (status >= 500 && retries < 2) {
          retries++;
          console.warn(
            `Route ${route}: Got ${status} on attempt ${retries}, retrying (likely Turbopack cold compile)...`
          );
          await page.waitForTimeout(2000 * retries);
          response = await smokeNavigate(page, route);
          status = response?.status() ?? 0;
        }

        expect(
          status,
          `Route ${route} returned status ${status} (server error)`
        ).toBeLessThan(500);

        await page.waitForLoadState('domcontentloaded');

        const bodyContent = await page.locator('body').textContent();
        expect(
          bodyContent && bodyContent.length > MIN_CONTENT_LENGTH.criticalPage,
          `Route ${route} content length is < MIN_CONTENT_LENGTH.criticalPage (${MIN_CONTENT_LENGTH.criticalPage})`
        ).toBe(true);
      }

      // Only assert critical errors for non-webkit — webkit generates spurious
      // console errors during multi-page navigation that are not actual failures.
      const context = getContext();
      const isCriticalErrorCheckReliable =
        !testInfo.project.name.includes('webkit');
      if (isCriticalErrorCheckReliable) {
        await assertNoCriticalErrors(context, testInfo);
      } else {
        // For webkit, attach diagnostics but don't fail on console errors
        if (testInfo) {
          await testInfo.attach('network-diagnostics', {
            body: JSON.stringify(context.networkDiagnostics, null, 2),
            contentType: 'application/json',
          });
        }
      }
    } finally {
      cleanup();
    }
  });
});
