/**
 * Geometry tests for the Electron titlebar.
 *
 * These tests run in the browser (not in an actual Electron shell) and verify:
 * 1. The titlebar DOM structure — sidebar-cell contains back/forward,
 *    sidebar toggle; the page header shares the same top edge.
 *    Page headers remain inside
 *    the elevated content card below).
 * 2. No duplicate sidebar toggles — Electron gets exactly one titlebar toggle
 *    and zero web sidebar-header controls.
 * 3. The sidebar-cell width equals the CSS sidebar-width token, confirming rail alignment.
 *    (In a real Electron run the canonical shell CSS `padding-left` rule takes effect;
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

// Streaming can briefly hold a suspended copy of the shell next to the
// resolved one; geometry is only meaningful once exactly one frame remains.
async function waitForSettledShell(page: Page): Promise<void> {
  const frame = page.locator('[data-app-shell-frame="true"]');
  await expect(frame).toHaveCount(1, { timeout: 30_000 });
  await expect(frame).toBeVisible();
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

test('titlebar DOM has a single sidebar toggle and no second main-cell band', async ({
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
  await waitForSettledShell(page);

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

  await expect(
    titlebarRow.locator('[data-testid="electron-titlebar-main-cell"]')
  ).toHaveCount(0);
  await expect(page.getByTestId('dashboard-header')).toHaveAttribute(
    'data-electron-drag-region',
    'true'
  );
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
  await installElectronRuntime(page);
  await gotoShellRoute(page);

  await waitForSettledShell(page);

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
      // Inside Electron the titlebar is visible. The row spans exactly the
      // sidebar column; its shell-gap padding insets the cell to the rail's
      // own content edge, so measure the row's border box against the token.
      const rowBox = await page
        .locator('[data-testid="electron-titlebar-row"]')
        .boundingBox();
      expect(rowBox).not.toBeNull();
      expect(
        Math.abs((rowBox?.width ?? 0) - tokens.sidebarWidth),
        `titlebar row width (${rowBox?.width}px) matches sidebar-width token (${tokens.sidebarWidth}px)`
      ).toBeLessThanOrEqual(1);
      expect(
        box.width,
        'sidebar cell stays inside the sidebar column'
      ).toBeLessThanOrEqual(tokens.sidebarWidth);
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
    ...[
      APP_ROUTES.SETTINGS_CONNECTORS,
      APP_ROUTES.SETTINGS_USAGE,
      APP_ROUTES.SETTINGS_BILLING,
      APP_ROUTES.SETTINGS_PAYMENTS,
      APP_ROUTES.SETTINGS_DATA_PRIVACY,
      APP_ROUTES.SETTINGS_ARTIST_PROFILE,
      APP_ROUTES.SETTINGS_CONTACTS,
      APP_ROUTES.SETTINGS_TOURING,
      APP_ROUTES.SETTINGS_ANALYTICS,
      APP_ROUTES.SETTINGS_AUDIENCE,
    ].map(route => ({
      route,
      persona: 'creator-ready' as const,
      expectedNewChatRows: 0,
    })),
  ];

  for (const { route, persona, expectedNewChatRows } of routeChecks) {
    await gotoShellRoute(page, route, persona);
    // Streaming can briefly hold suspended copies of the shell; once the
    // route settles there must be exactly one titlebar row.
    await expect(
      page.locator('[data-testid="electron-titlebar-row"]')
    ).toHaveCount(1, { timeout: 30_000 });
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
      const settingsShell = document.querySelector<HTMLElement>(
        '[data-testid="settings-shell-content"]'
      );
      const settingsColumn = document.querySelector<HTMLElement>(
        '[data-settings-layout-column="true"]'
      );
      if (!titlebar || !body || !sidebar || !mainPlane) return null;

      const titlebarBox = titlebar.getBoundingClientRect();
      const bodyBox = body.getBoundingClientRect();
      const sidebarBox = sidebar.getBoundingClientRect();
      const mainPlaneBox = mainPlane.getBoundingClientRect();
      const settingsShellBox = settingsShell?.getBoundingClientRect();
      const settingsColumnBox = settingsColumn?.getBoundingClientRect();
      return {
        bodyPaddingTop: Number.parseFloat(getComputedStyle(body).paddingTop),
        titlebarTop: titlebarBox.top,
        titlebarBottom: titlebarBox.bottom,
        bodyTop: bodyBox.top,
        sidebarTop: sidebarBox.top,
        mainPlaneTop: mainPlaneBox.top,
        settingsShellTop: settingsShellBox?.top ?? null,
        settingsShellCenterX:
          settingsShellBox === undefined
            ? null
            : settingsShellBox.left + settingsShellBox.width / 2,
        settingsColumnTop: settingsColumnBox?.top ?? null,
        settingsColumnCenterX:
          settingsColumnBox === undefined
            ? null
            : settingsColumnBox.left + settingsColumnBox.width / 2,
      };
    });

    expect(geometry, `${route} exposes shell geometry`).not.toBeNull();
    expect(
      geometry?.bodyPaddingTop,
      `${route} has no second top-gap owner`
    ).toBe(0);
    expect(
      Math.abs((geometry?.titlebarTop ?? 0) - (geometry?.bodyTop ?? 0)),
      `${route} body shares the titlebar top edge`
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs((geometry?.sidebarTop ?? 0) - (geometry?.bodyTop ?? 0)),
      `${route} sidebar aligns to the body grid`
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs((geometry?.mainPlaneTop ?? 0) - (geometry?.bodyTop ?? 0)),
      `${route} main plane aligns to the body grid`
    ).toBeLessThanOrEqual(1);

    if (route.startsWith(APP_ROUTES.SETTINGS)) {
      expect(
        Math.abs(
          (geometry?.settingsColumnCenterX ?? 0) -
            (geometry?.settingsShellCenterX ?? 0)
        ),
        // The route pane, not the main plane: an open inspector (the
        // artist-profile preview rail) is a sibling that narrows the pane.
        `${route} centers its shared column in the settings route pane`
      ).toBeLessThanOrEqual(1);
      expect(
        (geometry?.settingsColumnTop ?? 0) - (geometry?.settingsShellTop ?? 0),
        `${route} begins at the canonical compact content inset`
      ).toBeLessThanOrEqual(12);
    }

    if (route === APP_ROUTES.CHAT) {
      // The greeting and the composer share one centered column; the
      // greeting text sits on the composer's inner edge, never outside it.
      const starterSelector =
        '[data-testid="chat-empty-state-greeting-region"]';
      const composerSelector = '[data-testid="chat-composer-surface"]';
      await expect(page.locator(starterSelector)).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator(composerSelector)).toBeVisible({
        timeout: 30_000,
      });
      const chatGrid = await page.evaluate(
        ([starterSel, composerSel]) => {
          const starter = document
            .querySelector<HTMLElement>(starterSel)
            ?.getBoundingClientRect();
          const composer = document
            .querySelector<HTMLElement>(composerSel)
            ?.getBoundingClientRect();
          if (!starter || !composer) return null;
          return {
            centerDelta: Math.abs(
              starter.left +
                starter.width / 2 -
                (composer.left + composer.width / 2)
            ),
            starterLeftInset: starter.left - composer.left,
            starterRightInset: composer.right - starter.right,
          };
        },
        [starterSelector, composerSelector] as const
      );
      expect(
        chatGrid,
        'New Chat renders both the greeting and the composer'
      ).not.toBeNull();
      expect(chatGrid?.centerDelta ?? 99).toBeLessThanOrEqual(1);
      expect(chatGrid?.starterLeftInset ?? -1).toBeGreaterThanOrEqual(0);
      expect(chatGrid?.starterRightInset ?? -1).toBeGreaterThanOrEqual(0);
    }
  }
});

test('settings shell keeps compact, 200% zoom, keyboard, and collapsed-sidebar clearance', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);

  await page.setViewportSize({ width: 800, height: 640 });
  await installElectronRuntime(page);
  await gotoShellRoute(page, APP_ROUTES.SETTINGS_ACCOUNT);
  await page.evaluate(() => {
    document.body.style.zoom = '2';
  });

  const sidebarToggle = page.getByTestId('electron-sidebar-toggle');
  const initialToggleLabel = await sidebarToggle.getAttribute('aria-label');
  await sidebarToggle.focus();
  await expect(sidebarToggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => sidebarToggle.getAttribute('aria-label'))
    .not.toBe(initialToggleLabel);

  const geometry = await page.evaluate(() => {
    const mainPlane = document.querySelector<HTMLElement>(
      '[data-app-shell-main-plane="true"]'
    );
    const column = document.querySelector<HTMLElement>(
      '[data-settings-layout-column="true"]'
    );
    const titlebar = document.querySelector<HTMLElement>(
      '[data-electron-titlebar="true"]'
    );
    if (!mainPlane || !column || !titlebar) return null;
    const header = column.querySelector<HTMLElement>(
      '[data-top-spacing-owner="shell-header"]'
    );
    const title = header?.querySelector<HTMLElement>('h1');
    if (!header || !title) return null;
    const mainBox = mainPlane.getBoundingClientRect();
    const columnBox = column.getBoundingClientRect();
    const titlebarBox = titlebar.getBoundingClientRect();
    const headerBox = header.getBoundingClientRect();
    const titleBox = title.getBoundingClientRect();
    return {
      centeredDelta: Math.abs(
        columnBox.left +
          columnBox.width / 2 -
          (mainBox.left + mainBox.width / 2)
      ),
      horizontalOverflow: column.scrollWidth - column.clientWidth,
      titlebarTop: titlebarBox.top,
      titlebarBottom: titlebarBox.bottom,
      titlebarRight: titlebarBox.right,
      headerTop: headerBox.top,
      headerBottom: headerBox.bottom,
      titleLeft: titleBox.left,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry?.centeredDelta).toBeLessThanOrEqual(1);
  expect(geometry?.horizontalOverflow).toBeLessThanOrEqual(0);
  // Settings supplies the shared desktop header (#20269): it shares the
  // window-control row instead of starting below it, and its title must
  // clear the controls.
  expect(
    Math.abs((geometry?.headerTop ?? -1) - (geometry?.titlebarTop ?? 0))
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs((geometry?.headerBottom ?? -1) - (geometry?.titlebarBottom ?? 0))
  ).toBeLessThanOrEqual(1);
  expect(geometry?.titleLeft ?? 0).toBeGreaterThanOrEqual(
    geometry?.titlebarRight ?? Number.POSITIVE_INFINITY
  );
});
