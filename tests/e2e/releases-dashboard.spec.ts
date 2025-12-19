import { expect, test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';

test.describe('Releases dashboard', () => {
  test.beforeEach(async ({ page }) => {
    const hasCredentials =
      process.env.E2E_CLERK_USER_USERNAME &&
      process.env.E2E_CLERK_USER_PASSWORD;

    if (!hasCredentials) {
      test.skip();
      return;
    }

    await signInUser(page);
  });

  test('copies a smart link and follows the redirect @smoke', async ({
    page,
  }) => {
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
    });

    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: 15000 });

    const copyButton = page.getByTestId('smart-link-copy-neon-skyline');
    const copiedUrl = await copyButton.getAttribute('data-url');

    expect(copiedUrl).toBeTruthy();

    const response = await page.goto(copiedUrl!);
    expect(response?.status() ?? 0).toBeLessThan(400);
    await expect(page).toHaveURL(/spotify|apple|youtube|soundcloud/);
  });
});
