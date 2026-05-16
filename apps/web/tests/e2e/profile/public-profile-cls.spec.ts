import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { installPublicRouteMocks } from '../utils/public-surface-helpers';
import { waitForHydration } from '../utils/smoke-test-utils';

type ClsRoute = {
  readonly id: string;
  readonly path: string;
  readonly expectedArtistName: string;
  readonly targetSelector: string;
  readonly budget: number;
  readonly readySelectors?: readonly string[];
};

type LayoutShiftSourceSnapshot = {
  readonly previousRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
  readonly currentRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
  readonly tag: string | null;
  readonly testId: string | null;
  readonly text: string | null;
};

type LayoutShiftSnapshot = {
  readonly value: number;
  readonly startTime: number;
  readonly sources: readonly LayoutShiftSourceSnapshot[];
};

declare global {
  interface Window {
    __profileCls?: number;
    __profileLayoutShifts?: LayoutShiftSnapshot[];
  }
}

const DESKTOP_LIGHTHOUSE_VIEWPORT = { width: 1350, height: 940 } as const;
const CLS_ROUTES: readonly ClsRoute[] = [
  {
    id: 'profile-main',
    path: '/dualipa',
    expectedArtistName: 'Dua Lipa',
    targetSelector: '[data-testid="profile-desktop-surface"]',
    budget: 0.05,
  },
  {
    id: 'profile-listen',
    path: '/dualipa?mode=listen',
    expectedArtistName: 'Dua Lipa',
    targetSelector: '[data-testid="profile-desktop-surface"]',
    budget: 0.05,
  },
  {
    id: 'profile-subscribe',
    path: '/dualipa?mode=subscribe',
    expectedArtistName: 'Dua Lipa',
    targetSelector: '[data-testid="profile-desktop-surface"]',
    budget: 0.05,
    readySelectors: ['[data-testid="profile-mobile-notifications-flow"]'],
  },
  {
    id: 'profile-notifications',
    path: '/testartist/notifications',
    expectedArtistName: 'Test Artist',
    targetSelector: '[data-testid="notifications-page"]',
    budget: 0.05,
    readySelectors: ['[data-testid="profile-mobile-notifications-flow"]'],
  },
];

test.use({
  storageState: { cookies: [], origins: [] },
});

async function installClsObserver(page: Page) {
  await page.addInitScript(() => {
    window.__profileCls = 0;
    window.__profileLayoutShifts = [];

    type LayoutShiftAttribution = {
      readonly node?: Node;
      readonly previousRect?: DOMRectReadOnly;
      readonly currentRect?: DOMRectReadOnly;
    };
    type LayoutShiftEntry = PerformanceEntry & {
      readonly value: number;
      readonly hadRecentInput: boolean;
      readonly sources?: readonly LayoutShiftAttribution[];
    };

    const serializeRect = (rect: DOMRectReadOnly | undefined) =>
      rect
        ? {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          }
        : null;

    new PerformanceObserver(list => {
      for (const entry of list.getEntries() as LayoutShiftEntry[]) {
        if (entry.hadRecentInput) {
          continue;
        }

        window.__profileCls = (window.__profileCls ?? 0) + entry.value;
        window.__profileLayoutShifts?.push({
          value: entry.value,
          startTime: entry.startTime,
          sources: (entry.sources ?? []).map(source => {
            const node =
              source.node?.nodeType === Node.TEXT_NODE
                ? source.node.parentElement
                : source.node;
            const element = node instanceof HTMLElement ? node : null;
            return {
              previousRect: serializeRect(source.previousRect),
              currentRect: serializeRect(source.currentRect),
              tag: element?.tagName ?? null,
              testId: element?.getAttribute('data-testid') ?? null,
              text:
                element?.textContent
                  ?.trim()
                  .replace(/\s+/g, ' ')
                  .slice(0, 160) ?? null,
            };
          }),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

async function waitForAnyAttached(page: Page, selectors: readonly string[]) {
  await expect
    .poll(
      async () => {
        for (const selector of selectors) {
          const count = await page
            .locator(selector)
            .first()
            .count()
            .catch(() => false);
          if (count) {
            return selector;
          }
        }
        return null;
      },
      {
        timeout: 60_000,
        message: `Expected one of these selectors to attach: ${selectors.join(', ')}`,
      }
    )
    .not.toBeNull();
}

function isUnavailablePage(text: string): boolean {
  const body = text.toLowerCase();
  return (
    body.includes('profile not found') ||
    body.includes('temporarily unavailable') ||
    body.includes('loading jovie profile') ||
    body.includes('application error') ||
    body.includes('internal server error') ||
    body.includes('unhandled runtime error')
  );
}

async function assertSeededSurfaceRendered(
  page: Page,
  route: ClsRoute,
  testInfo: TestInfo
) {
  await expect
    .poll(
      async () => {
        const bodyText = await page
          .locator('body')
          .innerText()
          .catch(() => '');
        return bodyText.includes(route.expectedArtistName);
      },
      {
        timeout: 60_000,
        message: `${route.path} did not render seeded profile content for ${route.expectedArtistName}`,
      }
    )
    .toBe(true);

  const bodyText = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  expect(
    isUnavailablePage(bodyText),
    `${route.path} rendered an unavailable/error page: ${bodyText.slice(0, 240)}`
  ).toBe(false);

  await expect(
    page.locator(route.targetSelector).first(),
    `${route.path} must attach the target profile surface before CLS is measured`
  ).toHaveCount(1, { timeout: 60_000 });

  if (route.readySelectors) {
    await waitForAnyAttached(page, route.readySelectors);
  }

  const diagnostics = {
    url: page.url(),
    route: route.path,
    bodyText: bodyText.slice(0, 1000),
    targetSelector: route.targetSelector,
    targetCount: await page.locator(route.targetSelector).count(),
    reservedDesktopCount: await page
      .locator('[data-testid="profile-desktop-surface-reserved"]')
      .count(),
  };

  await testInfo.attach(`${route.id}-surface-diagnostics`, {
    body: JSON.stringify(diagnostics, null, 2),
    contentType: 'application/json',
  });
}

test.describe('Public profile desktop CLS @regression', () => {
  test.setTimeout(120_000);

  for (const route of CLS_ROUTES) {
    test(`${route.id} stays below CLS budget`, async ({ page }, testInfo) => {
      await page.setViewportSize(DESKTOP_LIGHTHOUSE_VIEWPORT);
      await installPublicRouteMocks(page);
      await installClsObserver(page);

      const response = await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });
      expect(
        response?.status() ?? 0,
        `${route.path} should not server-error`
      ).toBeLessThan(500);

      await waitForHydration(page);
      await assertSeededSurfaceRendered(page, route, testInfo);
      await page
        .waitForLoadState('networkidle', { timeout: 15_000 })
        .catch(() => {});
      await page.waitForTimeout(3000);

      const result = await page.evaluate(() => ({
        cls: window.__profileCls ?? 0,
        shifts: window.__profileLayoutShifts ?? [],
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      }));

      await testInfo.attach(`${route.id}-cls`, {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json',
      });

      expect(result.viewport).toEqual(DESKTOP_LIGHTHOUSE_VIEWPORT);
      expect(
        result.cls,
        `${route.path} CLS ${result.cls.toFixed(6)} exceeded ${route.budget}`
      ).toBeLessThanOrEqual(route.budget);
    });
  }
});
