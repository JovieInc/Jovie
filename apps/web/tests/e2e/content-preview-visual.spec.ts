import { expect, test } from '@playwright/test';

// Signed draft links are private. An invalid link must render the accessible
// not-found surface at both sizes without mounting any draft content.
test.use({ storageState: { cookies: [], origins: [] }, video: 'off' });

const versionId = '12345678-1234-1234-1234-123456789abc';
const invalidLinks = [
  { name: 'malformed version', path: '/content-preview/not-a-version' },
  { name: 'missing review identity', path: `/content-preview/${versionId}` },
  {
    name: 'legacy version-only token',
    path: `/content-preview/${versionId}?token=legacy-version-token`,
  },
  {
    name: 'forged exact-version review',
    path: `/content-preview/${versionId}?digest=${'a'.repeat(64)}&live=none&token=${'0'.repeat(64)}`,
  },
] as const;

for (const width of [1440, 390]) {
  test.describe(`private content preview at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const link of invalidLinks) {
      test(`${link.name} stays private and readable`, async ({ page }) => {
        await page.goto(link.path, { waitUntil: 'domcontentloaded' });

        // App Router can stream notFound() with HTTP 200. Assert the actual
        // rejection surface and identity instead of assuming a status code.
        expect(new URL(page.url()).pathname).toBe(
          new URL(link.path, 'http://localhost').pathname
        );
        const rejection = page.getByTestId('not-found');
        await expect(rejection).toBeVisible();
        await expect(
          rejection.getByRole('heading', { level: 1 })
        ).toBeVisible();
        await expect(
          page.locator('meta[name="robots"][content*="noindex"]')
        ).not.toHaveCount(0);
        await expect(
          page.locator('meta[name="jovie-content-review"]')
        ).toHaveCount(0);
        await expect(page.getByTestId('marketing-section-hero')).toHaveCount(0);
        await expect(page.getByTestId('homepage-fan-states')).toHaveCount(0);
        await expect(page.getByTestId('homepage-close-claim')).toHaveCount(0);
        const layout = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
        }));
        expect(layout.content).toBeLessThanOrEqual(layout.viewport + 1);
      });
    }
  });
}
