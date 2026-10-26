import { expect, test } from './setup';
import { SMOKE_TIMEOUTS } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * The document title is what a browser tab and a screen reader announce.
 * Root metadata uses `%s | Jovie`, so a title that already names Jovie must
 * stay absolute or the announcement doubles.
 */
const ROUTES = [
  { path: '/compare', title: 'Compare — Jovie' },
  { path: '/pricing', title: 'Pricing | Jovie' },
  { path: '/cli', title: 'CLI — Jovie' },
  { path: '/integrations', title: 'Integrations | Jovie' },
  { path: '/compare/linktree', title: 'Jovie vs Linktree' },
] as const;

test.describe('marketing document titles', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
  });

  for (const route of ROUTES) {
    test(`${route.path} announces Jovie once`, async ({ page }) => {
      await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      await expect(page).toHaveTitle(route.title);
      expect(await page.title()).not.toMatch(/Jovie \| Jovie/);
    });
  }
});
