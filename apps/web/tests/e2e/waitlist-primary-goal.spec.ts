import { expect, test } from '@playwright/test';

test.describe('Waitlist primary goal', () => {
  test('requires authentication before showing the waitlist form', async ({
    page,
  }) => {
    await page.goto('/waitlist', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/signin/);
  });
});
