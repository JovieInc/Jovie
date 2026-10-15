import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { parseChangelog } from '@/lib/changelog-parser';

const [release] = parseChangelog(
  readFileSync(resolve(process.cwd(), '../../CHANGELOG.md'), 'utf8')
);
if (!release) throw new Error('Public content proof needs a published release');

const surfaces = [
  { path: '/blog', width: 'page' },
  { path: '/blog/the-myspace-problem', width: 'prose' },
  { path: '/changelog', width: 'page' },
  { path: `/changelog/${encodeURIComponent(release.version)}`, width: 'prose' },
  { path: '/legal/privacy', width: 'prose' },
] as const;

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`${viewport.name} ${theme}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: theme,
        storageState: { cookies: [], origins: [] },
      });

      for (const surface of surfaces) {
        test(`${surface.path} retains canonical public content chrome`, async ({
          page,
        }, testInfo) => {
          const errors: string[] = [];
          page.on('pageerror', error => errors.push(error.message));
          page.on('console', message => {
            if (message.type() === 'error') errors.push(message.text());
          });
          await page.addInitScript(selectedTheme => {
            localStorage.setItem('theme', selectedTheme);
          }, theme);
          const response = await page.goto(surface.path, {
            waitUntil: 'domcontentloaded',
          });
          expect(response?.status()).toBe(200);
          await expect
            .poll(() =>
              page
                .locator('html')
                .evaluate(element => element.classList.contains('dark'))
            )
            .toBe(theme === 'dark');
          await expect(page.getByRole('main')).toHaveCount(1);
          await expect(page.locator('[data-public-page-shell]')).toHaveCount(1);
          const shell = page.locator('[data-public-content-shell]');
          await expect(shell).toHaveCount(1);
          await expect(shell).toHaveAttribute(
            'data-public-content-width',
            surface.width
          );
          await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
          const header = page.getByRole('banner');
          if (viewport.name === 'mobile') {
            const menu = header.getByRole('button', {
              name: 'Open menu',
              exact: true,
            });
            await menu.click();
            await expect(
              page.getByRole('navigation', {
                name: 'Mobile Navigation',
                exact: true,
              })
            ).toBeVisible();
            await page
              .getByRole('button', { name: 'Close menu', exact: true })
              .click();
          } else {
            const customers = header.getByRole('button', {
              name: 'Customers',
              exact: true,
            });
            await customers.focus();
            await expect(customers).toHaveAttribute('aria-expanded', 'true');
            await page.keyboard.press('Escape');
            await expect(customers).toHaveAttribute('aria-expanded', 'false');
            await expect(
              header.getByRole('link', { name: 'Product', exact: true })
            ).toBeVisible();
            await expect(
              header.getByRole('link', { name: 'Pricing', exact: true })
            ).toBeVisible();
          }
          const footer = page.getByTestId('marketing-footer');
          await expect(footer).toHaveAttribute(
            'data-footer-variant',
            'expanded'
          );
          await footer.scrollIntoViewIfNeeded();
          await expect(
            footer.getByRole('navigation', { name: 'Legal', exact: true })
          ).toBeVisible();
          // Exercise a real client control, so a static server render cannot pass
          // the hydration check simply by looking correct.
          const contents = page.getByRole('navigation', {
            name: 'Table of contents',
            exact: true,
          });
          if (await contents.count()) {
            const jump = contents.getByRole('button').first();
            await jump.scrollIntoViewIfNeeded();
            await jump.click();
            await expect(page).toHaveURL(/#/);
          }
          await page.evaluate(() => document.fonts.ready);
          const bounds = await shell.evaluate((element, width) => {
            const root = getComputedStyle(document.documentElement);
            const token =
              width === 'prose' ? '--ds-prose-max' : '--ds-public-content-max';
            return {
              frame:
                element.firstElementChild?.getBoundingClientRect().width ?? 0,
              max: Number.parseFloat(root.getPropertyValue(token)),
              overflow: document.documentElement.scrollWidth > innerWidth,
            };
          }, surface.width);
          expect(bounds.frame).toBeGreaterThan(0);
          expect(bounds.frame).toBeLessThanOrEqual(bounds.max);
          expect(bounds.overflow).toBe(false);
          await shell.scrollIntoViewIfNeeded();
          const screenshot = testInfo.outputPath('public-content.png');
          await page.screenshot({ path: screenshot, fullPage: true });
          await testInfo.attach('public-content', {
            path: screenshot,
            contentType: 'image/png',
          });
          await testInfo.attach('source', {
            body: JSON.stringify({
              head: process.env.EXPECTED_COMMIT_SHA,
              path: surface.path,
              viewport,
              theme,
              bounds,
              errors,
            }),
            contentType: 'application/json',
          });
          expect(errors).toEqual([]);
        });
      }
    });
  }
}
