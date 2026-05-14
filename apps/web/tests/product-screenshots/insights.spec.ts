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

import { expect, test } from '@playwright/test';
import {
  hideTransientUI,
  OUTPUT_DIR,
  TIMEOUTS,
  waitForSettle,
} from './helpers';

test.describe('Product Screenshots – Insights Dashboard', () => {
  test('insights dashboard – full view', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/demo/showcase/analytics', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    // Use demo showcase route so screenshots remain auth-free in CI.
    await page
      .locator('[data-testid="demo-showcase-analytics"]')
      .waitFor({ state: 'visible', timeout: TIMEOUTS.CONTENT_VISIBLE });

    await waitForSettle(page);
    await hideTransientUI(page);

    const screenshotPath = `${OUTPUT_DIR}/insights-dashboard.png`;
    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
    });
    expect(screenshotPath).toBeTruthy();
  });
});
