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

    test(`sizes the settled dialog to its content at ${width}px`, async ({
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
      // JOV-9023: settled bodies size to their content instead of a fixed
      // height. The loading skeleton still reserves the scroll region and
      // long notes still cap and scroll at that same bound, so those two
      // dialogs stay height-equal; short notes and the fallback link make a
      // visibly smaller dialog with no empty expanse above the actions.
      const [loading, shortNotes, longNotes, fallbackLink] = heights;
      const [, , , fallbackFooter] = footers;
      expect(Math.abs(longNotes - loading)).toBeLessThanOrEqual(1);
      expect(loading - shortNotes).toBeGreaterThanOrEqual(32);
      expect(loading - fallbackLink).toBeGreaterThanOrEqual(64);
      expect(fallbackFooter).toBeLessThan(footers[0]);
      expect(Math.abs(footers[2] - footers[0])).toBeLessThanOrEqual(1);
    });
  }
});
