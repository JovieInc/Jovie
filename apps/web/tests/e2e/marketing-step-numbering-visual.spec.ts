import { expect, test } from './setup';

/**
 * Marketing sections must not show decorative step numbering ("Step 1",
 * "01 02 03", "1. Identify") or market-stat cards.
 */

const ROUTES = ['/pay', '/voice', '/instant-merch', '/ai', '/launch'] as const;

test.describe('marketing pages render no step numbering', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of ROUTES) {
    test(`${route} shows no step-number labels`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const numbered = await page.evaluate(() => {
        const pattern = /^(?:Step \d|0[1-9]|[1-9]\. [A-Z][a-z]+)$/;
        return (
          [
            ...document.querySelectorAll(
              'main h1, main h2, main h3, main p, main span, main div'
            ),
          ]
            // Screen-reader-only order hints are allowed; only visible
            // numbering is banned (matches the unit guards).
            .filter(el => el.children.length === 0 && !el.closest('.sr-only'))
            .map(el => el.textContent?.trim() ?? '')
            .filter(text => pattern.test(text))
        );
      });
      expect(numbered).toEqual([]);
    });
  }
});
