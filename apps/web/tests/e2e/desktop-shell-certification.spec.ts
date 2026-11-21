/**
 * Rendered OV shell guard (JOV-12642).
 *
 * Certifies the operator shell in the emulated Electron runtime at 1512×944,
 * expanded and collapsed: rail widths, nav row heights, one active item,
 * title-to-arrows gap, 44px title-row centerline, table row height, and
 * screenshot baselines.
 *
 * Run:
 *   doppler run --project jovie-web --config dev -- env E2E_USE_TEST_AUTH_BYPASS=1 \
 *     pnpm --filter @jovie/web exec playwright test \
 *     tests/e2e/desktop-shell-certification.spec.ts --project=chromium
 *
 * @smoke
 */

import { expect, type Page, test } from '@playwright/test';
import {
  TABLE_ROW_MODES,
  type TableRowMode,
} from '@/components/organisms/table/table.styles';
import { APP_ROUTES } from '@/constants/routes';
import { SIDEBAR_COOKIE_NAME } from '@/hooks/useSidebarCookieState';
import {
  gotoShellRoute,
  installElectronRuntime,
  waitForSettledShell,
} from './utils/electron-titlebar-runtime';

const VIEWPORT = { width: 1512, height: 944 } as const;
const TITLEBAR_HEIGHT = 44;
const EXPANDED_SIDEBAR_MAX = 260;
const COLLAPSED_SIDEBAR_WIDTH = 52;
const NAV_ROW_HEIGHT = 28;
const TITLE_GAP_MIN = 16;
const TITLE_GAP_MAX = 28;

test.use({ storageState: { cookies: [], origins: [] } });

function shellMasks(page: Page) {
  return [
    page.locator('table tbody'),
    page.getByTestId('app-shell-right-rail'),
  ];
}

async function seedCollapsedSidebarCookie(page: Page): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
  await page.context().addCookies([
    {
      name: SIDEBAR_COOKIE_NAME,
      value: 'false',
      url: baseUrl,
      sameSite: 'Lax',
    },
  ]);
}

async function openOvPresenceShell(
  page: Page,
  options?: { readonly collapsed?: boolean }
): Promise<void> {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );
  test.setTimeout(180_000);

  await page.setViewportSize(VIEWPORT);
  if (options?.collapsed) {
    await seedCollapsedSidebarCookie(page);
  }
  await installElectronRuntime(page);
  await gotoShellRoute(page, APP_ROUTES.ADMIN_PRESENCE, 'admin');
  await waitForSettledShell(page);

  const titlebar = page.getByTestId('electron-titlebar-row');
  await expect(titlebar).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#shell-left-rail')).toBeVisible();
  await expect(page.locator('nav[aria-label="OV Navigation"]')).toBeVisible();
}

function verticalCenter(box: { y: number; height: number }): number {
  return box.y + box.height / 2;
}

