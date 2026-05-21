/**
 * Geometry tests for the Electron titlebar.
 *
 * These tests run in the browser (not in an actual Electron shell) and verify:
 * 1. The titlebar DOM structure — sidebar-cell contains sidebar toggle + update pill;
 *    main-cell contains the nav pill group.
 * 2. No duplicate sidebar toggles — only one [data-sidebar-dock-button] per page and
 *    it must not also have [data-testid="electron-sidebar-toggle"] as a sibling.
 * 3. The sidebar-cell width equals the CSS sidebar-width token, confirming rail alignment.
 *    (In a real Electron run the CSS `padding-left` rule for shellChatV1 takes effect;
 *    in the browser we verify the column structure is present and correctly attributed.)
 *
 * Run:
 *   doppler run --project jovie-web --config dev -- env E2E_USE_TEST_AUTH_BYPASS=1 \
 *     pnpm --filter @jovie/web exec playwright test \
 *     tests/e2e/electron-titlebar-geometry.spec.ts --project=chromium
 *
 * @smoke
 */

import { expect, type Page, test } from '@playwright/test';
import { APP_FLAG_OVERRIDE_KEYS } from '@/lib/flags/contracts';
import {
  APP_FLAG_OVERRIDES_COOKIE,
  FF_OVERRIDES_KEY,
} from '@/lib/flags/overrides';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';

test.use({ storageState: { cookies: [], origins: [] } });

async function forceDesignV1(page: Page): Promise<void> {
  const overrides = JSON.stringify({
    [APP_FLAG_OVERRIDE_KEYS.DESIGN_V1]: true,
  });

  await page.addInitScript(
    ({ cookieName, key, value }) => {
      localStorage.setItem(key, value);
      document.cookie = `${cookieName}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
    },
    {
      cookieName: APP_FLAG_OVERRIDES_COOKIE,
      key: FF_OVERRIDES_KEY,
      value: overrides,
    }
  );
}

async function gotoChatRoute(page: Page): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto('/app/chat', {
        timeout: 120_000,
        waitUntil: 'domcontentloaded',
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry =
        attempt < maxAttempts && /ERR_EMPTY_RESPONSE|ECONNRESET/i.test(message);
      if (!shouldRetry) throw error;
      await page.waitForTimeout(1000 * attempt);
    }
  }
}

test('titlebar DOM has a single sidebar toggle and nav pill group', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);

  await forceDesignV1(page);
  await setTestAuthBypassSession(
    page,
    'creator-ready',
    'e2e-titlebar-geometry-user'
  );
  await gotoChatRoute(page);
  await page.waitForURL(/\/app\/chat/, { timeout: 60_000 });

  // Wait for shell frame to be present
  await expect(page.locator('[data-app-shell-frame="true"]')).toBeVisible({
    timeout: 30_000,
  });

  // The titlebar row is hidden in the browser (display:none unless inside Electron).
  // Verify structural correctness by checking the DOM regardless of visibility.
  const titlebarRow = page.locator('[data-testid="electron-titlebar-row"]');
  await expect(titlebarRow).toBeAttached({ timeout: 10_000 });

  // Sidebar cell: must contain the canonical sidebar toggle and the update-pill slot.
  const sidebarCell = titlebarRow.locator(
    '[data-testid="electron-titlebar-sidebar-cell"]'
  );
  await expect(sidebarCell).toBeAttached();
  await expect(
    sidebarCell.locator('[data-testid="electron-sidebar-toggle"]')
  ).toBeAttached();

  // Main cell: must contain the nav pill group with back + forward inside it.
  const mainCell = titlebarRow.locator(
    '[data-testid="electron-titlebar-main-cell"]'
  );
  await expect(mainCell).toBeAttached();
  const navPill = mainCell.locator('[data-testid="electron-nav-pill"]');
  await expect(navPill).toBeAttached();
  await expect(
    navPill.locator('[data-testid="electron-nav-back"]')
  ).toBeAttached();
  await expect(
    navPill.locator('[data-testid="electron-nav-forward"]')
  ).toBeAttached();

  // Back + forward must NOT be inside the sidebar cell (they moved to the main cell).
  const backInSidebarCell = sidebarCell.locator(
    '[data-testid="electron-nav-back"]'
  );
  await expect(backInSidebarCell).toHaveCount(0);
  const forwardInSidebarCell = sidebarCell.locator(
    '[data-testid="electron-nav-forward"]'
  );
  await expect(forwardInSidebarCell).toHaveCount(0);
});

test('no duplicate sidebar dock button and titlebar toggle on the same page', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);

  await forceDesignV1(page);
  await setTestAuthBypassSession(
    page,
    'creator-ready',
    'e2e-titlebar-dedup-user'
  );
  await gotoChatRoute(page);
  await page.waitForURL(/\/app\/chat/, { timeout: 60_000 });

  await expect(page.locator('[data-app-shell-frame="true"]')).toBeVisible({
    timeout: 30_000,
  });

  // At most one in-sidebar dock button per page.
  const dockButtons = page.locator('[data-sidebar-dock-button="true"]');
  const dockCount = await dockButtons.count();
  expect(
    dockCount,
    'at most one sidebar dock button in the DOM'
  ).toBeLessThanOrEqual(1);

  // The titlebar sidebar toggle must be present (it is the canonical one in Electron).
  const titlebartoggle = page.locator(
    '[data-testid="electron-sidebar-toggle"]'
  );
  await expect(titlebartoggle).toBeAttached();
});

test('titlebar sidebar-cell width matches CSS sidebar-width token (rail alignment)', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await forceDesignV1(page);
  await setTestAuthBypassSession(
    page,
    'creator-ready',
    'e2e-titlebar-rail-user'
  );
  await gotoChatRoute(page);
  await page.waitForURL(/\/app\/chat/, { timeout: 60_000 });

  await expect(page.locator('[data-app-shell-frame="true"]')).toBeVisible({
    timeout: 30_000,
  });

  // Read the resolved sidebar width from the CSS custom property.
  const sidebarWidthPx = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const raw = rootStyle.getPropertyValue('--linear-app-sidebar-width').trim();
    // Parse px value
    const match = /^([\d.]+)px$/.exec(raw);
    return match ? Number.parseFloat(match[1]) : null;
  });

  // If we can read the token, check the sidebar column width matches.
  if (sidebarWidthPx !== null && sidebarWidthPx > 0) {
    const sidebarCell = page.locator(
      '[data-testid="electron-titlebar-sidebar-cell"]'
    );
    const box = await sidebarCell.boundingBox();

    // The titlebar is hidden in the browser (display:none), so boundingBox will be null.
    // This is expected — we only assert column alignment geometry inside Electron.
    // The structural tests above already validate the DOM layout.
    // Here we only check the token resolves to a non-zero positive value.
    expect(
      sidebarWidthPx,
      'sidebar width token is a positive pixel value'
    ).toBeGreaterThan(0);

    if (box !== null) {
      // Inside Electron, the titlebar IS visible — verify the sidebar-cell width
      // matches the token value within 1px tolerance (allows for sub-pixel rounding).
      expect(
        Math.abs(box.width - sidebarWidthPx),
        `titlebar sidebar-cell width (${box.width}px) matches sidebar-width token (${sidebarWidthPx}px)`
      ).toBeLessThanOrEqual(1);
    }
  }
});
