import { expect, test } from '@playwright/test';

test.use({
  storageState: { cookies: [], origins: [] },
  reducedMotion: 'reduce',
  video: 'off',
});

// Exercise the real route and shared not-found surface, including the production
// repro. No seeded data is needed: malformed IDs must be rejected before a query.
const invalidPaths = ['/r/y', '/r/foo--y', '/r/my-song--not-a-uuid'];

for (const width of [390, 1440]) {
  test.describe(`legacy smart-link rejection at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const path of invalidPaths) {
      test(`${path} returns a readable 404`, async ({ page }, testInfo) => {
        const response = await page.goto(path, {
          waitUntil: 'domcontentloaded',
        });

        expect(response?.status()).toBe(404);
        expect(new URL(page.url()).pathname).toBe(path);
        const rejection = page.getByTestId('not-found');
        await expect(rejection).toBeVisible();
        await expect(
          rejection.getByRole('heading', {
            level: 1,
            name: "We can't find that page.",
          })
        ).toBeVisible();
        await expect(
          rejection.getByRole('link', { name: 'Go home', exact: true })
        ).toHaveAttribute('href', '/');
        await expect(
          page.locator('meta[name="robots"][content*="noindex"]')
        ).not.toHaveCount(0);

        const layout = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
        }));
        expect(layout.content).toBeLessThanOrEqual(layout.viewport + 1);

        const capture = testInfo.outputPath(`legacy-404-${width}.png`);
        await page.screenshot({ path: capture, fullPage: true });
        await testInfo.attach(`legacy-404-${width}`, {
          path: capture,
          contentType: 'image/png',
        });
      });
    }
  });
}
