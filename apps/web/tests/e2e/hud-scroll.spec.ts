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
    },
    {
      label: 'dashboard earnings',
      bypass:
        '/api/dev/test-auth/enter?persona=creator-ready&redirect=/app/dashboard/earnings',
      expectedPath: /\/app\/dashboard\/earnings/,
    },
    {
      label: 'dashboard audience',
      bypass:
        '/api/dev/test-auth/enter?persona=creator-ready&redirect=/app/dashboard/audience',
      expectedPath: /\/app\/dashboard\/audience/,
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

      await page.goto(route.bypass);
      await page.waitForURL(route.expectedPath, { timeout: 30_000 });

      // Wait for the shell scroll container to mount before measuring.
      await expect(page.locator(APP_SHELL_SCROLL_SELECTOR)).toBeVisible({
        timeout: 30_000,
      });

      // Allow Suspense-loaded sections to settle so `scrollHeight` is stable
      // before the assertion runs. networkidle is gated to ~5s to avoid
      // flakiness on chatty routes.
      await page
        .waitForLoadState('networkidle', { timeout: 5_000 })
        .catch(() => {});

      // Skip the assertion if the route's natural content fits in the
      // viewport (legitimately short page) — the assertion would false-fail
      // by the helper's own precondition. This is intentional: the test is
      // a guard for routes that DO overflow.
      const overflows = await page.evaluate(sel => {
        const el = document.querySelector(sel) as HTMLElement | null;
        return el ? el.scrollHeight > el.clientHeight + 4 : false;
      }, APP_SHELL_SCROLL_SELECTOR);
      test.skip(
        !overflows,
        `${route.label} content fits in viewport at 1280x720 — nothing to scroll`
      );

      await assertScrollable(page, {
        containerSelector: APP_SHELL_SCROLL_SELECTOR,
      });
    });
  }
});
