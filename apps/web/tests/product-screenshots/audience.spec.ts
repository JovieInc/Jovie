/**
 * Product Screenshots – Audience CRM
 *
 * Captures the audience/fan table for marketing mockups.
 *
 * Usage:
 *   pnpm --filter web screenshots
 *
 * Output:
 *   public/product-screenshots/
 */

import { expect, test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';
import {
  hideTransientUI,
  OUTPUT_DIR,
  shouldSkipAuth,
  TIMEOUTS,
  waitForSettle,
} from './helpers';

test.describe('Product Screenshots – Audience CRM', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (shouldSkipAuth(testInfo)) return;
    await signInUser(page);
  });

  test('audience table – full view', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/app/dashboard/audience', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    // Wait for the audience client component to render
    const audienceClient = page.getByTestId('dashboard-audience-client');
    await expect(audienceClient).toBeVisible({
      timeout: TIMEOUTS.CONTENT_VISIBLE,
    });

    await waitForSettle(page);
    await hideTransientUI(page);

    await page.screenshot({
      path: `${OUTPUT_DIR}/audience-crm.png`,
      fullPage: false,
    });
    console.log('📸 Saved: audience-crm.png');
  });
});
