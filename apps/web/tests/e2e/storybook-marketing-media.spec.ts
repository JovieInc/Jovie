import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const stories = {
  'large-glass': '.psf[data-status="loaded"]',
  'compact-glass': '.compact-glass-module',
  flow: '[data-variant="flow"]',
  soft: '[data-variant="soft"]',
};

for (const [story, selector] of Object.entries(stories)) {
  test(`registered media: ${story} preserves layout and accessible states`, async ({
    page,
  }, testInfo) => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({
        reducedMotion: 'reduce',
        forcedColors: 'none',
      });
      await page.goto(
        `/iframe.html?id=marketing-mediarecipes--${story}&viewMode=story`
      );
      await expect(page.locator(selector)).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBe(width);
      const scan = await new AxeBuilder({ page })
        .include('[data-testid="marketing-section-feature-split"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(scan.violations).toEqual([]);
      if (story === 'large-glass') {
        const frame = page.locator('.psf');
        const box = await frame.boundingBox();
        const imageAboveReflection = await page
          .locator('.psf__image')
          .evaluate(
            image =>
              Number(getComputedStyle(image).zIndex) >
              Number(getComputedStyle(image.parentElement!, '::after').zIndex)
          );
        expect(imageAboveReflection).toBe(true);
        await page.locator('.psf__image').dispatchEvent('error');
        await expect(frame).toHaveAttribute('data-status', 'error');
        expect(await frame.boundingBox()).toEqual(box);
      } else if (story === 'flow' || story === 'soft') {
        const box = await page.locator(selector).boundingBox();
        await page.emulateMedia({ forcedColors: 'active' });
        await expect(
          page.locator('.marketing-editorial-background__washes')
        ).toBeHidden();
        expect(await page.locator(selector).boundingBox()).toEqual(box);
      }
      await testInfo.attach(`${story}-${width}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
  });
}
