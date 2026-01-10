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

  test('shows releases matrix with provider columns @smoke', async ({
    page,
  }) => {
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
    });

    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: 15000 });

    // Verify table headers exist
    await expect(page.getByRole('columnheader', { name: /release/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /released/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /smart link/i })).toBeVisible();
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
    const providerButton = page.locator('[data-testid^="provider-copy-"][data-testid$="-spotify"]').first();
    const providerUrl = await providerButton.getAttribute('data-url');

    if (providerUrl) {
      // Verify the URL uses dsp parameter
      expect(providerUrl).toContain('?dsp=');
      expect(providerUrl).toContain('dsp=spotify');

      // Follow the redirect
      const response = await page.goto(providerUrl);
      expect(response?.status() ?? 0).toBeLessThan(400);
      await expect(page).toHaveURL(/spotify/);
    }
  });

  test('sync button visible when Spotify is connected @nightly', async ({
    page,
  }) => {
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
    });

    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: 15000 });

    // If user has releases, Spotify is connected and sync button should be visible
    const hasReleases = await page.locator('tbody tr').count() > 0;

    if (hasReleases) {
      const syncButton = page.getByTestId('sync-spotify-button');
      await expect(syncButton).toBeVisible();
      await expect(syncButton).toHaveText(/sync from spotify/i);
    }
  });
});
