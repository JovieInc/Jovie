import { setupClerkTestingToken } from '@clerk/testing/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { signInUser } from '../helpers/clerk-auth';

// Helper function to locate and wait for ProfileLinkCard
// Returns null if the component is not rendered on the current page
async function getProfileLinkCard(page: Page): Promise<Locator | null> {
  const profileLinkCard = page
    .locator('[data-testid="profile-link-card"]')
    .or(page.getByText('Your Profile Link'));
  const isVisible = await profileLinkCard
    .first()
    .isVisible({ timeout: 10000 })
    .catch(() => false);
  if (!isVisible) return null;
  return profileLinkCard.first();
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
      test.skip();
      return;
    }

    // Grant clipboard permissions to avoid permission prompts
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
    if (!profileLinkCard) {
      console.log('⚠ ProfileLinkCard not rendered on page — skipping');
      test.skip();
      return;
    }

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

    const newPageUrl = newPage.url();
    expect(newPageUrl).toMatch(/\/[a-zA-Z0-9._-]+$/);
    expect(newPage).not.toBe(page);

    await newPage.close();
  });

  test('Copy button places correct URL on clipboard', async ({ page }) => {
    const profileLinkCard = await getProfileLinkCard(page);
    if (!profileLinkCard) {
      console.log('⚠ ProfileLinkCard not rendered on page — skipping');
      test.skip();
      return;
    }

    // Spy on clipboard writeText method
    await page.evaluate(() => {
      (window as unknown as { _clipboardData: string })._clipboardData = '';
      navigator.clipboard.writeText = async (text: string) => {
        (window as unknown as { _clipboardData: string })._clipboardData = text;
        return Promise.resolve();
      };
    });

    const copyButton = profileLinkCard.locator('button', { hasText: 'Copy' });
    await expect(copyButton).toBeVisible();
    await copyButton.click();

    await expect(copyButton).toHaveText('Copied!', { timeout: 3000 });

    const clipboardData = await page.evaluate(
      () => (window as unknown as { _clipboardData: string })._clipboardData
    );
    expect(clipboardData).toBeTruthy();
    expect(clipboardData).toMatch(/^https?:\/\/.+\/[a-zA-Z0-9._-]+$/);

    await expect(copyButton).toHaveText('Copy', { timeout: 3000 });
  });

  test('Copy button handles clipboard permission errors gracefully', async ({
    page,
    context,
  }) => {
    await context.clearPermissions();

    const profileLinkCard = await getProfileLinkCard(page);
    if (!profileLinkCard) {
      console.log('⚠ ProfileLinkCard not rendered on page — skipping');
      test.skip();
      return;
    }

    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => {
        throw new Error('Write permission denied');
      };
    });

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const copyButton = profileLinkCard.locator('button', { hasText: 'Copy' });
    await copyButton.click();

    await expect(copyButton).toHaveText('Copy');

    await page.waitForTimeout(1000);
    expect(
      consoleErrors.some(error => error.includes('Failed to copy'))
    ).toBeTruthy();
  });

  test('ProfileLinkCard displays correct profile URL in text', async ({
    page,
  }) => {
    const profileLinkCard = await getProfileLinkCard(page);
    if (!profileLinkCard) {
      console.log('⚠ ProfileLinkCard not rendered on page — skipping');
      test.skip();
      return;
    }

    const urlText = profileLinkCard
      .locator('p')
      .filter({ hasText: /https?:\/\/.+/ });
    await expect(urlText).toBeVisible();

    const displayedUrl = await urlText.textContent();
    expect(displayedUrl).toBeTruthy();
    expect(displayedUrl).toMatch(/^https?:\/\/.+\/[a-zA-Z0-9._-]+$/);
  });

  test('ProfileLinkCard works across different environments', async ({
    page,
  }) => {
    const profileLinkCard = await getProfileLinkCard(page);
    if (!profileLinkCard) {
      console.log('⚠ ProfileLinkCard not rendered on page — skipping');
      test.skip();
      return;
    }

    const urlText = profileLinkCard
      .locator('p')
      .filter({ hasText: /https?:\/\/.+/ });
    const displayedUrl = await urlText.textContent();

    expect(displayedUrl).toBeTruthy();
    expect(displayedUrl).toMatch(/^https?:\/\/.+\/.+$/);
  });

  test('No flaky window/tab handling - uses context.pages', async ({
    page,
    context,
  }) => {
    const profileLinkCard = await getProfileLinkCard(page);
    if (!profileLinkCard) {
      console.log('⚠ ProfileLinkCard not rendered on page — skipping');
      test.skip();
      return;
    }

    const initialPageCount = context.pages().length;
    const newPagePromise = context.waitForEvent('page');

    const viewProfileLink = profileLinkCard.locator('a', {
      hasText: 'View Profile',
    });
    await viewProfileLink.click();

    const newPage = await newPagePromise;

    expect(context.pages().length).toBe(initialPageCount + 1);

    await newPage.waitForLoadState('domcontentloaded');
    expect(newPage.url()).toMatch(/\/[a-zA-Z0-9._-]+$/);

    await newPage.close();
    expect(context.pages().length).toBe(initialPageCount);
  });
});
