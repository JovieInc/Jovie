import { expect, test } from '@playwright/test';

for (const width of [1440, 390, 320]) {
  test(`saved link confirmation at ${width}px preserves scope and requires explicit action`, async ({
    page,
  }) => {
    page.setDefaultTimeout(15_000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      const fixture = window as Window & {
        __presenceDeletes: unknown[];
        __nativeMatchMedia: typeof window.matchMedia;
        __jovieApiMock: (request: { url: URL; init?: RequestInit }) => Response;
      };
      fixture.__presenceDeletes = [];
      fixture.__nativeMatchMedia = window.matchMedia.bind(window);
      // Use Storybook's canonical per-story fetch interception seam. Its wrapper
      // intentionally prevents /api requests from reaching network routes.
      fixture.__jovieApiMock = ({ url, init }) => {
        if (url.pathname.endsWith('/social-links')) {
          if (init?.method === 'DELETE') {
            fixture.__presenceDeletes.push(JSON.parse(String(init.body)));
            return Response.json({ ok: true, version: 4 });
          }
          return Response.json({
            links: [
              {
                id: 'synthetic-link',
                url: 'https://soundcloud.com/fixture-artist-with-a-long-saved-profile-address',
                version: 3,
                isActive: true,
                state: 'active',
              },
            ],
          });
        }
        return Response.json({ success: true, suggestions: [] });
      };
    });
    const deletes = () =>
      page.evaluate(
        () =>
          (window as Window & { __presenceDeletes: unknown[] })
            .__presenceDeletes
      );
    await page.goto(
      '/iframe.html?id=presence-savedlinkremoval--confirmation&viewMode=story'
    );
    await page.evaluate(() => {
      document.querySelector('style[data-jovie-storybook-fixtures]')?.remove();
      window.matchMedia = (
        window as Window & { __nativeMatchMedia: typeof window.matchMedia }
      ).__nativeMatchMedia;
    });
    const root = page.locator('#storybook-root');
    const rows = root.getByRole('row');
    await expect(rows).toHaveCount(3);
    // Canonical row stays first and never offers removal.
    await rows
      .nth(1)
      .getByRole('button', { name: 'Actions for Fixture Artist' })
      .click();
    const animation = await page
      .getByRole('menu')
      .evaluate(element => getComputedStyle(element).animationDuration);
    expect(animation.split(',').some(value => parseFloat(value) > 0)).toBe(
      true
    );
    await expect(
      page.getByRole('menuitem', { name: 'Remove From Jovie Profile' })
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    const menu = rows
      .nth(2)
      .getByRole('button', { name: 'Actions for Fixture Artist' });
    await menu.focus();
    await page.keyboard.press('Enter');
    await page
      .getByRole('menuitem', { name: 'Remove From Jovie Profile' })
      .click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(
      'https://soundcloud.com/fixture-artist-with-a-long-saved-profile-address'
    );
    await expect(dialog).toContainText('other or retained evidence');
    await expect(dialog).toHaveCSS('opacity', '1');
    await page.screenshot({
      path: test.info().outputPath(`confirmation-${width}.png`),
    });
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await deletes()).toEqual([]);
    await expect(menu).toBeFocused();
    await rows.nth(2).click({ button: 'right' });
    await page
      .getByRole('menuitem', { name: 'Remove From Jovie Profile' })
      .click();
    {
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(menu).toBeFocused();
      await rows.nth(2).click();
      await page
        .getByRole('button', { name: 'More actions', exact: true })
        .click();
      await page
        .getByRole('menuitem', { name: 'Remove From Jovie Profile' })
        .click();
      await expect(dialog).toContainText(
        'https://soundcloud.com/fixture-artist-with-a-long-saved-profile-address'
      );
      expect(await deletes()).toEqual([]);
      for (let step = 0; step < 3; step += 1) {
        await page.keyboard.press('Tab');
        await expect(dialog.locator(':focus')).toHaveCount(1);
      }
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      const inspectorMenu = page.getByRole('button', {
        name: 'More actions',
        exact: true,
      });
      await expect(menu).toBeFocused();
      await rows.nth(2).click();
      await inspectorMenu.click();
      await page
        .getByRole('menuitem', { name: 'Remove From Jovie Profile' })
        .click();
    }
    await dialog
      .getByRole('button', { name: 'Remove Link', exact: true })
      .click();
    await expect(dialog).toBeHidden();
    expect(await deletes()).toEqual([
      {
        profileId: 'synthetic-profile',
        linkId: 'synthetic-link',
        action: 'dismiss',
        expectedVersion: 3,
      },
    ]);
    // All initiation paths finish at the same current row action trigger.
    await expect(menu).toBeFocused();
    // The source removal does not pretend to delete retained Identity evidence.
    await expect(rows).toHaveCount(3);
    await page.screenshot({
      path: test.info().outputPath(`presence-removal-${width}.png`),
    });
  });
}
