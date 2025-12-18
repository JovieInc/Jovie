import { expect, test } from '@playwright/test';

test.describe('Waitlist primary goal', () => {
  test('after submitting, returning to /waitlist shows submitted state (not primary goal)', async ({
    page,
  }) => {
    await page.goto('/waitlist', { waitUntil: 'domcontentloaded' });

    // If unauthenticated, the page redirects to Clerk sign-in. In CI runs where
    // auth is configured, we should continue and verify submitted state.
    // Otherwise, this test becomes a no-op.
    if (page.url().includes('/signin')) {
      test.skip(true, 'Auth not configured for this Playwright run');
    }

    const goalButton = page.getByRole('button', { name: 'More streams' });
    await expect(goalButton).toBeVisible();
    await goalButton.click();

    await expect(page.getByPlaceholder('yourusername')).toBeVisible();
    await page.getByPlaceholder('yourusername').fill('testuser');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByPlaceholder('open.spotify.com/artist/... (optional)')).toBeVisible();
    await page.getByRole('button', { name: 'Join the waitlist' }).click();

    await expect(page.getByText("You're on the waitlist!")).toBeVisible();

    await page.goto('/waitlist', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText("You're on the waitlist!")).toBeVisible();
    await expect(goalButton).not.toBeVisible();
  });
});
