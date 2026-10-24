import { join } from 'node:path';
import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`locked homepage footer at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const footer = page.getByTestId('marketing-footer');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toHaveAttribute('data-footer-variant', 'expanded');
    await expect(footer.locator('.mf-eyebrow')).toHaveText([
      'Product',
      'Features',
      'Company',
      'Resources',
      'Connect',
    ]);
    const legal = footer.getByRole('navigation', {
      name: 'Legal',
      exact: true,
    });
    await expect(legal.getByRole('link')).toHaveText([
      'Privacy',
      'Terms',
      'Cookies',
      'DMCA',
    ]);
    await expect(
      footer.getByRole('link', { name: 'Jovie Home' })
    ).toBeVisible();
    await expect(footer.getByRole('toolbar', { name: 'Theme' })).toBeVisible();
    await expect(
      footer.getByRole('button', { name: 'Dark Theme' })
    ).toBeVisible();
    await expect(footer.getByTestId('marketing-locale-static')).toHaveText(
      'English'
    );
    const measure = () =>
      footer.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return {
          x: rect.left + window.scrollX,
          y: rect.top + window.scrollY,
          width: rect.width,
          height: rect.height,
        };
      });
    const before = await measure();
    const privacy = legal.getByRole('link', { name: 'Privacy', exact: true });
    await privacy.focus();
    await expect(privacy).toBeFocused();
    await privacy.hover();
    expect(await measure()).toEqual(before);
    expect(
      await footer.evaluate(node => node.scrollWidth <= node.clientWidth)
    ).toBe(true);
    await footer.screenshot({
      path: process.env.FOOTER_SCREENSHOT_DIR
        ? join(process.env.FOOTER_SCREENSHOT_DIR, `footer-after-${width}.png`)
        : testInfo.outputPath(`footer-after-${width}.png`),
    });
  });
}
