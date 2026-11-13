import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const inter = readFileSync(
  resolve(process.cwd(), 'public/fonts/Inter-Variable.woff2')
).toString('base64');

async function openHeader(page: Page, story: string) {
  await page.goto(
    `/iframe.html?id=features-dashboard-organisms-dashboardheader--${story}&viewMode=story`,
    { waitUntil: 'domcontentloaded' }
  );
  await expect(page.getByTestId('dashboard-header')).toBeVisible();
  // The app's next/font loader is absent in Storybook. Use the same bundled
  // variable font so text metrics exercise the production face.
  await page.evaluate(async data => {
    const font = new FontFace(
      'Inter Variable',
      `url(data:font/woff2;base64,${data})`,
      { weight: '100 900' }
    );
    document.fonts.add(await font.load());
    await document.fonts.ready;
  }, inter);
}

for (const width of [390, 1440, 1512]) {
  for (const theme of ['dark', 'light']) {
    test(`keeps compact header type and controls stable at ${width}px in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(value => {
        localStorage.setItem('jovie-theme-storybook', value);
      }, theme);
      await openHeader(page, 'with-controls');
      await expect(page.locator('html')).toHaveClass(new RegExp(theme));
      const header = page.getByTestId('dashboard-header');
      const heading = page.getByRole('heading', { name: 'Views' });
      const rail = page.getByRole('button', { name: 'Toggle Details' });
      const action = page.getByRole('button', { name: 'Pin View' });
      const before = await header.boundingBox();
      expect(before?.height).toBe(width < 640 ? 52 : 44);
      expect((await heading.boundingBox())?.x).toBe(width < 640 ? 16 : 12);
      await expect(heading).toHaveCSS(
        'font-size',
        width < 640 ? '16px' : '12px'
      );
      const expectedWeight = await heading.evaluate(
        (element, mobile) =>
          getComputedStyle(element)
            .getPropertyValue(
              mobile ? '--font-weight-semibold' : '--font-weight-medium'
            )
            .trim(),
        width < 640
      );
      await expect(heading).toHaveCSS('font-weight', expectedWeight);
      await expect(action).toHaveCSS('font-weight', expectedWeight);
      const railBox = await rail.boundingBox();
      expect(railBox?.width).toBe(28);
      expect(railBox?.height).toBe(28);
      const actionBox = await action.boundingBox();
      expect(actionBox?.height).toBe(32);

      await action.hover();
      expect(await action.boundingBox()).toEqual(actionBox);
      await rail.focus();
      await expect(rail).toBeFocused();
      await page.keyboard.press('Space');
      await expect(rail).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('Tab');
      await expect(action).toBeFocused();
      const focusedSurface = await action.evaluate(element => {
        const style = getComputedStyle(element);
        return Object.fromEntries(
          ['background-color', 'border-color', 'box-shadow'].map(property => [
            property,
            style.getPropertyValue(property),
          ])
        );
      });
      await page.keyboard.press('Enter');
      await expect(action).toHaveAttribute('aria-pressed', 'true');
      for (const [property, value] of Object.entries(focusedSurface)) {
        await expect(action).toHaveCSS(property, value);
      }
      expect(await header.boundingBox()).toEqual(before);
      expect(await rail.boundingBox()).toEqual(railBox);

      await openHeader(page, 'with-title-menu');
      // Radix hides the background from assistive tech while the modal menu
      // is open. Measure the same DOM trigger across both disclosure states.
      const trigger = header.locator('button[aria-haspopup="menu"]');
      await expect(trigger).toHaveAccessibleName('New Chat');
      const closed = await header.boundingBox();
      const triggerBox = await trigger.boundingBox();
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('menu')).toBeVisible();
      expect(await header.boundingBox()).toEqual(closed);
      expect(await trigger.boundingBox()).toEqual(triggerBox);
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await page.keyboard.press('Enter');
      await page
        .getByRole('menuitem', { name: 'Plan The Autumn Tour' })
        .click();
      await expect(
        page.getByRole('button', { name: 'Plan The Autumn Tour' })
      ).toBeFocused();
      expect(await header.boundingBox()).toEqual(closed);

      await openHeader(page, 'long-content-title');
      const longTitle = page.getByRole('heading');
      await expect(longTitle).toHaveCSS('text-overflow', 'ellipsis');
      expect(
        await longTitle.evaluate(el => el.scrollWidth > el.clientWidth)
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
      await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
    });
  }
}
