import { expect, test } from './setup';

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

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
