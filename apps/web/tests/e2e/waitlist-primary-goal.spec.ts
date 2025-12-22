import { expect, test } from '@playwright/test';

test.describe('Waitlist primary goal', () => {
  test('selecting a primary goal auto-advances to the next step', async ({
    page,
  }) => {
    await page.goto('/waitlist', { waitUntil: 'domcontentloaded' });

    const goalButton = page.getByRole('button', { name: 'More streams' });
    await expect(goalButton).toBeVisible();

    await goalButton.click();

    await expect(page.getByText('Where do fans find you?')).toBeVisible();
  });
});
