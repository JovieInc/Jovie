import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  setTestAuthBypassSession,
  waitForAuthenticatedHealth,
} from '../helpers/auth';

test.use({ storageState: { cookies: [], origins: [] } });
test.skip(
  process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
  'Requires E2E_USE_TEST_AUTH_BYPASS=1'
);

/**
 * The document title is what a browser tab (and the Electron/Mac window
 * title) and a screen reader announce. The root app layout owns
 * `title: { template: '%s | Jovie' }`, so shell pages must export their bare
 * route name: a title that already names Jovie renders the announcement
 * twice ('Links | Jovie | Jovie'), and a page without metadata falls back to
 * the bare default and never names the route.
 *
 * Run:
 *   E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web exec playwright test tests/e2e/shell-document-titles.spec.ts --project=chromium
 */

// Bare route names; the root layout template appends the single `| Jovie`.
const ROUTES = [
  { path: APP_ROUTES.LINKS, title: 'Links | Jovie' },
  { path: APP_ROUTES.TOUR_DATES, title: 'Tour Dates | Jovie' },
  { path: APP_ROUTES.CHATS, title: 'Chats | Jovie' },
  { path: APP_ROUTES.INSIGHTS, title: 'Insights | Jovie' },
] as const;

test.beforeEach(async ({ page }) => {
  await setTestAuthBypassSession(page, 'creator-ready');
  await waitForAuthenticatedHealth(page);
});

test.describe('shell document titles', () => {
  test.setTimeout(120_000);

  for (const route of ROUTES) {
    test(`${route.path} announces Jovie once on direct load`, async ({
      page,
    }) => {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveTitle(route.title);
    });
  }

  test('client navigation keeps exactly one Jovie suffix and the route name', async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.LINKS, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle('Links | Jovie');

    // Mark the window: a full reload resets it, client navigation keeps it.
    await page.evaluate(() => {
      (window as { shellTitleNavProbe?: string }).shellTitleNavProbe =
        'client-nav';
    });

    // Client-navigate through the shell command palette (Ctrl/Cmd+K).
    await page.keyboard.press('Control+k');
    const paletteInput = page.getByTestId('command-palette-header-input');
    await expect(paletteInput).toBeVisible();
    await paletteInput.fill('Tour dates');
    await page
      .getByRole('option', { name: /tour dates/i })
      .first()
      .click();

    await page.waitForURL(url => url.pathname === APP_ROUTES.TOUR_DATES);
    await expect(page).toHaveTitle('Tour Dates | Jovie');
    expect(
      await page.evaluate(
        () => (window as { shellTitleNavProbe?: string }).shellTitleNavProbe
      )
    ).toBe('client-nav');
  });
});