test('OV shell expanded at 1512 certifies rail, nav rows, and screenshot', async ({
  page,
}) => {
  await openOvPresenceShell(page);

  const rail = page.locator('#shell-left-rail');
  const nav = page.locator('nav[aria-label="OV Navigation"]');

  const metrics = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const raw = rootStyle.getPropertyValue('--app-shell-sidebar-width').trim();
    const match = /^([\d.]+)px$/.exec(raw);
    return {
      tokenWidth: match ? Number.parseFloat(match[1]) : null,
    };
  });

  expect(metrics.tokenWidth).toBe(224);

  const railBox = await rail.boundingBox();
  expect(railBox).not.toBeNull();
  expect(
    Math.abs((railBox?.width ?? 0) - (metrics.tokenWidth ?? 0)),
    'expanded #shell-left-rail matches --app-shell-sidebar-width'
  ).toBeLessThanOrEqual(1);
  expect(railBox?.width ?? 0).toBeLessThanOrEqual(EXPANDED_SIDEBAR_MAX);

  const links = nav.locator('a');
  const linkCount = await links.count();
  expect(linkCount).toBeGreaterThan(0);

  for (let i = 0; i < linkCount; i += 1) {
    const link = links.nth(i);
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(
      Math.abs((box?.height ?? 0) - NAV_ROW_HEIGHT),
      `OV nav link ${i} is ${NAV_ROW_HEIGHT}px tall`
    ).toBeLessThanOrEqual(1);
    await expect(link).not.toHaveText('');
  }

  await expect(nav.getByText('Company', { exact: true })).toBeVisible();
  await expect(nav.getByText('Tools', { exact: true })).toBeVisible();
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);

  const table = page.locator('table[data-table-row-mode]').first();
  await expect(table).toBeVisible({ timeout: 30_000 });
  const mode = (await table.getAttribute(
    'data-table-row-mode'
  )) as TableRowMode | null;
  expect(mode).toBeTruthy();
  expect(mode && mode in TABLE_ROW_MODES).toBe(true);
  if (mode && mode in TABLE_ROW_MODES) {
    const expected = TABLE_ROW_MODES[mode].rowHeight;
    const row = table.locator('tbody tr').first();
    await expect(row).toBeVisible();
    const rowBox = await row.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(
      Math.abs((rowBox?.height ?? 0) - expected),
      `table row height matches TABLE_ROW_MODES[${mode}]`
    ).toBeLessThanOrEqual(1);
    expect(rowBox?.height ?? 0).toBeLessThanOrEqual(44);
  }

  const frame = page.locator('[data-app-shell-frame="true"]');
  await expect(frame).toHaveScreenshot('desktop-shell-ov-expanded.png', {
    animations: 'disabled',
    mask: shellMasks(page),
    maxDiffPixelRatio: 0.03,
  });
});

test('OV shell collapsed at 1512 certifies rail, title gap, centerline, and screenshot', async ({
  page,
}) => {
  await openOvPresenceShell(page, { collapsed: true });

  const rail = page.locator('#shell-left-rail');
  const railBox = await rail.boundingBox();
  expect(railBox).not.toBeNull();
  expect(
    Math.abs((railBox?.width ?? 0) - COLLAPSED_SIDEBAR_WIDTH),
    'collapsed #shell-left-rail is 52px'
  ).toBeLessThanOrEqual(1);

  const visibleLinks = rail.locator('a:visible');
  expect(await visibleLinks.count()).toBeLessThanOrEqual(8);

  const forward = page.getByTestId('electron-nav-forward');
  const title = page.locator('[data-testid="dashboard-header"] h1').first();
  await expect(forward).toBeVisible();
  await expect(title).toBeVisible();

  const forwardBox = await forward.boundingBox();
  const titleBox = await title.boundingBox();
  expect(forwardBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  const gap =
    (titleBox?.x ?? 0) - ((forwardBox?.x ?? 0) + (forwardBox?.width ?? 0));
  expect(
    gap,
    `title-to-forward gap ${gap}px stays between ${TITLE_GAP_MIN} and ${TITLE_GAP_MAX}`
  ).toBeGreaterThanOrEqual(TITLE_GAP_MIN);
  expect(gap).toBeLessThanOrEqual(TITLE_GAP_MAX);

  const titlebar = page.getByTestId('electron-titlebar-row');
  const titlebarBox = await titlebar.boundingBox();
  expect(titlebarBox).not.toBeNull();
  expect(
    Math.abs((titlebarBox?.height ?? 0) - TITLEBAR_HEIGHT),
    'titlebar height is 44px'
  ).toBeLessThanOrEqual(1);

  const titlebarCenter = verticalCenter(titlebarBox!);
  for (const testId of [
    'electron-sidebar-toggle',
    'electron-nav-back',
    'electron-nav-forward',
  ] as const) {
    const box = await page.getByTestId(testId).boundingBox();
    expect(box, `${testId} bounding box`).not.toBeNull();
    expect(
      Math.abs(verticalCenter(box!) - titlebarCenter),
      `${testId} shares the titlebar centerline`
    ).toBeLessThanOrEqual(1);
  }
  expect(
    Math.abs(verticalCenter(titleBox!) - titlebarCenter),
    'header h1 shares the titlebar centerline'
  ).toBeLessThanOrEqual(1);

  const frame = page.locator('[data-app-shell-frame="true"]');
  await expect(frame).toHaveScreenshot('desktop-shell-ov-collapsed.png', {
    animations: 'disabled',
    mask: shellMasks(page),
    maxDiffPixelRatio: 0.03,
  });
});
