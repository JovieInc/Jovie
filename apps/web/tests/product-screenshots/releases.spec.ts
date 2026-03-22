/**
 * Product Screenshots – Releases Dashboard
 *
 * Generates high-quality screenshots of the releases dashboard for use in
 * marketing pages. These are NOT assertion-based tests; they exist solely
 * to produce screenshot artifacts.
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
  waitForImages,
  waitForSettle,
} from './helpers';

test.describe('Product Screenshots – Releases Dashboard', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (shouldSkipAuth(testInfo)) return;
    await signInUser(page);
  });

  test('releases table – full view', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: TIMEOUTS.CONTENT_VISIBLE });
    await waitForImages(page, 'table');
    await waitForSettle(page);
    await hideTransientUI(page);

    await page.screenshot({
      path: `${OUTPUT_DIR}/releases-dashboard-full.png`,
      fullPage: false,
    });
    console.log('📸 Saved: releases-dashboard-full.png');
  });

  test('releases table – with sidebar open', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: TIMEOUTS.CONTENT_VISIBLE });
    await waitForImages(page, 'table');
    await waitForSettle(page, 2000);

    // Click on the first release row to open the sidebar
    const firstRow = page.locator('tbody tr').first();
    await firstRow.click();

    const sidebar = page.getByTestId('release-sidebar');
    await expect(sidebar).toBeVisible({ timeout: TIMEOUTS.SIDEBAR_VISIBLE });
    await waitForImages(page, '[data-testid="release-sidebar"]');
    await waitForSettle(page);
    await hideTransientUI(page);

    await page.screenshot({
      path: `${OUTPUT_DIR}/releases-dashboard-sidebar.png`,
      fullPage: false,
    });
    console.log('📸 Saved: releases-dashboard-sidebar.png');

    await sidebar.screenshot({
      path: `${OUTPUT_DIR}/release-sidebar-detail.png`,
    });
    console.log('📸 Saved: release-sidebar-detail.png');
  });
});
