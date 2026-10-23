import { expect, test } from '@playwright/test';

for (const width of [390, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`release controls retain targets and geometry at ${width}px in ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await page.addInitScript(
        value => localStorage.setItem('jovie-theme-storybook', value),
        theme
      );

      let initialBox: {
        x: number;
        y: number;
        width: number;
        height: number;
      } | null = null;
      for (const state of ['default', 'selected']) {
        await page.goto(
          `/iframe.html?id=dashboard-releases-shellreleaserow--${state}&viewMode=story`
        );
        const row = page
          .getByRole('table', { name: 'Releases' })
          .getByRole('row');
        await expect(row).toBeVisible();
        await expect(row).toHaveAttribute(
          'aria-selected',
          String(state === 'selected')
        );
        await expect(row.getByRole('cell')).toBeAttached();

        const title = row.getByRole('button', {
          name: 'Lost in the Light',
          exact: true,
        });
        await title.focus();
        await expect(title).toBeFocused();
        const target = await title.boundingBox();
        expect(target?.height).toBeGreaterThanOrEqual(24);
        const box = await row.boundingBox();
        expect(box?.height).toBe(32);
        if (state === 'default') initialBox = box;
        else expect(box).toEqual(initialBox);

        const screenshot = testInfo.outputPath(
          `release-row-${state}-${theme}-${width}.png`
        );
        await page.screenshot({ path: screenshot });
        await testInfo.attach(`release-row-${state}-${theme}-${width}`, {
          path: screenshot,
          contentType: 'image/png',
        });
      }
    });
  }
}
