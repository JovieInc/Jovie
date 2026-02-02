import { setupClerkTestingToken } from '@clerk/testing/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';

// Helper function to locate and wait for ProfileLinkCard
async function getProfileLinkCard(page: Page): Promise<Locator> {
  const profileLinkCard = page
    .locator('[data-testid="profile-link-card"]')
    .or(page.locator('text=Your Profile Link').locator('..').locator('..'));
  await expect(profileLinkCard).toBeVisible({ timeout: 10000 });
  return profileLinkCard;
}

/**
 * Check if Clerk credentials are available for authenticated tests
 */
function hasClerkCredentials(): boolean {
  const username = process.env.E2E_CLERK_USER_USERNAME ?? '';
  const password = process.env.E2E_CLERK_USER_PASSWORD ?? '';
  const clerkSetupSuccess = process.env.CLERK_TESTING_SETUP_SUCCESS === 'true';

  // Allow passwordless auth for Clerk test emails
  const isClerkTestEmail = username.includes('+clerk_test');

  return (
    username.length > 0 &&
    (password.length > 0 || isClerkTestEmail) &&
    clerkSetupSuccess
  );
}

test.describe('ProfileLinkCard E2E Tests', () => {
  test.beforeEach(async ({ page, context }) => {
    // Skip if no Clerk credentials configured
    if (!hasClerkCredentials()) {
      console.log('⚠ Skipping ProfileLinkCard tests - no Clerk credentials');
      console.log('  Set E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD');
      test.skip();
      return;
    }

    // Grant clipboard permissions to avoid permission prompts
    // Note: clipboard-write is not supported in WebKit, only clipboard-read
    await context.grantPermissions(['clipboard-read']);

    // Set up Clerk testing token and sign in
    await setupClerkTestingToken({ page });

    try {
      await signInUser(page);
    } catch (error) {
      console.error('Failed to sign in test user:', error);
      test.skip();
    }
  });

  test('View Profile button opens correct URL in new tab', async ({
    page,
    context,
  }) => {
    const profileLinkCard = await getProfileLinkCard(page);

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
    const profileLinkCard = await getProfileLinkCard(page);

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

    const profileLinkCard = await getProfileLinkCard(page);

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
    const profileLinkCard = await getProfileLinkCard(page);

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
    const profileLinkCard = await getProfileLinkCard(page);

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
    const profileLinkCard = await getProfileLinkCard(page);

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
