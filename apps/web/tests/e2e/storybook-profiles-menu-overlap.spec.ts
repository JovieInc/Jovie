import { expect, test } from '@playwright/test';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  for (const order of ['row-to-rail', 'rail-to-row'] as const) {
    test(`Profiles menu transfer keeps one painted root (${order}, ${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await page.addInitScript(() => {
        (
          window as Window & { __menuMatchMedia?: typeof window.matchMedia }
        ).__menuMatchMedia = window.matchMedia.bind(window);
      });
      // The fixture uses the actual workspace, its action registry and
      // registered inspector. All identities are synthetic.
      await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (!['localhost', '127.0.0.1'].includes(url.hostname))
          return route.abort();
        if (url.pathname.startsWith('/api/')) {
          if (request.method() !== 'GET') return route.abort();
          return route.fulfill({
            json: { success: true, suggestions: [], data: [] },
          });
        }
        return route.continue();
      });
      await page.goto(
        '/iframe.html?id=verification-profilesmenuinvestigation--workspace&viewMode=story',
        { waitUntil: 'domcontentloaded' }
      );
      // A modal menu temporarily hides background triggers from accessibility
      // queries. Physical transfer still needs their actual painted geometry.
      const row = page.locator(
        'button[aria-label="Actions for Jovie Profile"]'
      );
      await expect(row).toBeVisible({ timeout: 120_000 });
      await page
        .locator('tr')
        .filter({
          has: page.getByRole('button', {
            name: 'Actions for Tidal',
            exact: true,
          }),
        })
        .locator('td')
        .first()
        .click();
      const rail = page
        .getByTestId('profiles-rail-entity-header')
        .locator('button[aria-label="More actions"]');
      await expect(rail).toBeVisible();
      await expect(
        page.getByTestId('profiles-rail-entity-header')
      ).toContainText('Tidal');
      await page.evaluate(() => {
        document.querySelector('[data-jovie-storybook-fixtures]')?.remove();
        const native = (
          window as Window & { __menuMatchMedia?: typeof window.matchMedia }
        ).__menuMatchMedia;
        if (native) window.matchMedia = native;
      });
      expect(
        await page.evaluate(
          () => matchMedia('(prefers-reduced-motion: reduce)').matches
        )
      ).toBe(reducedMotion === 'reduce');
      const roots = page.locator(
        '[data-slot="common-dropdown-content"][data-state="open"]'
      );
      const first = order === 'row-to-rail' ? row : rail;
      const second = order === 'row-to-rail' ? rail : row;
      await first.click();
      await expect(roots).toHaveCount(1);
      if (reducedMotion === 'no-preference') {
        expect(
          await roots.evaluate(element =>
            getComputedStyle(element)
              .animationDuration.split(',')
              .some(duration => parseFloat(duration) > 0)
          )
        ).toBe(true);
      }
      const box = await second.boundingBox();
      expect(box).not.toBeNull();
      const x = box!.x + box!.width / 2;
      const y = box!.y + box!.height / 2;
      // The modal first consumes the outside click. The next physical click
      // opens the other target through its existing handler.
      await page.mouse.click(x, y);
      await page.mouse.click(x, y);
      const frames = await page.evaluate(
        () =>
          new Promise<Array<{ painted: number; open: number }>>(resolve => {
            const frames: Array<{ painted: number; open: number }> = [];
            const start = performance.now();
            const sample = () => {
              const menus = Array.from(
                document.querySelectorAll<HTMLElement>(
                  '[data-slot="common-dropdown-content"]'
                )
              );
              frames.push({
                open: menus.filter(menu => menu.dataset.state === 'open')
                  .length,
                painted: menus.filter(menu => {
                  const style = getComputedStyle(menu);
                  const box = menu.getBoundingClientRect();
                  return (
                    box.width > 0 &&
                    box.height > 0 &&
                    style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    Number(style.opacity) > 0
                  );
                }).length,
              });
              if (performance.now() - start >= 250) resolve(frames);
              else requestAnimationFrame(sample);
            };
            sample();
          })
      );
      expect(Math.max(...frames.map(frame => frame.open))).toBe(1);
      expect(Math.max(...frames.map(frame => frame.painted))).toBe(1);
      await expect(roots).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(roots).toHaveCount(0);
      await expect(second).toBeFocused();
      await expect(
        page.getByTestId('profiles-rail-entity-header')
      ).toContainText('Tidal');
    });
  }
}
