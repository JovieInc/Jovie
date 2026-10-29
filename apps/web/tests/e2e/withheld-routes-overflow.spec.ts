import { WITHHELD_MARKETING_ROUTES } from '@/data/marketing/withheldRoutes';
import { expect, test } from './setup';

/**
 * Withheld dead-end pages stay reachable (no 404), serve noindex, never
 * overflow the viewport, and are absent from the sitemap.
 */

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

test.describe('withheld marketing routes', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const { route } of WITHHELD_MARKETING_ROUTES) {
    for (const viewport of VIEWPORTS) {
      test(`${route} is reachable, noindex, and fits at ${viewport.width}px`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const response = await page.goto(route);
        expect(response?.status() ?? 0).toBeLessThan(400);

        const robots = await page
          .locator('meta[name="robots"]')
          .first()
          .getAttribute('content');
        expect(robots ?? '').toContain('noindex');

        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }

  test('sitemap lists none of the withheld routes', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.ok()).toBe(true);
    const xml = await response.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match =>
      new URL(match[1]).pathname.replace(/\/+$/, '')
    );
    for (const { route } of WITHHELD_MARKETING_ROUTES) {
      expect(locs).not.toContain(route);
    }
  });
});
