import { expect, test } from './setup';

test.use({ storageState: { cookies: [], origins: [] } });

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

test.describe('brand page', () => {
  for (const viewport of VIEWPORTS) {
    test(`scrolls on the document and fits ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/brand', { waitUntil: 'domcontentloaded' });

      await expect(
        page.getByRole('heading', { name: 'One loop. Every release.' })
      ).toBeVisible();
      await expect(page.getByTestId('header-nav')).toHaveAttribute(
        'data-presentation',
        'marketing-glass'
      );

      const before = await page.evaluate(
        () => document.scrollingElement?.scrollTop ?? 0
      );

      await page.locator('#downloads').scrollIntoViewIfNeeded();
      await expect(page.locator('#downloads')).toBeVisible();

      const metrics = await page.evaluate(() => {
        const scrollingElement = document.scrollingElement;
        return {
          bodyOverflow: getComputedStyle(document.body).overflowY,
          documentScrollTop: scrollingElement?.scrollTop ?? 0,
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });

      expect(metrics.documentScrollTop).toBeGreaterThan(before);
      expect(metrics.bodyOverflow).toBe('visible');
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    });
  }
});
