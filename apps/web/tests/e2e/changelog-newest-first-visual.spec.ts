import { expect, test } from './setup';

/**
 * The customer changelog reads newest first and advertises its feeds.
 * Regression for 2026-10-31: receipts with failed checks dropped every post
 * except 2026-10-02, and the rest rendered in CHANGELOG.md section order.
 */

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

test.describe('changelog newest first', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const viewport of VIEWPORTS) {
    test(`orders entries newest first without overflow at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/changelog');

      const entries = page.locator('article.changelog-entry');
      await expect(entries.first()).toBeVisible();

      const dates = await entries
        .locator('.changelog-entry__date')
        .allTextContents();
      const instants = dates.map(text => Date.parse(text.trim()));
      for (const instant of instants) expect(Number.isNaN(instant)).toBe(false);
      expect(instants).toEqual([...instants].sort((a, b) => b - a));

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('advertises the RSS and Atom feeds for autodiscovery', async ({
    page,
  }) => {
    await page.goto('/changelog');
    await expect(
      page.locator('head link[rel="alternate"][type="application/rss+xml"]')
    ).toHaveAttribute('href', /\/changelog\/rss\.xml$/);
    await expect(
      page.locator('head link[rel="alternate"][type="application/atom+xml"]')
    ).toHaveAttribute('href', /\/changelog\/feed\.xml$/);
  });
});
