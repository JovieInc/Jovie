/**
 * E2E stability spec: release sidebar (profile drawer) must stay open and
 * not flash a loading skeleton during a background query invalidation.
 *
 * Regression guard for JOV-2150 / JOV-2158 / JOV-2162. Unit-level invariant
 * for ProfileUnifiedDrawer is in tests/unit. This spec adds a Playwright guard
 * that the drawer's DOM state is stable when TanStack Query invalidates
 * the releases cache while the drawer is open.
 *
 * How it works:
 * 1. Auth via the dev bypass to the releases page with a creator-ready session.
 * 2. Wait for at least one release row to be visible.
 * 3. Click the first release row to open the release sidebar.
 * 4. Wait for data-testid="release-sidebar" to be visible.
 * 5. Trigger window.__JOVIE_E2E_INVALIDATE_QUERIES__(['releases']).
 * 6. assertDomStable confirms the sidebar stays open and the drawer loading
 *    skeleton never appears for 2 seconds.
 *
 * Run:
 *   doppler run -- pnpm --filter web exec playwright test dashboard-profile-drawer-stability --project=chromium
 *
 * @stability @smoke
 */

import { expect, type Page, test } from '@playwright/test';
import { assertDomStable } from '../helpers/dom-stability';

const BYPASS_URL =
  '/api/dev/test-auth/enter?persona=creator-ready&redirect=/app/releases';

test.use({ storageState: { cookies: [], origins: [] } });

async function findFirstReleaseTrigger(page: Page) {
  const taggedRow = page.getByTestId('release-row').first();
  if (await taggedRow.isVisible()) {
    return taggedRow;
  }

  const desktopRow = page.locator('tbody tr').first();
  if (await desktopRow.isVisible()) {
    return desktopRow;
  }

  return page.locator('[role="listbox"] [role="option"]').first();
}

test('release sidebar stays stable during background query invalidation', async ({
  page,
}) => {
  test.setTimeout(120_000);

  const consoleErrors: string[] = [];
  page.on('pageerror', err => consoleErrors.push(String(err)));

  // Auth and navigate to releases
  await page.goto(BYPASS_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/app\/dashboard\/releases/, { timeout: 60_000 });

  // Wait for the skeleton to disappear — page is ready
  await expect(page.locator('[data-testid="releases-loading"]')).toHaveCount(
    0,
    {
      timeout: 30_000,
    }
  );

  // Open the first release row to show the sidebar.
  const firstRow = await findFirstReleaseTrigger(page);
  const hasRows = await firstRow.count();

  if (hasRows === 0) {
    // No releases available for this persona — skip drawer test gracefully.
    test.skip();
    return;
  }

  await firstRow.click();

  // Wait for the release sidebar to open
  await expect(page.locator('[data-testid="release-sidebar"]')).toBeVisible({
    timeout: 15_000,
  });

  // Assert the sidebar stays visible and no drawer loading skeleton appears
  // while a background query invalidation is in flight.
  await assertDomStable(page, {
    selector: '[data-testid="release-sidebar"]',
    absentSelector: '[data-testid="drawer-loading-skeleton"]',
    durationMs: 2000,
    while: async () => {
      await page.evaluate(() => {
        window.__JOVIE_E2E_INVALIDATE_QUERIES__?.(['releases']);
      });
    },
  });

  // No uncaught JS errors during the stability window
  const ignorable = [/clerk|handshake|dev-browser/i, /sentry/i, /favicon/i];
  const relevant = consoleErrors.filter(e => !ignorable.some(rx => rx.test(e)));
  expect(
    relevant,
    `Unexpected console errors during stability window: ${relevant.join('\n')}`
  ).toEqual([]);
});
