/**
 * Geometry tests for the Electron titlebar.
 *
 * These tests run in the browser (not in an actual Electron shell) and verify:
 * 1. The titlebar DOM structure — sidebar-cell contains back/forward and the
 *    sidebar toggle; main-cell remains an empty drag region. Build diagnostics
 *    live in the native About surface rather than the workspace row.
 * 2. No duplicate sidebar toggles — Electron gets exactly one titlebar toggle
 *    and zero web sidebar-header controls.
 * 3. The compact native-controls cell uses its dedicated width token while the
 *    content rail keeps the canonical sidebar width.
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

test.use({ storageState: { cookies: [], origins: [] } });

async function installElectronRuntime(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {},
    });
    document.documentElement.dataset.desktopRuntime = 'electron';
  });
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
  await expect(page.locator('[data-sidebar="trigger"]')).toHaveCount(0);
  await expect(
    page.locator('header a[aria-label="New Conversation"]')
  ).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'New Chat' })).toHaveCount(
    expectedNewChatRows
  );
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

  await installElectronRuntime(page);
  await gotoShellRoute(page);

  // Wait for shell frame to be present
  await expect(page.locator('[data-app-shell-frame="true"]')).toBeVisible({
    timeout: 30_000,
  });

  // The test forces the Electron marker, so verify the live visible structure
  // and keep the same selectors usable in a packaged-shell run.
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

  await installElectronRuntime(page);
  await gotoShellRoute(page);

  await expect(page.locator('[data-app-shell-frame="true"]')).toBeVisible({
    timeout: 30_000,
  });

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

test('titlebar sidebar-cell width matches the compact controls token', async ({
  page,
}) => {
  // Skip outside the explicit dev-auth E2E lane; titlebar token checks need a bypassed Clerk session.
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await installElectronRuntime(page);
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
      controlsWidth: readPx('--electron-controls-width'),
    };
  });

  // If we can read the token, check the compact controls column width matches.
  expect(tokens.titlebarHeight).toBe(40);
  expect(tokens.trafficLightSafeWidth).toBe(72);
  expect(tokens.trafficLightX).toBe(20);
  expect(tokens.trafficLightY).toBe(17);
  expect(tokens.collapsedSidebarWidth).toBe(52);

  if (tokens.controlsWidth !== null && tokens.controlsWidth > 0) {
    const sidebarCell = page.locator(
      '[data-testid="electron-titlebar-sidebar-cell"]'
    );
    const box = await sidebarCell.boundingBox();

    // In the browser-only fallback this can be null; the structural checks above
    // still validate the DOM. In an Electron run, assert the measured width.
    expect(
      tokens.sidebarWidth,
      'sidebar width token is a positive pixel value'
    ).toBeGreaterThan(0);

    if (box !== null) {
      // Inside Electron, the titlebar is visible — verify the compact control
      // cell width matches its token within 1px tolerance.
      expect(
        Math.abs(box.width - tokens.controlsWidth),
        `titlebar sidebar-cell width (${box.width}px) matches controls-width token (${tokens.controlsWidth}px)`
      ).toBeLessThanOrEqual(1);
    }
  }
});

test('Electron shell keeps one control contract across chat, calendar, tasks, library, and settings routes', async ({
  page,
}) => {
  // Skip outside the explicit dev-auth E2E lane; cross-route Electron controls need bypassed personas.
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(240_000);

  await installElectronRuntime(page);

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
      route: APP_ROUTES.LIBRARY,
      persona: 'creator-ready',
      expectedNewChatRows: 1,
    },
    {
      route: APP_ROUTES.SETTINGS_ACCOUNT,
      persona: 'creator-ready',
      expectedNewChatRows: 0,
    },
  ];

  for (const { route, persona, expectedNewChatRows } of routeChecks) {
    await gotoShellRoute(page, route, persona);
    await expect(
      page.locator('[data-testid="electron-titlebar-row"]')
    ).toBeAttached({ timeout: 30_000 });
    await assertElectronShellControls(page, expectedNewChatRows);

    const geometry = await page.evaluate(() => {
      const titlebar = document.querySelector<HTMLElement>(
        '[data-electron-titlebar="true"]'
      );
      const body = document.querySelector<HTMLElement>(
        '[data-app-shell-body="true"]'
      );
      const sidebar = document.querySelector<HTMLElement>(
        '[data-app-shell-sidebar-mount="true"]'
      );
      const mainPlane = document.querySelector<HTMLElement>(
        '[data-app-shell-main-plane="true"]'
      );
      if (!titlebar || !body || !sidebar || !mainPlane) return null;

      const titlebarBox = titlebar.getBoundingClientRect();
      const bodyBox = body.getBoundingClientRect();
      const sidebarBox = sidebar.getBoundingClientRect();
      const mainPlaneBox = mainPlane.getBoundingClientRect();
      return {
        bodyPaddingTop: Number.parseFloat(getComputedStyle(body).paddingTop),
        titlebarTop: titlebarBox.top,
        bodyTop: bodyBox.top,
        sidebarTop: sidebarBox.top,
        mainPlaneTop: mainPlaneBox.top,
      };
    });

    expect(geometry, `${route} exposes shell geometry`).not.toBeNull();
    expect(
      geometry?.bodyPaddingTop,
      `${route} reserves only the measured optical control offset`
    ).toBe(4);
    expect(
      Math.abs((geometry?.titlebarTop ?? 0) - (geometry?.bodyTop ?? 0)),
      `${route} native controls begin at the shell origin`
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs((geometry?.sidebarTop ?? 0) - (geometry?.bodyTop ?? 0)),
      `${route} sidebar aligns to the body grid`
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        (geometry?.mainPlaneTop ?? 0) -
          ((geometry?.bodyTop ?? 0) + (geometry?.bodyPaddingTop ?? 0))
      ),
      `${route} main plane starts after the measured optical offset`
    ).toBeLessThanOrEqual(1);

    if (route === APP_ROUTES.CHAT) {
      await expect(
        page.locator('[data-chat-grid-anchor="starter"]')
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.locator('[data-chat-grid-anchor="composer"]')
      ).toBeVisible({ timeout: 30_000 });
      const chatGrid = await page.evaluate(() => {
        const starter = document
          .querySelector<HTMLElement>('[data-chat-grid-anchor="starter"]')
          ?.getBoundingClientRect();
        const composer = document
          .querySelector<HTMLElement>('[data-chat-grid-anchor="composer"]')
          ?.getBoundingClientRect();
        if (!starter || !composer) return null;
        return {
          starterLeft: starter.left,
          starterRight: starter.right,
          composerLeft: composer.left,
          composerRight: composer.right,
        };
      });
      expect(
        chatGrid,
        'New Chat exposes both canonical grid anchors'
      ).not.toBeNull();
      expect(
        Math.abs((chatGrid?.starterLeft ?? 0) - (chatGrid?.composerLeft ?? 0))
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs((chatGrid?.starterRight ?? 0) - (chatGrid?.composerRight ?? 0))
      ).toBeLessThanOrEqual(1);
    }
  }
});
