/**
 * JOV-7207: the collapsed sidebar toggle must stay clickable in Electron on
 * headed routes (Home) as well as Settings. Electron resolves app-region
 * rects in document order and ignores z-index, so a drag region rendered
 * after the window controls that overlaps the toggle turns it into a
 * window-drag handle. Browser clicks ignore app-region, so this resolves the
 * region at the toggle's center the way Electron does.
 *
 * Run:
 *   doppler run --project jovie-web --config dev -- env E2E_USE_TEST_AUTH_BYPASS=1 \
 *     pnpm --filter @jovie/web exec playwright test \
 *     tests/e2e/electron-sidebar-toggle-drag-region.spec.ts --project=chromium
 *
 * @smoke
 */

import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  gotoShellRoute,
  installElectronRuntime,
  waitForSettledShell,
} from './utils/electron-titlebar-runtime';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Resolve the app-region at a point the way Electron does: walk elements in
 * document order and let the last one whose border box contains the point and
 * declares drag or no-drag win. z-index is ignored, which is why a drag region
 * rendered after the titlebar can swallow a titlebar button it overlaps.
 */
async function resolveAppRegionAtCenter(
  page: Page,
  testId: string
): Promise<'drag' | 'no-drag' | 'none' | null> {
  return page.evaluate(id => {
    const target = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!target) return null;
    const box = target.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    let region: 'drag' | 'no-drag' | 'none' = 'none';
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      const value = getComputedStyle(el)
        .getPropertyValue('-webkit-app-region')
        .trim();
      if (value !== 'drag' && value !== 'no-drag') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        continue;
      }
      region = value;
    }
    return region;
  }, testId);
}

test('collapsed sidebar toggle stays clickable on headed routes (Home) and Settings', async ({
  page,
}) => {
  // The authenticated E2E lane must provide its normal test-auth setup.
  expect(process.env.E2E_USE_TEST_AUTH_BYPASS).toBe('1');
  test.setTimeout(240_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await installElectronRuntime(page);

  for (const route of [APP_ROUTES.DASHBOARD, APP_ROUTES.SETTINGS_ACCOUNT]) {
    await gotoShellRoute(page, route);
    await waitForSettledShell(page);
    const toggle = page.getByTestId('electron-sidebar-toggle');
    // Prove the resolver reads app-region at all, so a browser that stops
    // exposing it fails here instead of passing the toggle check vacuously.
    expect(
      await resolveAppRegionAtCenter(page, 'electron-traffic-light-safe-area')
    ).toBe('drag');

    // Every reversible state, twice, without a remount (JOV-7207 contract).
    for (let cycle = 0; cycle < 2; cycle += 1) {
      for (const expanded of ['false', 'true']) {
        await toggle.click();
        await expect
          .poll(() =>
            page
              .locator('[data-electron-titlebar="true"]')
              .getAttribute('data-electron-collapsed-rail')
          )
          .toBe(expanded === 'false' ? 'icon' : null);
        // A native click lands only where Electron resolves no-drag.
        expect(
          await resolveAppRegionAtCenter(page, 'electron-sidebar-toggle'),
          `${route} toggle must not sit under a later drag region`
        ).not.toBe('drag');
      }
    }
  }
});

test('no duplicate sidebar dock button and titlebar toggle on the same page', async ({
  page,
}) => {
  // Duplicate-control checks need a bypassed Clerk session; this spec runs in the dev-auth lane.
  expect(process.env.E2E_USE_TEST_AUTH_BYPASS).toBe('1');
  test.setTimeout(180_000);

  await installElectronRuntime(page);
  await gotoShellRoute(page);

  await waitForSettledShell(page);

  await expect(page.locator('[data-sidebar="trigger"]')).toHaveCount(0);
  await expect(
    page.locator('header a[aria-label="New Conversation"]')
  ).toHaveCount(0);
  await expect(
    page.locator('[data-testid="electron-sidebar-toggle"]')
  ).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'New Chat' })).toHaveCount(1);

  // The titlebar sidebar toggle must be present (it is the canonical one in Electron).
  const titlebarToggle = page.locator(
    '[data-testid="electron-sidebar-toggle"]'
  );
  await expect(titlebarToggle).toBeAttached();
});
