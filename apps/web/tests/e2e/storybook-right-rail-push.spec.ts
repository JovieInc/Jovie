import { expect, type Page, test } from '@playwright/test';

/**
 * Founder call (2026-11-08): the open or pinned desktop right rail pushes the
 * route and never lays on top of it. Every frame of the opening allocation,
 * the settled open state and the closing allocation must keep the route's
 * right edge at or left of the rail's left edge, with no horizontal overflow.
 * The transient hover/focus preview alone may float over the route.
 */

const pushStory =
  '/iframe.html?id=organisms-appshellframe--push-inspector&viewMode=story';
const previewStory =
  '/iframe.html?id=organisms-appshellframe--preview-overlay-inspector&viewMode=story';
const TOGGLE = '[data-rail-toggle="right"]';
const DRAWER = '#story-inspector';

async function useRealMotion(page: Page) {
  // Storybook freezes animation and forces reduced motion for snapshots; the
  // allocation must be proven with the browser's real media preference.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'matchMedia', {
      value: window.matchMedia.bind(window),
      configurable: false,
      writable: false,
    });
    new MutationObserver(() => {
      document
        .querySelectorAll('style[data-jovie-storybook-fixtures]')
        .forEach(node => node.remove());
    }).observe(document, { childList: true, subtree: true });
  });
}

interface Frame {
  readonly phase: string | null;
  readonly routeRight: number;
  readonly railLeft: number;
  readonly railWidth: number;
  readonly pageOverflowX: number;
}

/** Samples route/rail geometry every frame until the drawer settles. */
async function sampleUntilSettled(page: Page, settled: 'open' | 'closed') {
  return page.evaluate(
    ({ drawerSelector, settled }) =>
      new Promise<Frame[]>(resolve => {
        const frames: Frame[] = [];
        const started = performance.now();
        const tick = () => {
          const route = document.querySelector('main')!;
          const drawer = document.querySelector<HTMLElement>(drawerSelector)!;
          const rail = drawer.getBoundingClientRect();
          const phase = drawer.getAttribute('data-rail-phase');
          frames.push({
            phase,
            routeRight: route.getBoundingClientRect().right,
            railLeft: rail.left,
            railWidth: rail.width,
            pageOverflowX:
              document.documentElement.scrollWidth - window.innerWidth,
          });
          if (
            (phase === settled && frames.length > 2) ||
            performance.now() - started > 3000
          ) {
            resolve(frames);
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { drawerSelector: DRAWER, settled }
  );
}

function expectNoOverlap(frames: readonly Frame[], step: string) {
  for (const [index, frame] of frames.entries()) {
    // A closed, zero-width drawer has nothing to overlap.
    if (frame.railWidth < 1) continue;
    expect(
      frame.routeRight,
      `${step} frame ${index} (${frame.phase}): route right edge must sit at or left of the rail`
    ).toBeLessThanOrEqual(frame.railLeft + 0.5);
    expect(
      frame.pageOverflowX,
      `${step} frame ${index}: no horizontal overflow`
    ).toBeLessThanOrEqual(0);
  }
}

test.beforeEach(async ({ page }) => useRealMotion(page));

for (const width of [1440, 1126, 1024]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`open right rail pushes the route at ${width}, ${reducedMotion}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion });
      await page.goto(pushStory);
      const toggle = page.locator(TOGGLE);
      await expect(toggle).toBeVisible({ timeout: 90_000 });
      const route = page.locator('main');
      const closedRoute = (await route.boundingBox())!;

      await toggle.click();
      const opening = await sampleUntilSettled(page, 'open');
      expect(opening.at(-1)?.phase).toBe('open');
      expectNoOverlap(opening, 'opening');

      const drawer = page.locator(DRAWER);
      const [openRoute, openRail] = await Promise.all([
        route.boundingBox(),
        drawer.boundingBox(),
      ]);
      expect(openRail!.width).toBeGreaterThan(0);
      expect(
        openRoute!.x + openRoute!.width,
        'open rail pushes the route instead of covering it'
      ).toBeLessThanOrEqual(openRail!.x + 0.5);
      // The rail reads as a sibling panel: the same shell gap as the left rail
      // separates it from the route.
      const gap = await page.evaluate(() =>
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--app-shell-gap'
          )
        )
      );
      expect(openRail!.x - (openRoute!.x + openRoute!.width)).toBeCloseTo(
        gap,
        0
      );
      expect(openRoute!.width).toBeLessThan(closedRoute.width);

      await toggle.click();
      const closing = await sampleUntilSettled(page, 'closed');
      expect(closing.at(-1)?.phase).toBe('closed');
      expectNoOverlap(closing, 'closing');
      await expect
        .poll(async () => (await route.boundingBox())?.width)
        .toBeCloseTo(closedRoute.width, 0);
    });
  }
}

test('hover preview floats without moving the route, and pinning it pushes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(previewStory);
  const toggle = page.locator(TOGGLE);
  await expect(toggle).toBeVisible({ timeout: 90_000 });
  const route = page.locator('main');
  const closedRoute = (await route.boundingBox())!;
  const drawer = page.locator(DRAWER);

  await toggle.hover();
  await expect(drawer).toHaveAttribute('data-rail-presentation', 'overlay');
  await expect(drawer).toHaveAttribute('data-rail-phase', 'open');
  expect(await route.boundingBox()).toEqual(closedRoute);

  await toggle.click();
  await expect(drawer).toHaveAttribute('data-rail-presentation', 'push');
  await expect
    .poll(async () => {
      const [r, d] = await Promise.all([
        route.boundingBox(),
        drawer.boundingBox(),
      ]);
      return r && d ? d.x - (r.x + r.width) : -1;
    })
    .toBeGreaterThanOrEqual(-0.5);
});
