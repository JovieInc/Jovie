/** Holds each route's RSC request to measure its skeleton and hydrated root. */

import {
  expect,
  type Locator,
  type Page,
  type Request,
  type Route,
  test,
} from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

const BYPASS_URL =
  '/api/dev/test-auth/enter?persona=creator-ready&redirect=/app/dashboard';

const SIDEBAR_SELECTOR = '[data-testid="app-shell-sidebar-mount"]';
const HEADER_SELECTOR = '[data-testid="dashboard-header"]';

interface RouteCase {
  readonly name: string;
  readonly path: string;
  readonly skeletonSelector: string;
  readonly contentSelector: string;
}

const ROUTE_CASES: readonly RouteCase[] = [
  {
    name: 'tasks',
    path: APP_ROUTES.TASKS,
    skeletonSelector: '[data-testid="tasks-route-skeleton"]',
    contentSelector:
      '[data-testid="tasks-workspace"], [data-testid="tasks-upgrade-interstitial"]',
  },
  {
    name: 'audience',
    path: APP_ROUTES.AUDIENCE,
    skeletonSelector: '[data-testid="dashboard-audience-loading"]',
    contentSelector: '[data-testid="dashboard-audience-table"]',
  },
  {
    name: 'settings',
    path: APP_ROUTES.SETTINGS,
    skeletonSelector: '[data-testid="settings-route-skeleton"]',
    contentSelector: '[data-testid="settings-shell-content"]',
  },
];

interface ElementBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ChromeBoxes {
  readonly sidebar: ElementBox;
  readonly header: ElementBox;
}

function isRscRequest(request: Request): boolean {
  try {
    if (new URL(request.url()).searchParams.has('_rsc')) return true;
  } catch {
    return false;
  }

  const headers = request.headers();
  return headers.rsc === '1' || headers.accept?.includes('text/x-component');
}

function requestMatchesPath(request: Request, path: string): boolean {
  try {
    const pathname = new URL(request.url()).pathname;
    return pathname === path || pathname.startsWith(`${path}/`);
  } catch {
    return false;
  }
}

interface HeldRscTransition {
  readonly requestStarted: Promise<void>;
  readonly heldRequestCount: () => number;
  readonly release: () => void;
  readonly dispose: () => Promise<void>;
}

async function holdRscTransition(
  page: Page,
  path: string
): Promise<HeldRscTransition> {
  let resolveRequestStarted: (() => void) | undefined;
  let resolveRelease: (() => void) | undefined;
  let released = false;
  let heldRequestCount = 0;

  const requestStarted = new Promise<void>(resolve => {
    resolveRequestStarted = resolve;
  });
  const releaseGate = new Promise<void>(resolve => {
    resolveRelease = resolve;
  });

  const release = () => {
    if (released) return;
    released = true;
    resolveRelease?.();
  };

  const handler = async (route: Route) => {
    const request = route.request();
    if (!requestMatchesPath(request, path) || !isRscRequest(request)) {
      await route.continue();
      return;
    }

    heldRequestCount += 1;
    resolveRequestStarted?.();
    await releaseGate;
    await route.continue();
  };

  await page.route('**/*', handler);

  return {
    requestStarted,
    heldRequestCount: () => heldRequestCount,
    release,
    dispose: async () => {
      release();
      await page.unroute('**/*', handler);
    },
  };
}

async function captureBox(
  locator: Locator,
  label: string
): Promise<ElementBox> {
  await expect(locator, `${label}: element is visible`).toBeVisible({
    timeout: 30_000,
  });
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`${label}: bounding box was not measurable.`);
  }
  return box;
}

async function captureChromeBoxes(page: Page): Promise<ChromeBoxes> {
  const [sidebar, header] = await Promise.all([
    captureBox(page.locator(SIDEBAR_SELECTOR), 'shell sidebar'),
    captureBox(page.locator(HEADER_SELECTOR), 'shell header'),
  ]);

  return { sidebar, header };
}

function assertBoxMatches(
  before: ElementBox,
  after: ElementBox,
  label: string
): void {
  const tolerancePx = 1;

  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(
      Math.abs(before[key] - after[key]),
      `${label}: ${key} shifted`
    ).toBeLessThanOrEqual(tolerancePx);
  }
}

function assertChromeBoxesMatch(
  before: ChromeBoxes,
  after: ChromeBoxes,
  label: string
): void {
  assertBoxMatches(before.sidebar, after.sidebar, `${label}: sidebar`);
  assertBoxMatches(before.header, after.header, `${label}: header`);
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Skeleton parity across shell routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  for (const routeCase of ROUTE_CASES) {
    test(`${routeCase.name} keeps shell chrome and route-content geometry stable`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const heldTransition = await holdRscTransition(page, routeCase.path);

      try {
        await page.goto(BYPASS_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(/\/app\/dashboard/, { timeout: 60_000 });
        const baselineBoxes = await captureChromeBoxes(page);

        const navLink = page.locator(`a[href="${routeCase.path}"]`).first();
        await expect(navLink).toBeVisible({ timeout: 30_000 });
        await navLink.click({ noWaitAfter: true });
        await heldTransition.requestStarted;
        expect(heldTransition.heldRequestCount()).toBeGreaterThan(0);

        const skeleton = page.locator(routeCase.skeletonSelector).first();
        await expect(
          skeleton,
          `${routeCase.name}: route-specific skeleton mounted during held RSC transition`
        ).toBeVisible({ timeout: 30_000 });

        const [duringTransitionBoxes, skeletonBox] = await Promise.all([
          captureChromeBoxes(page),
          captureBox(skeleton, `${routeCase.name} skeleton root`),
        ]);
        assertChromeBoxesMatch(
          baselineBoxes,
          duringTransitionBoxes,
          `${routeCase.name} baseline -> skeleton`
        );

        heldTransition.release();
        await page.waitForURL(url => url.pathname.startsWith(routeCase.path), {
          timeout: 30_000,
        });

        const content = page.locator(routeCase.contentSelector).first();
        await expect(content).toBeVisible({ timeout: 45_000 });
        await expect(skeleton).toHaveCount(0, { timeout: 45_000 });

        const [hydratedBoxes, contentBox] = await Promise.all([
          captureChromeBoxes(page),
          captureBox(content, `${routeCase.name} hydrated content root`),
        ]);
        assertChromeBoxesMatch(
          duringTransitionBoxes,
          hydratedBoxes,
          `${routeCase.name} skeleton -> hydrated`
        );
        assertBoxMatches(
          skeletonBox,
          contentBox,
          `${routeCase.name} route content skeleton -> hydrated`
        );
      } finally {
        await heldTransition.dispose();
      }
    });
  }
});
