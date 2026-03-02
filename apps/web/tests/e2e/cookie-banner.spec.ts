import { expect, test } from './setup';

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Cookie banner', () => {
  test('shows based on country', async ({ page }) => {
    await page.route('**/api/profile/view', r => r.fulfill({ status: 200, body: '{}' }));
    await page.route('**/api/audience/visit', r => r.fulfill({ status: 200, body: '{}' }));
    await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
    await page.goto('/');
    const banner = page.locator('[data-testid="cookie-banner"]');
    if (process.env.COUNTRY === 'DE') {
      await expect(banner).toBeVisible();
    } else {
      await expect(banner).toHaveCount(0);
    }
  });
});
