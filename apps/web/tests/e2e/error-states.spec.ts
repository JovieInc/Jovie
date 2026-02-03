import { expect, test } from '@playwright/test';

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Error states for API failures', () => {
  test('Notifications page surfaces an error when subscribe API fails', async ({
    page,
  }) => {
    await page.route('**/api/notifications/subscribe', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal error' }),
      });
    });

    await page.goto('/demo/notifications');

    await page.getByLabel('Email').fill('fan@example.com');
    await page.getByRole('button', { name: /turn on notifications/i }).click();

    await expect(page.getByTestId('notifications-error')).toBeVisible();
  });
});
