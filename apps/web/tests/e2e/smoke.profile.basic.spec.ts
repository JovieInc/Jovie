import { expect, test } from '@playwright/test';

// Basic profile smoke tests - simplified for reliability
test.describe('Basic Profile smoke tests', () => {
  test('taylorswift profile page loads with correct title', async ({
    page,
  }) => {
    await page.goto('/taylorswift', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Should not redirect to 404
    await expect(page).toHaveURL(/\/taylorswift/);

    // Check that the page title includes artist name
    await expect(page).toHaveTitle(/Taylor Swift/);

    // Check that we don't get a 404 error
    const notFoundText = page.locator('text=404');
    await expect(notFoundText).not.toBeVisible();
  });

  test('profile page responds correctly', async ({ page }) => {
    const response = await page.goto('/taylorswift', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Should get 200 OK response
    expect(response?.status()).toBe(200);

    // Should have correct content type
    const contentType = response?.headers()['content-type'];
    expect(contentType).toContain('text/html');
  });

  test('non-existent profile returns 404', async ({ page }) => {
    await page.goto('/nonexistentprofile123456', {
      waitUntil: 'domcontentloaded',
    });

    // Should show 404 content - use a more specific selector
    const notFoundHeading = page
      .locator('h1')
      .filter({ hasText: /not found/i });
    await expect(notFoundHeading).toBeVisible();
  });

  test('listen mode URL works', async ({ page }) => {
    await page.goto('/taylorswift?mode=listen', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Should stay on listen mode URL
    await expect(page).toHaveURL(/\/taylorswift.*mode=listen/);

    // Should not be 404
    const notFoundText = page.locator('text=404');
    await expect(notFoundText).not.toBeVisible();
  });

  test('tip mode URL works', async ({ page }) => {
    await page.goto('/taylorswift?mode=tip', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Should stay on tip mode URL
    await expect(page).toHaveURL(/\/taylorswift.*mode=tip/);

    // Should not be 404
    const notFoundText = page.locator('text=404');
    await expect(notFoundText).not.toBeVisible();
  });
});
