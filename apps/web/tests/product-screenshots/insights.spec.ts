/**
 * Product Screenshots – Insights Dashboard
 *
 * Captures the analytics/insights page for marketing mockups.
 *
 * Usage:
 *   pnpm --filter web screenshots
 *
 * Output:
 *   public/product-screenshots/
 */

import { test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';
import {
  hideTransientUI,
  OUTPUT_DIR,
  shouldSkipAuth,
  TIMEOUTS,
  waitForSettle,
} from './helpers';

test.describe('Product Screenshots – Insights Dashboard', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (shouldSkipAuth(testInfo)) return;
    await signInUser(page);
  });

  test('insights dashboard – full view', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/app/dashboard/insights', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    // Wait for the insights content to render — look for heading or insight cards
    await page
      .locator('h1, h2, [data-testid="insights-panel"]')
      .first()
      .waitFor({ state: 'visible', timeout: TIMEOUTS.CONTENT_VISIBLE });

    await waitForSettle(page);
    await hideTransientUI(page);

    await page.screenshot({
      path: `${OUTPUT_DIR}/insights-dashboard.png`,
      fullPage: false,
    });
    console.log('📸 Saved: insights-dashboard.png');
  });
});
