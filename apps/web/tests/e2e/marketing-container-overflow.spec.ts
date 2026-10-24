import { expect, test } from './setup';

/**
 * One boxed width, one full-bleed override: every boxed `.public-container`
 * on a marketing page shares the same left and right edge, and nothing
 * overflows the viewport horizontally.
 *
 * @layout-guard
 */

const ROUTES = ['/', '/pricing', '/blog'] as const;
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

test.describe('marketing single container edges and overflow', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of ROUTES) {
    for (const viewport of VIEWPORTS) {
      test(`${route} has one container edge at ${viewport.width}px`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.goto(route);
        await page.waitForLoadState('networkidle');

        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(0);

        const edges = await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              '.public-container:not(.public-container--bleed)'
            ),
          ]
            .map(element => element.getBoundingClientRect())
            .filter(box => box.width > 0)
            .map(box => `${Math.round(box.left)}-${Math.round(box.right)}`)
        );
        expect(edges.length).toBeGreaterThan(0);
        expect(new Set(edges).size).toBe(1);
      });
    }
  }
});
