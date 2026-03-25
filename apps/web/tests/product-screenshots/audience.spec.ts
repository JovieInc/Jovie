/**
 * Product Screenshots – Audience CRM
 *
 * Captures the audience/fan table for marketing mockups. Uses the
 * /demo/audience route which renders the real audience table with
 * mock data — no auth required.
 *
 * Usage:
 *   pnpm --filter web screenshots
 *
 * Output:
 *   public/product-screenshots/
 */

import { test } from '@playwright/test';
import {
  assertNoDevOverlays,
  hideTransientUI,
  OUTPUT_DIR,
  TIMEOUTS,
  waitForSettle,
} from './helpers';

test.describe('Product Screenshots – Audience CRM', () => {
  test('audience table – full view', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/demo/audience', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    // Wait for the audience table to render
    await page
      .locator('table, [role="grid"], [data-testid="unified-table"]')
      .first()
      .waitFor({ state: 'visible', timeout: TIMEOUTS.CONTENT_VISIBLE });

    await waitForSettle(page);
    await hideTransientUI(page);
    await assertNoDevOverlays(page);

    await page.screenshot({
      path: `${OUTPUT_DIR}/audience-crm.png`,
      fullPage: false,
    });
    console.log('📸 Saved: audience-crm.png');
  });
});
