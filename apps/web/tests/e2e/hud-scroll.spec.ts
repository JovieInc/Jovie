import { expect, test } from '@playwright/test';
import {
  assertBottomReachable,
  assertScrollable,
} from '../helpers/scroll-assertions';

/**
 * Regression coverage for the class of bug where a parent's
 * `overflow: hidden` traps content past the viewport so the user cannot
 * wheel-scroll to reach it. The original /hud defect: globals.css defaults
 * `html, body { overflow-y: hidden }` and every route opts out via a
 * marker class — the HUD never opted out.
 *
 * The helper enforces a real wheel-scroll motion check, not just
 * `scrollIntoView`, so the test fails when the document scroll is locked
 * even if the marker would visually scroll into view via JS.
 *
 * @scroll @layout-guard
 */

const APP_SHELL_SCROLL_SELECTOR = '[data-testid="app-shell-scroll"]';

async function resolveRouteScrollSelector(
  page: import('@playwright/test').Page,
  routeLabel: string,
  preferredSelector?: string
): Promise<string | null> {
  return page.evaluate(
    ({ label, preferred }) => {
      const shellScroll = document.querySelector(
        '[data-testid="app-shell-scroll"]'
      ) as HTMLElement | null;
      if (!shellScroll) {
        return null;
      }

      const probeId = label.replaceAll(/\s+/g, '-');

      const isScrollable = (element: HTMLElement) => {
        const style = globalThis.getComputedStyle(element);
        const overflowY = style.overflowY;
        return (
          overflowY === 'auto' ||
          overflowY === 'scroll' ||
          overflowY === 'overlay'
        );
      };

      const markProbe = (element: HTMLElement) => {
        element.setAttribute('data-route-scroll-probe', probeId);
        return `[data-route-scroll-probe="${probeId}"]`;
      };

      const preferredElement = preferred
        ? (document.querySelector(preferred) as HTMLElement | null)
        : null;

      if (preferredElement) {
        let cursor: HTMLElement | null = preferredElement;
        while (cursor && shellScroll.contains(cursor)) {
          if (isScrollable(cursor)) {
            return markProbe(cursor);
          }
          cursor = cursor.parentElement;
        }
      }

      const ownedScrollPane = Array.from(
        shellScroll.querySelectorAll<HTMLElement>('*')
      ).find(isScrollable);

      if (ownedScrollPane) {
        return markProbe(ownedScrollPane);
      }

      return isScrollable(shellScroll)
        ? '[data-testid="app-shell-scroll"]'
        : null;
    },
    { label: routeLabel, preferred: preferredSelector ?? null }
  );
}

test.describe('HUD kiosk scroll regression', () => {
  // Kiosk page is token-gated, so storageState (which carries the admin
  // session, when present) is not required. Start with a clean context to
  // make the test runnable in any auth environment.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('bottom card is reachable via wheel scroll at 1280x720', async ({
    page,
  }) => {
    const token = process.env.HUD_KIOSK_TOKEN;
    test.skip(
      !token,
      'HUD_KIOSK_TOKEN not set in env (Doppler) — skip kiosk scroll check'
    );

    await page.goto(`/hud?kiosk=${encodeURIComponent(token!)}`);
    await expect(page.getByTestId('hud-bottom-marker')).toBeAttached();

    await assertBottomReachable(page, 'hud-bottom-marker');
  });

  test('bottom card is reachable at narrow viewport (1280x600)', async ({
    page,
  }) => {
    const token = process.env.HUD_KIOSK_TOKEN;
    test.skip(
      !token,
      'HUD_KIOSK_TOKEN not set in env (Doppler) — skip kiosk scroll check'
    );

    await page.goto(`/hud?kiosk=${encodeURIComponent(token!)}`);
    await expect(page.getByTestId('hud-bottom-marker')).toBeAttached();

    await assertBottomReachable(page, 'hud-bottom-marker', {
      viewportHeight: 600,
    });
  });
});

test.describe('App-shell scroll-pane regression', () => {
  // Use the dev-auth bypass to provision an admin session deterministically.
  // Storage state is cleared so the bypass cookies are the only auth signal.
  test.use({ storageState: { cookies: [], origins: [] } });

  const adminRoutes = [
    {
      label: 'admin overview',
      bypass: '/api/dev/test-auth/enter?persona=admin&redirect=/app/admin',
      expectedPath: /\/app\/admin/,
      scrollSelector: '[data-testid="admin-overview-page"]',
    },
    {
      label: 'dashboard earnings',
      bypass:
        '/api/dev/test-auth/enter?persona=creator-ready&redirect=/app/dashboard/earnings',
      expectedPath: /\/app\/dashboard\/earnings/,
      scrollSelector: '[data-testid="dashboard-earnings-content-panel"]',
    },
    {
      label: 'dashboard audience',
      bypass:
        '/api/dev/test-auth/enter?persona=creator-ready&redirect=/app/audience',
      expectedPath: /\/app\/audience/,
      scrollSelector: '[data-testid="dashboard-audience-table"]',
    },
  ] as const;

  for (const route of adminRoutes) {
    test(`${route.label} scroll pane is wheel-scrollable when content overflows`, async ({
      page,
    }) => {
      test.skip(
        process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
        'dev-auth bypass not enabled — set E2E_USE_TEST_AUTH_BYPASS=1'
      );

      // Pin the viewport BEFORE the overflow pre-check so it matches the
      // viewport that `assertScrollable` will measure at. Without this, a
      // taller runner-default viewport could let the pre-check pass while
      // the helper's stricter overflow precondition fails at 1280x720,
      // surfacing a hard error where we intended a clean test.skip.
      await page.setViewportSize({ width: 1280, height: 720 });

      await page.goto(route.bypass);
      await page.waitForURL(route.expectedPath, { timeout: 30_000 });

      // Wait for the shell scroll clip to mount before measuring route-owned panes.
      await expect(page.locator(APP_SHELL_SCROLL_SELECTOR)).toBeVisible({
        timeout: 30_000,
      });

      // Allow Suspense-loaded sections to settle so `scrollHeight` is stable
      // before the assertion runs. networkidle is gated to ~5s to avoid
      // flakiness on chatty routes.
      await page
        .waitForLoadState('networkidle', { timeout: 5_000 })
        .catch(() => {});

      const scrollSelector = await resolveRouteScrollSelector(
        page,
        route.label,
        route.scrollSelector
      );
      test.skip(
        !scrollSelector,
        `${route.label} has no route-owned scroll pane at 1280x720`
      );

      // Skip the assertion if the route's natural content fits in the
      // viewport (legitimately short page) — the assertion would false-fail
      // by the helper's own precondition. This is intentional: the test is
      // a guard for routes that DO overflow.
      const overflows = await page.evaluate(sel => {
        const el = document.querySelector(sel) as HTMLElement | null;
        return el ? el.scrollHeight > el.clientHeight + 4 : false;
      }, scrollSelector);
      test.skip(
        !overflows,
        `${route.label} content fits in viewport at 1280x720 — nothing to scroll`
      );

      await assertScrollable(page, {
        containerSelector: scrollSelector,
      });
    });
  }
});
