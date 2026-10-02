import { expect, test } from '@playwright/test';

test.describe('Desktop update release notes geometry', () => {
  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1440, 900],
  ]) {
    test(`renders light stories and low download speed at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(
        '/iframe.html?id=organisms-desktopupdatemodal--available-light&viewMode=story'
      );
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.locator('html')).toHaveClass(/light/);
      await expect(page.locator('html')).not.toHaveClass(/dark/);
      await expect(
        page.getByRole('button', { name: 'Download' })
      ).toBeFocused();
      await page.keyboard.press('Tab');
      expect(
        await page
          .getByRole('dialog')
          .evaluate(el => el.contains(document.activeElement))
      ).toBe(true);
      await page.goto(
        '/iframe.html?id=organisms-desktopupdatemodal--downloading-slow&viewMode=story'
      );
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.locator('html')).toHaveClass(/dark/);
      await expect(page.getByText('128 KB of 512 KB')).toBeVisible();
      await expect(page.getByText('32 KB/s')).toBeVisible();
      await expect(
        page.getByRole('progressbar', { name: 'Download Progress' })
      ).toHaveAttribute('aria-valuenow', '25');
      await expect(page.getByRole('button', { name: 'Hide' })).toBeVisible();
    });

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
