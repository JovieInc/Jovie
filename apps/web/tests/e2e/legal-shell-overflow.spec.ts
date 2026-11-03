import { expect, test } from './setup';

/**
 * Every legal document renders the one legal shell (full marketing header,
 * expanded footer, no route hero), shows the document title as its only H1,
 * and never overflows the viewport at desktop or phone width.
 */

const LEGAL_ROUTES = [
  '/legal/privacy',
  '/legal/terms',
  '/legal/cookies',
  '/legal/dmca',
] as const;

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

test.describe('legal document shell', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of LEGAL_ROUTES) {
    for (const viewport of VIEWPORTS) {
      test(`${route} renders one title in the legal shell at ${viewport.width}px`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const response = await page.goto(route);
        expect(response?.status() ?? 0).toBeLessThan(400);

        await expect(page.locator('.public-legal-shell')).toHaveCount(1);
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('.marketing-route-hero')).toHaveCount(0);

        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
});
