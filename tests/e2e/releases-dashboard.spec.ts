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

test.describe('Releases dashboard - Mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone X dimensions

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

  test('displays mobile cards on small viewports @smoke', async ({ page }) => {
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
    });

    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: 15000 });

    // Mobile card should be visible
    const mobileCard = page.getByTestId('release-mobile-card-neon-skyline');
    await expect(mobileCard).toBeVisible();

    // Verify card shows release title
    await expect(mobileCard.getByText('Neon Skyline')).toBeVisible();
  });

  test('copies smart link from mobile card @smoke', async ({ page }) => {
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
    });

    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: 15000 });

    // Find and click the mobile smart link copy button
    const copyButton = page.getByTestId('smart-link-copy-mobile-neon-skyline');
    const copiedUrl = await copyButton.getAttribute('data-url');

    expect(copiedUrl).toBeTruthy();
    expect(copiedUrl).toContain('/r/');
  });

  test('expands mobile card to show all providers', async ({ page }) => {
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
    });

    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: 15000 });

    const mobileCard = page.getByTestId('release-mobile-card-neon-skyline');
    await expect(mobileCard).toBeVisible();

    // Initially expanded content should not be visible
    const allPlatformsLabel = mobileCard.getByText('All platforms');
    await expect(allPlatformsLabel).not.toBeVisible();

    // Click to expand
    const expandButton = mobileCard.getByRole('button', {
      name: /view details/i,
    });
    await expandButton.click();

    // Expanded content should now be visible
    await expect(allPlatformsLabel).toBeVisible();

    // Provider edit buttons should be visible
    const spotifyEditButton = page.getByTestId(
      'provider-edit-mobile-neon-skyline-spotify'
    );
    await expect(spotifyEditButton).toBeVisible();
  });

  test('allows editing provider link from mobile card', async ({ page }) => {
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
    });

    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: 15000 });

    const mobileCard = page.getByTestId('release-mobile-card-neon-skyline');
    await expect(mobileCard).toBeVisible();

    // Expand the card first
    const expandButton = mobileCard.getByRole('button', {
      name: /view details/i,
    });
    await expandButton.click();

    // Click edit on Spotify
    const spotifyEditButton = page.getByTestId(
      'provider-edit-mobile-neon-skyline-spotify'
    );
    await spotifyEditButton.click();

    // Input field should appear
    const input = page.getByTestId(
      'provider-input-mobile-neon-skyline-spotify'
    );
    await expect(input).toBeVisible();

    // Save and cancel buttons should be visible
    const saveButton = page.getByTestId(
      'save-provider-mobile-neon-skyline-spotify'
    );
    await expect(saveButton).toBeVisible();
  });

  test('collapses expanded mobile card', async ({ page }) => {
    await page.goto('/app/dashboard/releases', {
      waitUntil: 'domcontentloaded',
    });

    const matrix = page.getByTestId('releases-matrix');
    await expect(matrix).toBeVisible({ timeout: 15000 });

    const mobileCard = page.getByTestId('release-mobile-card-neon-skyline');

    // Expand the card
    const expandButton = mobileCard.getByRole('button', {
      name: /view details/i,
    });
    await expandButton.click();

    // Verify it's expanded
    const allPlatformsLabel = mobileCard.getByText('All platforms');
    await expect(allPlatformsLabel).toBeVisible();

    // Click to collapse
    const collapseButton = mobileCard.getByRole('button', {
      name: /hide details/i,
    });
    await collapseButton.click();

    // Content should be hidden
    await expect(allPlatformsLabel).not.toBeVisible();
  });
});
