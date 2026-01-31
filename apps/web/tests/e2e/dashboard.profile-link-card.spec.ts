import { expect, test } from '@playwright/test';

test.describe('ProfileLinkCard E2E Tests', () => {
  test.beforeEach(async ({ page, context }) => {
    // Grant clipboard permissions to avoid permission prompts
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Navigate to dashboard where ProfileLinkCard should be visible
    // Note: This test assumes authentication is handled or mocked appropriately
    await page.goto('/app/dashboard', {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });
  });

  test('View Profile button opens correct URL in new tab', async ({
    page,
    context,
  }) => {
    // Wait for ProfileLinkCard to be visible - use multiple selectors for robustness
    const profileLinkCard = page
      .locator('[data-testid="profile-link-card"]')
      .or(page.locator('text=Your Profile Link').locator('..').locator('..'));
    await expect(profileLinkCard).toBeVisible({ timeout: 10000 });

    // Listen for new page/tab creation
    const pagePromise = context.waitForEvent('page');

    // Click the "View Profile" link
    const viewProfileLink = profileLinkCard.locator('a', {
      hasText: 'View Profile',
    });
    await expect(viewProfileLink).toBeVisible();
    await viewProfileLink.click();

    // Wait for new page and verify URL
    const newPage = await pagePromise;
    await newPage.waitForLoadState('domcontentloaded');

    // The URL should match the pattern getBaseUrl()/{handle}
    // Since getBaseUrl() varies by environment, we'll check the path portion
    const newPageUrl = newPage.url();
    expect(newPageUrl).toMatch(/\/[a-zA-Z0-9._-]+$/); // Should end with a valid handle

    // Check that it opens in a new tab (different page object)
    expect(newPage).not.toBe(page);

    // Close the new page to clean up
    await newPage.close();
  });

  test('Copy button places correct URL on clipboard', async ({ page }) => {
    // Wait for ProfileLinkCard to be visible - use multiple selectors for robustness
    const profileLinkCard = page
      .locator('[data-testid="profile-link-card"]')
      .or(page.locator('text=Your Profile Link').locator('..').locator('..'));
    await expect(profileLinkCard).toBeVisible({ timeout: 10000 });

    // Spy on clipboard writeText method
    await page.evaluate(() => {
      // Store original method and create a spy
      (window as unknown as { _clipboardData: string })._clipboardData = '';
      navigator.clipboard.writeText = async (text: string) => {
        (window as unknown as { _clipboardData: string })._clipboardData = text;
        return Promise.resolve();
      };
    });

    // Click the "Copy" button
    const copyButton = profileLinkCard.locator('button', { hasText: 'Copy' });
    await expect(copyButton).toBeVisible();
    await copyButton.click();

    // Verify the button text changes to "Copied!"
    await expect(copyButton).toHaveText('Copied!', { timeout: 3000 });

    // Verify clipboard was called with correct URL
    const clipboardData = await page.evaluate(
      () => (window as unknown as { _clipboardData: string })._clipboardData
    );
    expect(clipboardData).toBeTruthy();
    expect(clipboardData).toMatch(/^https?:\/\/.+\/[a-zA-Z0-9._-]+$/); // Should be full URL with handle

    // Wait for button text to revert back to "Copy"
    await expect(copyButton).toHaveText('Copy', { timeout: 3000 });
  });

  test('Copy button handles clipboard permission errors gracefully', async ({
    page,
    context,
  }) => {
    // Revoke clipboard permissions to simulate permission denied
    await context.clearPermissions();

    // Wait for ProfileLinkCard to be visible - use multiple selectors for robustness
    const profileLinkCard = page
      .locator('[data-testid="profile-link-card"]')
      .or(page.locator('text=Your Profile Link').locator('..').locator('..'));
    await expect(profileLinkCard).toBeVisible({ timeout: 10000 });

    // Mock clipboard.writeText to throw permission error
    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => {
        throw new Error('Write permission denied');
      };
    });

    // Listen for console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Click the "Copy" button
    const copyButton = profileLinkCard.locator('button', { hasText: 'Copy' });
    await copyButton.click();

    // Button should remain as "Copy" (not change to "Copied!")
    await expect(copyButton).toHaveText('Copy');

    // Should have logged an error
    await page.waitForTimeout(1000); // Give time for error to be logged
    expect(
      consoleErrors.some(error => error.includes('Failed to copy'))
    ).toBeTruthy();
  });

  test('ProfileLinkCard displays correct profile URL in text', async ({
    page,
  }) => {
    // Wait for ProfileLinkCard to be visible - use multiple selectors for robustness
    const profileLinkCard = page
      .locator('[data-testid="profile-link-card"]')
      .or(page.locator('text=Your Profile Link').locator('..').locator('..'));
    await expect(profileLinkCard).toBeVisible({ timeout: 10000 });

    // Find the URL text display
    const urlText = profileLinkCard
      .locator('p')
      .filter({ hasText: /https?:\/\/.+/ });
    await expect(urlText).toBeVisible();

    // Verify URL format
    const displayedUrl = await urlText.textContent();
    expect(displayedUrl).toBeTruthy();
    expect(displayedUrl).toMatch(/^https?:\/\/.+\/[a-zA-Z0-9._-]+$/);
  });

  test('ProfileLinkCard works across different environments', async ({
    page,
  }) => {
    // This test ensures the getBaseUrl() function works correctly
    const profileLinkCard = page
      .locator('[data-testid="profile-link-card"]')
      .or(page.locator('text=Your Profile Link').locator('..').locator('..'));
    await expect(profileLinkCard).toBeVisible({ timeout: 10000 });

    // Get the displayed URL
    const urlText = profileLinkCard
      .locator('p')
      .filter({ hasText: /https?:\/\/.+/ });
    const displayedUrl = await urlText.textContent();

    expect(displayedUrl).toBeTruthy();

    // Verify the URL follows a valid profile URL format
    // Profile URLs use PROFILE_URL constant to ensure correct domain (jov.ie)
    expect(displayedUrl).toMatch(/^https?:\/\/.+\/.+$/);
  });

  test('No flaky window/tab handling - uses context.pages', async ({
    page,
    context,
  }) => {
    // This test specifically ensures we avoid flaky window.open assertions
    const profileLinkCard = page
      .locator('[data-testid="profile-link-card"]')
      .or(page.locator('text=Your Profile Link').locator('..').locator('..'));
    await expect(profileLinkCard).toBeVisible({ timeout: 10000 });

    // Count initial pages
    const initialPageCount = context.pages().length;

    // Set up page creation listener before clicking
    const newPagePromise = context.waitForEvent('page');

    // Click View Profile link
    const viewProfileLink = profileLinkCard.locator('a', {
      hasText: 'View Profile',
    });
    await viewProfileLink.click();

    // Wait for new page creation
    const newPage = await newPagePromise;

    // Verify page count increased
    expect(context.pages().length).toBe(initialPageCount + 1);

    // Verify new page has loaded
    await newPage.waitForLoadState('domcontentloaded');
    expect(newPage.url()).toMatch(/\/[a-zA-Z0-9._-]+$/);

    // Clean up
    await newPage.close();
    expect(context.pages().length).toBe(initialPageCount);
  });
});
