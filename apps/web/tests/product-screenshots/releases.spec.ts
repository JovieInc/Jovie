/**
 * Product Screenshots – Releases Dashboard
 *
 * Generates high-quality screenshots of the releases dashboard for use in
 * marketing pages. Uses the /demo route which renders the real
 * ReleasesExperience component with mock data — no auth required.
 *
 * Usage:
 *   pnpm --filter web screenshots
 *
 * Output:
 *   public/product-screenshots/
 */

import { expect, test } from '@playwright/test';
import {
  assertNoDevOverlays,
  hideTransientUI,
  OUTPUT_DIR,
  TIMEOUTS,
  waitForImages,
  waitForSettle,
} from './helpers';

test.describe('Product Screenshots – Releases Dashboard', () => {
  test('releases table – full view', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/demo', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: TIMEOUTS.CONTENT_VISIBLE });
    // Some demo releases have no artwork — don't block on missing images
    await waitForImages(page, 'table').catch(() => {
      console.log('⚠ Some table images may not have loaded, continuing...');
    });
    await waitForSettle(page);
    await hideTransientUI(page);
    await assertNoDevOverlays(page);

    await page.screenshot({
      path: `${OUTPUT_DIR}/releases-dashboard-full.png`,
      fullPage: false,
    });
    console.log('📸 Saved: releases-dashboard-full.png');
  });

  test('releases table – with sidebar open', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/demo', {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });

    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: TIMEOUTS.CONTENT_VISIBLE });
    await waitForImages(page, 'table').catch(() => {
      console.log('⚠ Some table images may not have loaded, continuing...');
    });
    await waitForSettle(page, 2000);

    // Click on the first release row to open the sidebar
    const firstRow = page.locator('tbody tr').first();
    await firstRow.click();

    const sidebar = page.getByTestId('release-sidebar');
    await expect(sidebar).toBeVisible({ timeout: TIMEOUTS.SIDEBAR_VISIBLE });
    await waitForImages(page, '[data-testid="release-sidebar"]').catch(() => {
      console.log('⚠ Some sidebar images may not have loaded, continuing...');
    });
    await waitForSettle(page);
    await hideTransientUI(page);
    await assertNoDevOverlays(page);

    await page.screenshot({
      path: `${OUTPUT_DIR}/releases-dashboard-sidebar.png`,
      fullPage: false,
    });
    console.log('📸 Saved: releases-dashboard-sidebar.png');

    await sidebar.screenshot({
      path: `${OUTPUT_DIR}/release-sidebar-detail.png`,
    });
    console.log('📸 Saved: release-sidebar-detail.png');

    const platformsTab = sidebar.getByTestId('drawer-tab-dsps');
    await expect(platformsTab).toBeVisible({
      timeout: TIMEOUTS.CONTENT_VISIBLE,
    });
    await platformsTab.click();
    await expect(platformsTab).toHaveAttribute('aria-selected', 'true');
    const tabbedCard = sidebar.getByTestId('release-tabbed-card');
    await expect(tabbedCard).toBeVisible({ timeout: TIMEOUTS.CONTENT_VISIBLE });
    await waitForSettle(page);
    await tabbedCard.screenshot({
      path: `${OUTPUT_DIR}/release-sidebar-platforms.png`,
    });
    console.log('📸 Saved: release-sidebar-platforms.png');

    await sidebar.getByTestId('drawer-tab-tasks').click();
    const tasksCard = sidebar.getByTestId('release-tasks-card');
    await expect(tasksCard).toBeVisible({ timeout: TIMEOUTS.CONTENT_VISIBLE });
    await tasksCard.getByTestId('release-tasks-toggle').click();
    await expect(
      tasksCard.locator(
        '[data-testid="release-task-checklist-scroll-region"], [data-testid="release-task-empty-state-compact"]'
      )
    ).toBeVisible({ timeout: TIMEOUTS.CONTENT_VISIBLE });
    await expect(
      tasksCard.getByTestId('release-tasks-loading-state')
    ).toHaveCount(0);
    await waitForSettle(page);
    await tasksCard.screenshot({
      path: `${OUTPUT_DIR}/release-sidebar-tasks.png`,
    });
    console.log('📸 Saved: release-sidebar-tasks.png');
  });
});
