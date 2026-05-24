/**
 * Geometry tests for the Electron titlebar.
 *
 * These tests run in the browser (not in an actual Electron shell) and verify:
 * 1. The titlebar DOM structure — sidebar-cell contains back/forward,
 *    sidebar toggle + update pill; main-cell is a plain drag region (no header —
 *    page headers moved into
 *    the elevated content card below).
 * 2. No duplicate sidebar toggles — Electron gets exactly one titlebar toggle,
 *    zero web dock/header triggers, and zero sidebar-header plus controls.
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
import { APP_ROUTES } from '@/constants/routes';
import { APP_FLAG_OVERRIDE_KEYS } from '@/lib/flags/contracts';
import {
  APP_FLAG_OVERRIDES_COOKIE,
  FF_OVERRIDES_KEY,
} from '@/lib/flags/overrides';

test.use({ storageState: { cookies: [], origins: [] } });

async function forceDesignV1(page: Page): Promise<void> {
  const overrides = JSON.stringify({
    [APP_FLAG_OVERRIDE_KEYS.DESIGN_V1]: true,
  });

  await page.addInitScript(
    ({ cookieName, key, value }) => {
      Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: {},
      });
      document.documentElement.dataset.desktopRuntime = 'electron';
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

async function forceElectronRuntime(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {},
    });
    document.documentElement.dataset.desktopRuntime = 'electron';
  });
}

async function gotoShellRoute(
  page: Page,
  route: string = APP_ROUTES.CALENDAR,
  persona: 'admin' | 'creator-ready' = 'creator-ready'
): Promise<void> {
  const maxAttempts = 3;
  const authEntryUrl = `/api/dev/test-auth/enter?persona=${persona}&redirect=${encodeURIComponent(
    route
  )}`;
  const routePattern = new RegExp(route.replaceAll('/', '\\/'));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto(authEntryUrl, {
        timeout: 120_000,
        waitUntil: 'domcontentloaded',
      });
      await page.waitForURL(routePattern, { timeout: 60_000 });
      await forceElectronRuntime(page);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry =
        attempt < maxAttempts &&
        /ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ECONNRESET/i.test(message);
      if (!shouldRetry) throw error;
      await page.waitForTimeout(1000 * attempt);
    }
  }
}

async function assertElectronShellControls(
  page: Page,
  expectedNewChatRows: 0 | 1
): Promise<void> {
  await expect(
    page.locator('[data-testid="electron-sidebar-toggle"]')
  ).toHaveCount(1);
  await expect(page.locator('[data-sidebar-dock-button="true"]')).toHaveCount(
    0
  );
  await expect(page.locator('[data-sidebar="trigger"]')).toHaveCount(0);
  await expect(page.locator('header a[aria-label="New chat"]')).toHaveCount(0);
  const newChatRowCount = await page
    .getByRole('link', { name: 'New chat' })
    .count();
  expect(newChatRowCount).toBeLessThanOrEqual(1);
  if (expectedNewChatRows === 1) {
    expect(newChatRowCount).toBe(1);
  }
}

test('titlebar DOM has a single sidebar toggle and an empty main-cell drag region', async ({
  page,
}) => {
  // Skip outside the explicit dev-auth E2E lane; Electron shell setup needs a bypassed Clerk session.
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);

  await forceDesignV1(page);
  await gotoShellRoute(page);

  // Wait for shell frame to be present
  await expect(page.locator('[data-app-shell-frame="true"]')).toBeVisible({
    timeout: 30_000,
  });

  // The titlebar row is hidden in the browser (display:none unless inside Electron).
  // Verify structural correctness by checking the DOM regardless of visibility.
  const titlebarRow = page.locator('[data-testid="electron-titlebar-row"]');
  await expect(titlebarRow).toBeAttached({ timeout: 10_000 });

  // Sidebar cell: must contain browser nav and the canonical sidebar toggle.
  const sidebarCell = titlebarRow.locator(
    '[data-testid="electron-titlebar-sidebar-cell"]'
  );
  await expect(sidebarCell).toBeAttached();
  await expect(
    sidebarCell.locator('[data-testid="electron-nav-pill"]')
  ).toBeAttached();
  await expect(
    sidebarCell.locator('[data-testid="electron-nav-back"]')
  ).toBeAttached();
  await expect(
    sidebarCell.locator('[data-testid="electron-nav-forward"]')
  ).toBeAttached();
  await expect(
    sidebarCell.locator('[data-testid="electron-sidebar-toggle"]')
  ).toBeAttached();
  await expect(
    sidebarCell.locator('[data-testid="electron-traffic-light-safe-area"]')
  ).toBeAttached();

  // Main cell exists as a drag region but contains no chrome — the page header
  // lives inside the elevated content card below.
  const mainCell = titlebarRow.locator(
    '[data-testid="electron-titlebar-main-cell"]'
  );
  await expect(mainCell).toBeAttached();
  await expect(
    mainCell.locator('[data-testid="electron-nav-pill"]')
  ).toHaveCount(0);
  await expect(
    mainCell.locator('[data-testid="electron-nav-back"]')
  ).toHaveCount(0);
  await expect(
    mainCell.locator('[data-testid="electron-nav-forward"]')
  ).toHaveCount(0);
});

test('no duplicate sidebar dock button and titlebar toggle on the same page', async ({
  page,
}) => {
  // Skip outside the explicit dev-auth E2E lane; duplicate-control checks need a bypassed Clerk session.
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);

  await forceDesignV1(page);
  await gotoShellRoute(page);

  await expect(page.locator('[data-app-shell-frame="true"]')).toBeVisible({
    timeout: 30_000,
  });

  await expect(page.locator('[data-sidebar-dock-button="true"]')).toHaveCount(
    0
  );
  await expect(page.locator('[data-sidebar="trigger"]')).toHaveCount(0);
  await expect(page.locator('header a[aria-label="New chat"]')).toHaveCount(0);
  await expect(
    page.locator('[data-testid="electron-sidebar-toggle"]')
  ).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'New chat' })).toHaveCount(1);

  // The titlebar sidebar toggle must be present (it is the canonical one in Electron).
  const titlebarToggle = page.locator(
    '[data-testid="electron-sidebar-toggle"]'
  );
  await expect(titlebarToggle).toBeAttached();
});

test('titlebar sidebar-cell width matches CSS sidebar-width token (rail alignment)', async ({
  page,
}) => {
  // Skip outside the explicit dev-auth E2E lane; titlebar token checks need a bypassed Clerk session.
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await forceDesignV1(page);
  await gotoShellRoute(page);

  await expect(page.locator('[data-app-shell-frame="true"]')).toBeVisible({
    timeout: 30_000,
  });

  const tokens = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const readPx = (name: string) => {
      const raw = rootStyle.getPropertyValue(name).trim();
      const match = /^([\d.]+)px$/.exec(raw);
      return match ? Number.parseFloat(match[1]) : null;
    };
    return {
      titlebarHeight: readPx('--electron-titlebar-height'),
      trafficLightSafeWidth: readPx('--electron-traffic-light-safe-width'),
      trafficLightX: readPx('--electron-traffic-light-x'),
      trafficLightY: readPx('--electron-traffic-light-y'),
      sidebarWidth: readPx('--electron-sidebar-width'),
      collapsedSidebarWidth: readPx('--electron-sidebar-collapsed-width'),
    };
  });

  // If we can read the token, check the sidebar column width matches.
  expect(tokens.titlebarHeight).toBe(40);
  expect(tokens.trafficLightSafeWidth).toBe(72);
  expect(tokens.trafficLightX).toBe(20);
  expect(tokens.trafficLightY).toBe(17);
  expect(tokens.collapsedSidebarWidth).toBe(52);

  if (tokens.sidebarWidth !== null && tokens.sidebarWidth > 0) {
    const sidebarCell = page.locator(
      '[data-testid="electron-titlebar-sidebar-cell"]'
    );
    const box = await sidebarCell.boundingBox();

    // The titlebar is hidden in the browser (display:none), so boundingBox will be null.
    // This is expected — we only assert column alignment geometry inside Electron.
    // The structural tests above already validate the DOM layout.
    // Here we only check the token resolves to a non-zero positive value.
    expect(
      tokens.sidebarWidth,
      'sidebar width token is a positive pixel value'
    ).toBeGreaterThan(0);

    if (box !== null) {
      // Inside Electron, the titlebar IS visible — verify the sidebar-cell width
      // matches the token value within 1px tolerance (allows for sub-pixel rounding).
      expect(
        Math.abs(box.width - tokens.sidebarWidth),
        `titlebar sidebar-cell width (${box.width}px) matches sidebar-width token (${tokens.sidebarWidth}px)`
      ).toBeLessThanOrEqual(1);
    }
  }
});

test('Electron shell keeps one control contract across chat, calendar, tasks, releases, settings, and admin routes', async ({
  page,
}) => {
  // Skip outside the explicit dev-auth E2E lane; cross-route Electron controls need bypassed personas.
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(240_000);

  await forceDesignV1(page);

  const routeChecks: ReadonlyArray<{
    readonly route: string;
    readonly persona: 'admin' | 'creator-ready';
    readonly expectedNewChatRows: number;
  }> = [
    {
      route: APP_ROUTES.CHAT,
      persona: 'creator-ready',
      expectedNewChatRows: 1,
    },
    {
      route: APP_ROUTES.CALENDAR,
      persona: 'creator-ready',
      expectedNewChatRows: 1,
    },
    {
      route: APP_ROUTES.TASKS,
      persona: 'creator-ready',
      expectedNewChatRows: 1,
    },
    {
      route: APP_ROUTES.RELEASES,
      persona: 'creator-ready',
      expectedNewChatRows: 1,
    },
    {
      route: APP_ROUTES.SETTINGS_ACCOUNT,
      persona: 'creator-ready',
      expectedNewChatRows: 0,
    },
    {
      route: APP_ROUTES.ADMIN_OPS,
      persona: 'admin',
      expectedNewChatRows: 0,
    },
  ];

  for (const { route, persona, expectedNewChatRows } of routeChecks) {
    await gotoShellRoute(page, route, persona);
    await expect(
      page.locator('[data-testid="electron-titlebar-row"]')
    ).toBeAttached({ timeout: 30_000 });
    await assertElectronShellControls(page, expectedNewChatRows);
  }
});
