import { setupClerkTestingToken } from '@clerk/testing/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/performance'; // Use performance-optimized fixture
import { hasClerkCredentials } from '../helpers/clerk-credentials';

// Helper function to locate and wait for dashboard overview (where profile link is now integrated)
async function getDashboardOverview(page: Page): Promise<Locator> {
  const profileLinkCard = page.locator('[data-testid="dashboard-overview"]');
  await expect(profileLinkCard).toBeVisible({ timeout: 10000 });
  return profileLinkCard;
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

    // Set up Clerk testing token (required even with storageState)
    await setupClerkTestingToken({ page });

    // Navigate to dashboard - authentication is already set up via storageState
    // (created in auth.setup.ts and loaded automatically for all tests)
    await page.goto('/app/dashboard', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for dashboard to be ready
    const profileLinkCard = page.locator('[data-testid="dashboard-overview"]');
    await profileLinkCard.waitFor({ state: 'visible', timeout: 15000 });
  });

  test('View Profile button opens correct URL in new tab', async ({
    page,
    context,
  }) => {
    const profileLinkCard = await getDashboardOverview(page);

    // Listen for new page/tab creation
    const pagePromise = context.waitForEvent('page');

    // Click the "View profile" link in the header (icon button with aria-label)
    // Note: aria-label is lowercase "View profile"
    const viewProfileLink = profileLinkCard.locator(
      'a[aria-label="View profile"]'
    );
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
    const profileLinkCard = await getDashboardOverview(page);

    // Spy on clipboard writeText method
    await page.evaluate(() => {
      // Store original method and create a spy
      (window as unknown as { _clipboardData: string })._clipboardData = '';
      navigator.clipboard.writeText = async (text: string) => {
        (window as unknown as { _clipboardData: string })._clipboardData = text;
        return Promise.resolve();
      };
    });

    // Click the "Copy URL" button in the header (icon button with sr-only label)
    const copyButton = profileLinkCard
      .locator('button')
      .filter({ has: page.locator('.sr-only', { hasText: 'Copy URL' }) })
      .first();
    await expect(copyButton).toBeVisible();
    await copyButton.click();

    // Verify the sr-only label changes to "Copied!"
    await expect(
      copyButton.locator('.sr-only', { hasText: 'Copied!' })
    ).toBeVisible({ timeout: 3000 });

    // Verify clipboard was called with correct URL
    const clipboardData = await page.evaluate(
      () => (window as unknown as { _clipboardData: string })._clipboardData
    );
    expect(clipboardData).toBeTruthy();
    expect(clipboardData).toMatch(/^https?:\/\/.+\/[a-zA-Z0-9._-]+$/); // Should be full URL with handle

    // Wait for button text to revert back to "Copy URL"
    await expect(
      copyButton.locator('.sr-only', { hasText: 'Copy URL' })
    ).toBeVisible({ timeout: 3000 });
  });

  test('Copy button handles clipboard permission errors gracefully', async ({
    page,
    context,
  }) => {
    // Revoke clipboard permissions to simulate permission denied
    await context.clearPermissions();

    const profileLinkCard = await getDashboardOverview(page);

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

  test.skip('ProfileLinkCard displays correct profile URL in text', async ({
    page,
  }) => {
    // SKIP: Profile URL is no longer displayed as text in the dashboard header.
    // The URL is now only available via the copy button and view profile link.
    // This test is kept for reference but skipped as the feature design changed.
  });

  test.skip('ProfileLinkCard works across different environments', async ({
    page,
  }) => {
    // SKIP: Profile URL is no longer displayed as text in the dashboard header.
    // The URL verification is now covered by the copy button and view profile tests.
    // This test is kept for reference but skipped as the feature design changed.
  });

  test('No flaky window/tab handling - uses context.pages', async ({
    page,
    context,
  }) => {
    // This test specifically ensures we avoid flaky window.open assertions
    const profileLinkCard = await getDashboardOverview(page);

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
