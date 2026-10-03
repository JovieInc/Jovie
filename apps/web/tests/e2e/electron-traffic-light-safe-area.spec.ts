/**
 * Nothing may render under the macOS traffic lights in the Mac app.
 *
 * The desktop BrowserWindow uses titleBarStyle 'hiddenInset', so the native
 * close/minimize/zoom buttons paint over the top-left of every page the window
 * loads: the app shell, public marketing pages, and admin banners alike. A web
 * screenshot cannot see those buttons, so this spec checks geometry instead:
 * with the real desktop user agent (which marks the runtime before paint), no
 * visible text, image, icon, or control may intersect the button rectangle.
 *
 * Run:
 *   doppler run --project jovie-web --config dev -- env E2E_USE_TEST_AUTH_BYPASS=1 \
 *     pnpm --filter @jovie/web exec playwright test \
 *     tests/e2e/electron-traffic-light-safe-area.spec.ts --project=chromium
 *
 * @smoke
 */

import { expect, type Page, test } from '@playwright/test';

// apps/desktop/src/main.ts MACOS_TRAFFIC_LIGHT_POSITION (20, 17) with three
// 14px buttons and 6px gaps; pad by 4px so glyphs cannot kiss the buttons.
const TRAFFIC_LIGHTS = { left: 16, top: 13, right: 78, bottom: 35 } as const;

const MAC_DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Electron/38.0.0 Safari/537.36 ' +
  'JovieDesktop/26.9.16';

test.use({
  userAgent: MAC_DESKTOP_USER_AGENT,
  viewport: { width: 1024, height: 768 },
  storageState: { cookies: [], origins: [] },
});

async function installPreloadBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { platform: 'darwin' },
    });
    // Mirror apps/desktop/src/preload.ts markElectronRuntime().
    const mark = () => {
      document.documentElement.dataset.desktopRuntime = 'electron';
      document.documentElement.dataset.electronPlatform = 'darwin';
    };
    if (document.documentElement) mark();
    document.addEventListener('DOMContentLoaded', mark, { once: true });
  });
}

interface Intrusion {
  readonly what: string;
  readonly rect: { x: number; y: number; width: number; height: number };
}

function findTrafficLightIntrusions(page: Page): Promise<Intrusion[]> {
  return page.evaluate(lights => {
    const hits: Intrusion[] = [];
    const intersects = (rect: DOMRect) =>
      rect.width > 0 &&
      rect.height > 0 &&
      rect.left < lights.right &&
      rect.right > lights.left &&
      rect.top < lights.bottom &&
      rect.bottom > lights.top;
    const shown = (element: Element) => {
      if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
        return true;
      }
      if (element.closest('[aria-hidden="true"], [hidden], [inert]')) {
        return false;
      }
      // sr-only content is clipped to a 1px box and never paints.
      for (
        let node: Element | null = element;
        node && node !== document.body;
        node = node.parentElement
      ) {
        const box = node.getBoundingClientRect();
        if (
          box.width <= 1 &&
          box.height <= 1 &&
          getComputedStyle(node).overflow !== 'visible'
        ) {
          return false;
        }
      }
      const style = getComputedStyle(element);
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity) > 0.05
      );
    };
    const describe = (element: Element) =>
      `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}` +
      `${element.getAttribute('data-testid') ? `[data-testid=${element.getAttribute('data-testid')}]` : ''}` +
      ` "${(element.textContent ?? element.getAttribute('aria-label') ?? '').trim().slice(0, 40)}"`;
    const record = (what: string, rect: DOMRect) =>
      hits.push({
        what,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim() || !node.parentElement) continue;
      if (!shown(node.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (intersects(rect))
          record(`text in ${describe(node.parentElement)}`, rect);
      }
    }
    for (const element of document.body.querySelectorAll(
      'img, svg, video, canvas, button, a, input, [role="button"]'
    )) {
      if (element.parentElement?.closest('svg')) continue;
      if (!shown(element)) continue;
      const rect = element.getBoundingClientRect();
      if (intersects(rect)) record(describe(element), rect);
    }
    return hits;
  }, TRAFFIC_LIGHTS);
}

async function expectNothingUnderTrafficLights(page: Page, route: string) {
  await expect(page.locator('html')).toHaveAttribute(
    'data-electron-platform',
    'darwin'
  );
  // Let fonts, reveal animations, and late client chrome settle first.
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
  // Polling also rides out a client redirect that lands mid-probe.
  await expect
    .poll(
      () =>
        findTrafficLightIntrusions(page).catch((error: Error) => [
          {
            what: `probe interrupted: ${error.message}`,
            rect: { x: 0, y: 0, width: 0, height: 0 },
          },
        ]),
      {
        message: `${route} renders content under the macOS traffic lights`,
        timeout: 20_000,
      }
    )
    .toEqual([]);
}

const PUBLIC_ROUTES = ['/', '/changelog', '/pricing', '/signin'] as const;

for (const route of PUBLIC_ROUTES) {
  test(`public ${route} clears the macOS traffic lights`, async ({ page }) => {
    test.setTimeout(180_000);
    await installPreloadBridge(page);
    await page.goto(route, { timeout: 120_000, waitUntil: 'domcontentloaded' });
    await expectNothingUnderTrafficLights(page, route);
  });
}

test('the focused skip link clears the macOS traffic lights', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await installPreloadBridge(page);
  await page.goto('/changelog', {
    timeout: 120_000,
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-skip-to-content="true"]').first().focus();
  await expectNothingUnderTrafficLights(page, 'focused skip link');
});

const SHELL_ROUTES = [
  { route: '/app/ov/people', persona: 'admin' },
  { route: '/app/profiles', persona: 'admin' },
] as const;

for (const { route, persona } of SHELL_ROUTES) {
  test(`app ${route} clears the macOS traffic lights`, async ({ page }) => {
    test.skip(
      process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
      'Requires E2E_USE_TEST_AUTH_BYPASS=1'
    );
    test.setTimeout(240_000);
    await installPreloadBridge(page);
    await page.goto(
      `/api/dev/test-auth/enter?persona=${persona}&redirect=${encodeURIComponent(route)}`,
      { timeout: 180_000, waitUntil: 'domcontentloaded' }
    );
    await expect(page.locator('[data-app-shell-frame="true"]')).toBeVisible({
      timeout: 120_000,
    });
    await expectNothingUnderTrafficLights(page, route);
  });
}
