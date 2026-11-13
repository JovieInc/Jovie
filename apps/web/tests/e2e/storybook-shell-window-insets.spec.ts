import { expect, test } from '@playwright/test';

const story =
  '/iframe.html?id=organisms-appshellframe--window-insets&viewMode=story';

for (const width of [1440, 1024, 900, 390]) {
  for (const theme of ['light', 'dark']) {
    for (const reducedMotion of ['reduce', 'no-preference'] as const) {
      test(`window gutters at ${width}, ${theme}, ${reducedMotion}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 450 });
        await page.emulateMedia({ reducedMotion });
        await page.addInitScript(theme => {
          localStorage.setItem('jovie-theme-storybook', theme);
          Object.defineProperty(globalThis, 'electronAPI', {
            configurable: true,
            value: {},
          });
          // Preload identity must exist before the first shell paint.
          const markRuntime = () => {
            if (document.documentElement) {
              document.documentElement.dataset.desktopRuntime = 'electron';
            }
          };
          new MutationObserver(markRuntime).observe(document, {
            childList: true,
          });
          markRuntime();
          Object.defineProperty(globalThis, 'matchMedia', {
            value: globalThis.matchMedia.bind(globalThis),
            configurable: false,
            writable: false,
          });
          new MutationObserver(() => {
            document
              .querySelectorAll('style[data-jovie-storybook-fixtures]')
              .forEach(node => node.remove());
          }).observe(document, { childList: true, subtree: true });
        }, theme);
        await page.goto(story);
        const main = page.locator('#main-content');
        await expect(main).toBeVisible({ timeout: 90_000 });
        await expect(page.locator('html')).toHaveClass(
          new RegExp(`(?:^|\\s)${theme}(?:\\s|$)`)
        );
        await expect(page.locator('[data-app-shell-frame]')).toHaveCount(1);
        const row = page.getByTestId('window-insets-row').first();
        const originalFont = await row.evaluate(
          node => getComputedStyle(node).fontSize
        );
        const left = page.getByTestId('electron-sidebar-toggle');
        const right = page.getByRole('button', {
          name: 'Expand details',
          exact: true,
        });
        await expect(left).toBeVisible({ timeout: 90_000 });
        const beforeToggle = await left.boundingBox();
        const expandedMain = await main.boundingBox();
        if (width >= 1024)
          await expect(left).toHaveAttribute('aria-expanded', 'true');
        const body = page.locator('[data-app-shell-body]');

        for (let cycle = 0; cycle < (width >= 1024 ? 2 : 1); cycle += 1) {
          for (const railOpen of [false, true]) {
            if (railOpen) await right.click();
            if (width >= 1024) {
              await expect(body).toHaveCSS('padding-right', '8px');
              await expect(body).toHaveCSS('padding-bottom', '8px');
              await expect(main).toHaveCSS('border-radius', '12px');
              await expect
                .poll(async () => {
                  const plane = await page
                    .locator('[data-app-shell-main-plane]')
                    .boundingBox();
                  return Math.round(width - (plane!.x + plane!.width));
                })
                .toBe(8);
              const plane = await page
                .locator('[data-app-shell-main-plane]')
                .boundingBox();
              expect(450 - (plane!.y + plane!.height)).toBeCloseTo(8, 0);
              expect(plane!.y).toBeCloseTo(8, 0);
              if (railOpen) {
                await expect(
                  page.locator('#window-insets-inspector')
                ).toHaveAttribute('data-rail-phase', 'open');
                const rail = (await page
                  .locator('#window-insets-inspector')
                  .boundingBox())!;
                const content = (await main.boundingBox())!;
                expect(rail.x - content.x - content.width).toBeCloseTo(8, 0);
                expect(width - rail.x - rail.width).toBeCloseTo(8, 0);
              }
            } else {
              await expect(body).toHaveCSS('padding-right', '0px');
              await expect(body).toHaveCSS('padding-bottom', '0px');
            }
            await expect(row).toHaveCSS('font-size', originalFont);
            await expect(row).toHaveCSS('height', '32px');
            expect(
              await page.evaluate(() => [
                document.documentElement.scrollWidth - innerWidth,
                document.documentElement.scrollHeight - innerHeight,
              ])
            ).toEqual([0, 0]);
            if (railOpen)
              await page
                .getByRole('button', { name: 'Close details', exact: true })
                .click();
          }
          if (width >= 1024) {
            await left.focus();
            await page.keyboard.press('Enter');
            await expect(left).toBeFocused();
            await expect(left).toHaveAttribute(
              'aria-expanded',
              cycle === 0 ? 'false' : 'true'
            );
            if (cycle === 0) {
              await expect
                .poll(async () => (await main.boundingBox())!.x)
                .toBeLessThan(expandedMain!.x);
            } else {
              await expect
                .poll(async () => (await main.boundingBox())!.x)
                .toBeCloseTo(expandedMain!.x, 0);
            }
            await expect
              .poll(async () => (await left.boundingBox())!.x)
              .toBeCloseTo(beforeToggle!.x, 0);
            const scroll = page.getByTestId('window-insets-scroll');
            await scroll.evaluate(node => {
              node.scrollTop = 200;
            });
            expect(
              await scroll.evaluate(node => node.scrollTop)
            ).toBeGreaterThan(0);
            expect(await main.evaluate(node => node.scrollTop)).toBe(0);
          }
        }
      });
    }
  }
}
