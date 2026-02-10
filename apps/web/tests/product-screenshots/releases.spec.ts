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
 *   tests/product-screenshots/output/
 */

import { expect, Page, test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';

const TIMEOUTS = {
  NAVIGATION: 90_000,
  MATRIX_VISIBLE: 20_000,
  SIDEBAR_VISIBLE: 10_000,
  SETTLE: 3_000,
} as const;

const OUTPUT_DIR = 'tests/product-screenshots/output';

/** Wait for network to settle and animations to finish */
async function waitForSettle(page: Page, ms: number = TIMEOUTS.SETTLE) {
  // Wait for network idle
  await page.waitForLoadState('networkidle').catch(() => {});
  // Extra pause for CSS transitions / lazy images
  await page.waitForTimeout(ms);
}

/** Hide transient UI that shouldn't appear in marketing screenshots */
async function hideTransientUI(page: Page) {
  await page.evaluate(() => {
    // Hide toast notifications
    document.querySelectorAll('[data-sonner-toaster]').forEach(el => {
      (el as HTMLElement).style.display = 'none';
    });
    // Hide any cookie banners
    document.querySelectorAll('[data-cookie-banner]').forEach(el => {
      (el as HTMLElement).style.display = 'none';
    });
    // Hide Clerk user button tooltip if visible
    document.querySelectorAll('[role="tooltip"]').forEach(el => {
      (el as HTMLElement).style.display = 'none';
    });
    // Hide any intercom/support widgets
    document
      .querySelectorAll('#intercom-container, .intercom-lightweight-app')
      .forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
  });
}

test.describe('Product Screenshots – Releases Dashboard', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Skip if auth credentials aren't available
    if (
      !process.env.E2E_CLERK_USER_USERNAME ||
      !process.env.E2E_CLERK_USER_PASSWORD
    ) {
      console.warn('⚠ Skipping: E2E credentials not configured');
      testInfo.skip();
      return;
    }
    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      console.warn('⚠ Skipping: Clerk testing setup was not successful');
      testInfo.skip();
      return;
    }

    await signInUser(page);
  });

  test('releases table – full view', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    // Wait for the releases matrix to appear
    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: TIMEOUTS.MATRIX_VISIBLE });

    // Wait for artwork images to load
    await page.waitForFunction(
      () => {
        const images = document.querySelectorAll('table img');
        return (
          images.length > 0 &&
          Array.from(images).every(
            img =>
              (img as HTMLImageElement).complete &&
              (img as HTMLImageElement).naturalWidth > 0
          )
        );
      },
      { timeout: TIMEOUTS.MATRIX_VISIBLE }
    );

    await waitForSettle(page);
    await hideTransientUI(page);

    // Screenshot the full page
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

    // Wait for the releases matrix
    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: TIMEOUTS.MATRIX_VISIBLE });

    // Wait for artwork images to finish loading
    await page.waitForFunction(
      () => {
        const images = document.querySelectorAll('table img');
        return (
          images.length > 0 &&
          Array.from(images).every(
            img =>
              (img as HTMLImageElement).complete &&
              (img as HTMLImageElement).naturalWidth > 0
          )
        );
      },
      { timeout: TIMEOUTS.MATRIX_VISIBLE }
    );

    await waitForSettle(page, 2000);

    // Click on the first release row to open the sidebar.
    // The table supports direct row click via onRowClick={onEdit}.
    const firstRow = page.locator('tbody tr').first();
    await firstRow.click();

    // Wait for the sidebar to appear
    const sidebar = page.getByTestId('release-sidebar');
    await expect(sidebar).toBeVisible({ timeout: TIMEOUTS.SIDEBAR_VISIBLE });

    // Wait for sidebar artwork to load
    await page.waitForFunction(
      () => {
        const sidebar = document.querySelector(
          '[data-testid="release-sidebar"]'
        );
        if (!sidebar) return false;
        const images = sidebar.querySelectorAll('img');
        return (
          images.length > 0 &&
          Array.from(images).every(
            img =>
              (img as HTMLImageElement).complete &&
              (img as HTMLImageElement).naturalWidth > 0
          )
        );
      },
      { timeout: TIMEOUTS.SIDEBAR_VISIBLE }
    );

    await waitForSettle(page);
    await hideTransientUI(page);

    // Screenshot with sidebar open
    await page.screenshot({
      path: `${OUTPUT_DIR}/releases-dashboard-sidebar.png`,
      fullPage: false,
    });
    console.log('📸 Saved: releases-dashboard-sidebar.png');

    // Also capture just the sidebar as a standalone image
    await sidebar.screenshot({
      path: `${OUTPUT_DIR}/release-sidebar-detail.png`,
    });
    console.log('📸 Saved: release-sidebar-detail.png');
  });
});
