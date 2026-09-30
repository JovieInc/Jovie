import { expect, test } from '@playwright/test';

test.describe('Desktop update release notes geometry', () => {
  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1440, 900],
  ]) {
    test(`keeps the dialog and footer stable at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const heights: number[] = [];
      const footers: number[] = [];
      for (const state of [
        'available-loading-notes',
        'available',
        'available-long-notes',
        'available-fallback-link',
      ]) {
        await page.goto(
          `/iframe.html?id=organisms-desktopupdatemodal--${state}&viewMode=story`
        );
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const box = await dialog.boundingBox();
        const footer = await page
          .getByRole('button', { name: 'Download' })
          .boundingBox();
        expect(box).not.toBeNull();
        expect(footer).not.toBeNull();
        if (!box || !footer) throw new Error('Missing modal geometry');
        heights.push(box.height);
        footers.push(footer.y);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
        await expect(
          page.getByRole('button', { name: 'Download' })
        ).toBeFocused();
        await page.keyboard.press('Tab');
        expect(
          await dialog.evaluate(el => el.contains(document.activeElement))
        ).toBe(true);
      }
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(
        1
      );
      expect(Math.max(...footers) - Math.min(...footers)).toBeLessThanOrEqual(
        1
      );
    });
  }
});
