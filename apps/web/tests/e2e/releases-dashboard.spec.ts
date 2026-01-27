import { expect, test } from '@playwright/test';
import { ClerkTestError, signInUser } from '../helpers/clerk-auth';

test.describe('Releases dashboard', () => {
  // Skip entire suite if Clerk auth fails during beforeEach
  test.beforeEach(async ({ page }, testInfo) => {
    const hasCredentials =
      process.env.E2E_CLERK_USER_USERNAME &&
      process.env.E2E_CLERK_USER_PASSWORD;

    if (!hasCredentials) {
      testInfo.skip();
      return;
    }

    // Skip if Clerk setup wasn't successful (no real Clerk keys)
    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      console.warn(
        `⚠ Skipping ${testInfo.title}: Clerk testing setup was not successful`
      );
      testInfo.skip();
      return;
    }

    try {
      await signInUser(page);
    } catch (error) {
      // Skip test if Clerk fails to load (e.g., CDN issues or setup issues)
      if (
        error instanceof ClerkTestError &&
        (error.code === 'CLERK_NOT_READY' ||
          error.code === 'CLERK_SETUP_FAILED')
      ) {
        console.warn(`⚠ Skipping ${testInfo.title}: ${error.message}`);
        testInfo.skip();
        return;
      }
      throw error;
    }
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

  test('shows releases matrix with basic columns @smoke', async ({ page }) => {
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
    });

    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: 15000 });

    // Verify basic table headers exist
    await expect(
      page.getByRole('columnheader', { name: /release/i })
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: /released/i })
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: /smart link/i })
    ).toBeVisible();
  });

  test('opens edit sidebar when clicking edit button @nightly', async ({
    page,
  }) => {
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
    });

    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: 15000 });

    // Find and click an edit button (any release)
    const editButton = page.locator('[data-testid^="edit-links-"]').first();

    // Hover to make the button visible (it has opacity-0 by default)
    const row = editButton.locator('xpath=ancestor::tr');
    await row.hover();

    await editButton.click();

    // Verify sidebar opens
    const sidebar = page.getByTestId('release-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 5000 });
  });

  test('smart link redirect uses dsp parameter correctly @nightly', async ({
    page,
  }) => {
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
    });

    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: 15000 });

    // Get a provider-specific copy button URL
    const providerButton = page
      .locator('[data-testid^="provider-copy-"][data-testid$="-spotify"]')
      .first();

    // Assert the button exists and has a URL
    await expect(providerButton).toBeVisible();
    const providerUrl = await providerButton.getAttribute('data-url');
    expect(providerUrl).toBeTruthy();

    // Verify the URL uses dsp parameter
    expect(providerUrl).toContain('?dsp=');
    expect(providerUrl).toContain('dsp=spotify');

    // Follow the redirect
    const response = await page.goto(providerUrl!);
    expect(response?.status() ?? 0).toBeLessThan(400);
    await expect(page).toHaveURL(/spotify/);
  });

  test('shows sync button when releases exist @nightly', async ({ page }) => {
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
    });

    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: 15000 });

    // Check if releases exist in the table
    const releaseRows = page.locator('tbody tr');
    const hasReleases = (await releaseRows.count()) > 0;

    if (hasReleases) {
      // When releases exist, sync button should be visible
      const syncButton = page.getByTestId('sync-spotify-button');
      await expect(syncButton).toBeVisible();
    }
  });
});
