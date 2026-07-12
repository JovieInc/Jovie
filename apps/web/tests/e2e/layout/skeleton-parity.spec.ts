/**
 * Skeleton -> hydrated shell-chrome parity guard.
 *
 * Regression guard for #13819, #13821, #13823 (JOV-4157 UI drift wave) and a
 * standing guard for every future shell chunk in the One App Shell program
 * (#12633): the persistent shell chrome (sidebar mount + header) must not
 * shift position or size while a route's loading skeleton is swapped for its
 * hydrated content during a client-side navigation. `DashboardShellContent`
 * (sidebar, header, `AppShellFrame`) stays mounted across in-shell route
 * changes — only the inner route segment (dispatched by
 * `apps/web/app/app/(shell)/loading.tsx` / `shell-route-matches.ts`) swaps
 * between its skeleton and hydrated content. A skeleton whose structure
 * doesn't match the loaded layout can leak into the persistent frame (e.g.
 * via a horizontal scrollbar or a reflowed content-container height); this
 * spec asserts it never does.
 *
 * How it works, per route:
 * 1. Auth via the dev bypass to a creator-ready session and land on
 *    `/app/dashboard` (the persistent shell mounts here).
 * 2. Capture the sidebar + header bounding boxes as a baseline.
 * 3. Click the sidebar nav link for the target route (client-side
 *    navigation — the same transition a real user triggers).
 * 4. Capture the sidebar + header bounding boxes immediately after the
 *    click (the route's skeleton may still be visible at this point).
 * 5. Wait for the route's hydrated content testid to appear.
 * 6. Capture the sidebar + header bounding boxes once more and assert all
 *    three snapshots are equal within 1px.
 *
 * Run:
 *   pnpm run test:web:e2e -- skeleton-parity --project=chromium
 *
 * @stability
 */

import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

const BYPASS_URL =
  '/api/dev/test-auth/enter?persona=creator-ready&redirect=/app/dashboard';

const SIDEBAR_SELECTOR = '[data-testid="app-shell-sidebar-mount"]';
const HEADER_SELECTOR = '[data-testid="dashboard-header"]';

interface RouteCase {
  readonly name: string;
  readonly path: string;
  /** Hydrated content that replaces the route's loading skeleton. */
  readonly contentSelector?: string;
  /** Loading skeleton to wait for disappearance of, when there is no single
   * stable "hydrated" content testid to assert visible instead. */
  readonly skeletonSelector?: string;
}

async function waitForRouteReady(
  page: Page,
  routeCase: RouteCase
): Promise<void> {
  if (routeCase.contentSelector) {
    await expect(page.locator(routeCase.contentSelector).first()).toBeVisible({
      timeout: 45_000,
    });
    return;
  }

  if (routeCase.skeletonSelector) {
    await expect(page.locator(routeCase.skeletonSelector)).toHaveCount(0, {
      timeout: 45_000,
    });
    return;
  }

  throw new Error(`Route case ${routeCase.name} has no readiness condition.`);
}

// Routes reachable via a direct sidebar nav link so the transition is a real
// client-side navigation (not a hard reload that would instead hit the
// layout-level cold-boot skeleton). Covers both a pre-existing dedicated
// skeleton (tasks, audience) and the new dispatch branch added for #13823
// (settings, previously fell through to the generic DashboardSegmentSkeleton).
const ROUTE_CASES: readonly RouteCase[] = [
  {
    name: 'tasks',
    path: APP_ROUTES.TASKS,
    contentSelector:
      '[data-testid="tasks-workspace"], [data-testid="tasks-upgrade-interstitial"]',
  },
  {
    name: 'audience',
    path: APP_ROUTES.AUDIENCE,
    contentSelector: '[data-testid="dashboard-audience-table"]',
  },
  {
    name: 'settings',
    path: APP_ROUTES.SETTINGS,
    skeletonSelector: '[data-testid="settings-loading-skeleton"]',
  },
];

interface ChromeBoxes {
  readonly sidebar: { x: number; y: number; width: number; height: number };
  readonly header: { x: number; y: number; width: number; height: number };
}

async function captureChromeBoxes(page: Page): Promise<ChromeBoxes> {
  const sidebar = page.locator(SIDEBAR_SELECTOR);
  const header = page.locator(HEADER_SELECTOR);

  await expect(sidebar).toBeVisible({ timeout: 30_000 });
  await expect(header).toBeVisible({ timeout: 30_000 });

  const [sidebarBox, headerBox] = await Promise.all([
    sidebar.boundingBox(),
    header.boundingBox(),
  ]);

  if (!sidebarBox || !headerBox) {
    throw new Error('Shell chrome bounding boxes were not measurable.');
  }

  return { sidebar: sidebarBox, header: headerBox };
}

function assertBoxesMatch(
  before: ChromeBoxes,
  after: ChromeBoxes,
  label: string
): void {
  const tolerancePx = 1;

  for (const key of ['sidebar', 'header'] as const) {
    const beforeBox = before[key];
    const afterBox = after[key];

    expect(
      Math.abs(beforeBox.x - afterBox.x),
      `${label}: ${key} x shifted`
    ).toBeLessThanOrEqual(tolerancePx);
    expect(
      Math.abs(beforeBox.y - afterBox.y),
      `${label}: ${key} y shifted`
    ).toBeLessThanOrEqual(tolerancePx);
    expect(
      Math.abs(beforeBox.width - afterBox.width),
      `${label}: ${key} width shifted`
    ).toBeLessThanOrEqual(tolerancePx);
    expect(
      Math.abs(beforeBox.height - afterBox.height),
      `${label}: ${key} height shifted`
    ).toBeLessThanOrEqual(tolerancePx);
  }
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Skeleton parity across shell routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BYPASS_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/app\/dashboard/, { timeout: 60_000 });
    await captureChromeBoxes(page); // shell fully mounted before we start clicking
  });

  for (const routeCase of ROUTE_CASES) {
    test(`${routeCase.name} shell chrome does not shift between skeleton and hydrated states`, async ({
      page,
    }) => {
      test.setTimeout(60_000);

      const baselineBoxes = await captureChromeBoxes(page);

      const navLink = page.locator(`a[href="${routeCase.path}"]`).first();
      await expect(navLink).toBeVisible({ timeout: 30_000 });
      await navLink.click();
      await page.waitForURL(url => url.pathname.startsWith(routeCase.path), {
        timeout: 30_000,
      });

      // Captured immediately after the client-side transition starts — the
      // route's loading skeleton may still be visible here.
      const duringTransitionBoxes = await captureChromeBoxes(page);
      assertBoxesMatch(
        baselineBoxes,
        duringTransitionBoxes,
        `${routeCase.name} (baseline -> during transition)`
      );

      await waitForRouteReady(page, routeCase);

      const hydratedBoxes = await captureChromeBoxes(page);
      assertBoxesMatch(
        duringTransitionBoxes,
        hydratedBoxes,
        `${routeCase.name} (during transition -> hydrated)`
      );
    });
  }
});
