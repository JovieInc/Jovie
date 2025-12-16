import { expect, test } from '@playwright/test';

test.describe('Waitlist primary goal', () => {
  test('selecting a primary goal auto-advances to the next step', async ({
    page,
  }) => {
    await page.goto('/waitlist', { waitUntil: 'domcontentloaded' });

    await page.getByPlaceholder('Full Name').fill('Test User');
    await page
      .getByPlaceholder('Enter your email address')
      .fill(`test-${Date.now().toString(36)}@example.com`);

    await page.getByRole('button', { name: 'Next' }).click();

    const goalButton = page.getByRole('button', { name: 'More streams' });
    await expect(goalButton).toBeVisible();

    await goalButton.click();

    await expect(
      page.getByPlaceholder('instagram.com/yourhandle')
    ).toBeVisible();

    await page.getByRole('button', { name: 'Back' }).click();

    await expect(goalButton).toHaveAttribute('aria-pressed', 'true');
  });
});
