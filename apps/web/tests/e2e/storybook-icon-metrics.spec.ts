import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { wcag22AaAxeOptions } from '@/lib/a11y-gates/wcag-standard.cjs';

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
        '/iframe.html?id=molecules-contentmetriccard--icon-chip-loading-and-loaded&viewMode=story'
      );
      await expect(page.locator('html')).toHaveClass(new RegExp(theme));
      for (const variant of [
        'icon-chip-default',
        'icon-chip-compact',
        'icon-chip-inline-default',
      ]) {
        const loaded = page.getByTestId(`${variant}-loaded`);
        const loading = page.getByTestId(`${variant}-loading`);
        await expect(loaded.getByRole('term')).toHaveText('Total streams');
        const loadedBounds = await loaded.boundingBox();
        const loadingBounds = await loading.boundingBox();
        expect(loadedBounds).not.toBeNull();
        expect(loadingBounds).not.toBeNull();
        expect(loadedBounds?.height, `${variant} height`).toBe(
          loadingBounds?.height
        );
        expect(loadedBounds?.width, `${variant} width`).toBe(
          loadingBounds?.width
        );
      }
      await testInfo.attach('icon-chip-loading-and-loaded.png', {
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
        .options(wcag22AaAxeOptions())
        .analyze();
      expect(a11y.violations).toEqual([]);
      await testInfo.attach('waitlist-metrics.png', {
        body: await page.locator('#storybook-root').screenshot(),
        contentType: 'image/png',
      });
    });
  }
}
