import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  PUBLIC_HANDLES,
  SMOKE_SELECTORS,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
} from './utils/smoke-test-utils';

/**
 * Public profile smoke tests
 * Verifies that public profile pages load and render correctly.
 * Uses seeded test profiles from global-setup.ts.
 *
 * Hardened for reliability:
 * - Uses data-testid selectors where available
 * - Uses shared monitoring utilities
 * - Enhanced error diagnostics
 */
for (const handle of PUBLIC_HANDLES) {
  test.describe(`Public profile: /${handle} @smoke`, () => {
    test(`renders and shows primary CTA @smoke`, async ({ page }, testInfo) => {
      const dbUrl = process.env.DATABASE_URL || '';
      if (!dbUrl || dbUrl.includes('dummy')) {
        test.skip();
      }

      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        const res = await smokeNavigate(page, `/${handle}`);
        expect(res?.ok(), `HTTP status not OK for /${handle}`).toBeTruthy();

        // Title should include content (display name or handle)
        await expect(page).toHaveTitle(/.+/, {
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });

        // Exactly one primary CTA container should be present
        const primaryCtas = page.locator(SMOKE_SELECTORS.PRIMARY_CTA);
        await expect(primaryCtas).toHaveCount(1, {
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
        await expect(primaryCtas.first()).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });

        // Assert no critical console errors
        const context = getContext();
        await assertNoCriticalErrors(context, testInfo);
      } finally {
        cleanup();
      }
    });

    test(`page structure is correct @smoke`, async ({ page }, testInfo) => {
      const dbUrl = process.env.DATABASE_URL || '';
      if (!dbUrl || dbUrl.includes('dummy')) {
        test.skip();
      }

      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        const res = await smokeNavigate(page, `/${handle}`);

        // Must not be server error
        const status = res?.status() ?? 0;
        expect(
          status,
          `/${handle} should not return server error`
        ).toBeLessThan(500);

        if (status === 200) {
          // Should have a heading
          const heading = page.locator('h1').first();
          await expect(heading).toBeVisible({
            timeout: SMOKE_TIMEOUTS.VISIBILITY,
          });

          // Should have main content area
          const mainContent = page
            .locator(SMOKE_SELECTORS.MAIN_CONTENT)
            .first();
          await expect(mainContent).toBeVisible({
            timeout: SMOKE_TIMEOUTS.VISIBILITY,
          });
        }

        const context = getContext();
        await assertNoCriticalErrors(context, testInfo);
      } finally {
        cleanup();
      }
    });
  });
}

test.describe('All public profiles @smoke', () => {
  test('all seeded profiles respond without server errors @smoke', async ({
    page,
  }, testInfo) => {
    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl || dbUrl.includes('dummy')) {
      test.skip();
    }

    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      for (const handle of PUBLIC_HANDLES) {
        const res = await smokeNavigate(page, `/${handle}`);
        const status = res?.status() ?? 0;

        expect(
          status,
          `Profile /${handle} returned ${status} (server error)`
        ).toBeLessThan(500);

        // Wait for DOM to be ready before moving to next profile
        await page.waitForLoadState('domcontentloaded');
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});
