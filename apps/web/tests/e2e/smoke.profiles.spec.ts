import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  PUBLIC_HANDLES,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigate,
} from './utils/smoke-test-utils';

/**
 * Public profile smoke tests
 * Verifies that public profile pages load and render correctly.
 * Uses seeded test profiles from global-setup.ts.
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
        const primaryCtas = page.locator('[data-testid="primary-cta"]');
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
  });
}
