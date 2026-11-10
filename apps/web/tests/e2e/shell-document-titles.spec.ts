import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  setTestAuthBypassSession,
  waitForAuthenticatedHealth,
} from '../helpers/auth';
import { waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * The document title is what a browser tab (and the Electron/Mac window
 * title) and a screen reader announce. The root app layout owns
 * `title: { template: '%s | Jovie' }`, so shell pages must export their bare
 * route name: a title that already names Jovie renders the announcement
 * twice ('Links | Jovie | Jovie'), and a page without metadata falls back to
 * the bare default and never names the route.
 *
 * Prerequisite: the spec drives the real authenticated shell through the
 * isolated test server, so it fails closed when the bypass session is not
 * configured rather than silently skipping (a silent skip would report the
 * title contract as untested).
 *
 * Run:
 *   E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web exec playwright test tests/e2e/shell-document-titles.spec.ts --project=chromium
 */

// Bare route names; the root layout template appends the single `| Jovie`.
const ROUTES = [
  { path: APP_ROUTES.LINKS, paletteLabel: 'Links', title: 'Links | Jovie' },
  {
    path: APP_ROUTES.TOUR_DATES,
    paletteLabel: 'Tour dates',
    title: 'Tour Dates | Jovie',
  },
  { path: APP_ROUTES.CHATS, paletteLabel: 'Chats', title: 'Chats | Jovie' },
  {
    path: APP_ROUTES.INSIGHTS,
    paletteLabel: 'Insights',
    title: 'Insights | Jovie',
  },
] as const;

// A full document load resets this marker; client-side navigation keeps it.
type TitleNavProbeWindow = { shellTitleNavProbe?: string };
const NAV_MARKER = 'client-nav';

async function markWindowForClientNav(page: import('@playwright/test').Page) {
  await page.evaluate(marker => {
    (window as TitleNavProbeWindow).shellTitleNavProbe = marker;
  }, NAV_MARKER);
}

async function readWindowNavProbe(page: import('@playwright/test').Page) {
  return page.evaluate(
    () => (window as TitleNavProbeWindow).shellTitleNavProbe
  );
}

/**
 * The palette's keyboard controller attaches its listener in a hydration
 * effect; an SSR title plus domcontentloaded proves neither. Require the
 * hydrated shell and move focus off any editable field before sending
 * Ctrl+K (the palette's own handler ignores keystrokes from form elements).
 */
async function ensureShellReadyForPalette(
  page: import('@playwright/test').Page
) {
  await waitForHydration(page);
  await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const editable =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement ||
      active?.isContentEditable;
    if (editable) {
      active?.blur();
    }
    (document.body as HTMLElement).focus();
  });
}

test.beforeEach(async ({ page }) => {
  if (process.env.E2E_USE_TEST_AUTH_BYPASS !== '1') {
    throw new Error(
      'shell-document-titles: E2E_USE_TEST_AUTH_BYPASS=1 is required — ' +
        'the spec drives the real authenticated shell through the isolated ' +
        'test server and must fail closed, not skip, when it is missing.'
    );
  }
  await setTestAuthBypassSession(page, 'creator-ready');
  await waitForAuthenticatedHealth(page);
});

test.describe('shell document titles', () => {
  test.setTimeout(240_000);

  for (const route of ROUTES) {
    test(`${route.path} announces Jovie once on direct load`, async ({
      page,
    }) => {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveTitle(route.title);
    });
  }

  // Client navigation is exercised from one known-good starting route (the
  // app root) into every covered destination, so a wrong start-route title on
  // an older base cannot mask the navigation regressions.
  for (const route of ROUTES) {
    test(`client navigation from /app to ${route.path} keeps exactly one Jovie suffix and the route name`, async ({
      page,
    }) => {
      await page.goto(APP_ROUTES.DASHBOARD, { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);

      await markWindowForClientNav(page);
      await ensureShellReadyForPalette(page);

      await page.keyboard.press('Control+k');
      const paletteInput = page.getByTestId('command-palette-header-input');
      await expect(paletteInput).toBeVisible();
      await paletteInput.fill(route.paletteLabel);
      const option = page
        .getByRole('option', { name: new RegExp(route.paletteLabel, 'i') })
        .first();
      await expect(option).toBeVisible();
      await option.click();

      await page.waitForURL(url => url.pathname === route.path);
      await expect(page).toHaveTitle(route.title);
      expect(await readWindowNavProbe(page)).toBe(NAV_MARKER);
    });
  }
});
