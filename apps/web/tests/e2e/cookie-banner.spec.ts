import { expect, test } from './setup';

test.describe('Cookie banner', () => {
  test('shows based on country', async ({ page }) => {
    await page.goto('/');
    const banner = page.locator('[data-testid="cookie-banner"]');
    if (process.env.COUNTRY === 'DE') {
      await expect(banner).toBeVisible();
    } else {
      await expect(banner).toHaveCount(0);
    }
  });
});
