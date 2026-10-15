import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const width of [390, 1280]) {
  for (const theme of ['dark', 'light']) {
    test(`icon-chip metrics preserve layout and semantics at ${width}px in ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(value => {
        localStorage.setItem('jovie-theme-storybook', value);
      }, theme);

      await page.goto(
        '/iframe.html?id=molecules-contentmetriccard--compact-loading-and-loaded&viewMode=story'
      );
      const loaded = page.getByTestId('loaded-metric');
      const loading = page.getByTestId('loading-metric');
      await expect(loaded.getByRole('definition')).toHaveText('$123.45');
      await expect(page.locator('html')).toHaveClass(new RegExp(theme));
      const loadedBounds = await loaded.boundingBox();
      const loadingBounds = await loading.boundingBox();
      expect(loadedBounds).not.toBeNull();
      expect(loadingBounds).not.toBeNull();
      expect(loadedBounds?.height).toBe(loadingBounds?.height);
      expect(loadedBounds?.width).toBe(loadingBounds?.width);
      await testInfo.attach('compact-loading-and-loaded', {
        body: await page.locator('#storybook-root').screenshot(),
        contentType: 'image/png',
      });

      await page.goto(
        '/iframe.html?id=molecules-contentmetriccard--long-inline-label&viewMode=story'
      );
      await expect(page.getByRole('term')).toHaveText(
        'Waitlisted creators awaiting an invitation'
      );
      const labelFits = await page.getByRole('term').evaluate(term => {
        const label = term.querySelector('span');
        return label !== null && label.scrollWidth > label.clientWidth;
      });
      expect(labelFits).toBe(true);

      await page.goto(
        '/iframe.html?id=features-admin-waitlistmetrics--default&viewMode=story'
      );
      await expect(page.getByRole('term')).toHaveCount(4);
      await expect(page.getByRole('definition')).toHaveCount(4);
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth
      );
      expect(overflows).toBe(false);
      const a11y = await new AxeBuilder({ page })
        .include('#storybook-root')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(a11y.violations).toEqual([]);
      await testInfo.attach('waitlist-metrics', {
        body: await page.locator('#storybook-root').screenshot(),
        contentType: 'image/png',
      });
    });
  }
}
