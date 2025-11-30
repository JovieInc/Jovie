import { expect, test } from '@playwright/test';

// Smoke tests for profile pages to ensure basic functionality works
test.describe('Profile smoke tests', () => {
  // Test that profile pages load correctly
  test('profile page loads and displays artist information', async ({
    page,
  }) => {
    // Navigate to a known seeded profile
    await page.goto('/taylorswift', {
      waitUntil: 'domcontentloaded',
    });

    // Should not redirect (profile exists)
    await expect(page).toHaveURL(/\/taylorswift/);

    // Check for essential profile elements
    // Artist name should be visible
    const artistName = page
      .locator('h1, h2')
      .filter({ hasText: /taylor swift/i });
    await expect(artistName.first()).toBeVisible({ timeout: 10000 });

    // Profile should have listen and tip buttons in default mode
    const listenButton = page
      .locator('a, button')
      .filter({ hasText: /listen/i });
    await expect(listenButton.first()).toBeVisible();

    const tipButton = page.locator('a, button').filter({ hasText: /tip/i });
    await expect(tipButton.first()).toBeVisible();
  });

  // Test listen mode functionality
  test('listen mode displays DSP options', async ({ page }) => {
    // Navigate directly to listen mode
    await page.goto('/taylorswift?mode=listen', {
      waitUntil: 'domcontentloaded',
    });

    // Should stay on listen mode URL
    await expect(page).toHaveURL(/\/taylorswift\?mode=listen/);

    // Check for DSP buttons or platform options
    // At least one music platform should be visible
    const dspButtons = page
      .locator(
        'a[href*="spotify"], a[href*="apple"], a[href*="youtube"], button'
      )
      .filter({
        hasText: /spotify|apple|youtube|amazon|tidal|deezer/i,
      });

    // Wait for at least one DSP option to be visible
    await expect(dspButtons.first()).toBeVisible({ timeout: 10000 });
  });

  // Test listen mode back button behavior
  test('listen mode back button returns to profile', async ({ page }) => {
    // Navigate directly to listen mode
    await page.goto('/taylorswift?mode=listen', {
      waitUntil: 'domcontentloaded',
    });

    // Confirm we are in listen mode
    await expect(page).toHaveURL(/\/taylorswift\?mode=listen/);

    const backButton = page
      .locator('button[aria-label="Back to profile"]')
      .first();

    await expect(backButton).toBeVisible({ timeout: 10000 });

    // Click back button
    await backButton.click();

    // Should navigate back to the base profile URL
    await expect(page).toHaveURL(/\/taylorswift$/);

    // Back button should no longer be present once profile mode is active
    await expect(
      page.locator('button[aria-label="Back to profile"]')
    ).toHaveCount(0);
  });

  // Test tip mode functionality
  test('tip mode displays tipping interface', async ({ page }) => {
    // Navigate directly to tip mode
    await page.goto('/taylorswift?mode=tip', {
      waitUntil: 'domcontentloaded',
    });

    // Should stay on tip mode URL
    await expect(page).toHaveURL(/\/taylorswift\?mode=tip/);

    // Check for tip-related elements
    // Should have amount selectors or tip interface
    const tipInterface = page.locator('button, div').filter({
      hasText: /\$\d+|tip|venmo|payment/i,
    });

    await expect(tipInterface.first()).toBeVisible({ timeout: 10000 });
  });

  // Test tip mode back button behavior
  test('tip mode back button returns to profile', async ({ page }) => {
    // Navigate directly to tip mode
    await page.goto('/taylorswift?mode=tip', {
      waitUntil: 'domcontentloaded',
    });

    // Confirm we are in tip mode
    await expect(page).toHaveURL(/\/taylorswift\?mode=tip/);

    const backButton = page
      .locator('button[aria-label="Back to profile"]')
      .first();

    await expect(backButton).toBeVisible({ timeout: 10000 });

    // Click back button
    await backButton.click();

    // Should navigate back to the base profile URL
    await expect(page).toHaveURL(/\/taylorswift$/);

    // Back button should no longer be present once profile mode is active
    await expect(
      page.locator('button[aria-label="Back to profile"]')
    ).toHaveCount(0);
  });

  // Test mode switching via buttons
  test('can switch between profile modes', async ({ page }) => {
    // Start at profile page
    await page.goto('/taylorswift', {
      waitUntil: 'domcontentloaded',
    });

    // Click listen button
    const listenButton = page
      .locator('a, button')
      .filter({ hasText: /listen/i })
      .first();
    await listenButton.click();

    // Should navigate to listen mode
    await expect(page).toHaveURL(/mode=listen/, { timeout: 10000 });

    // Navigate back to profile
    await page.goto('/taylorswift');

    // Click tip button if available
    const tipButton = page
      .locator('a, button')
      .filter({ hasText: /tip/i })
      .first();
    const tipButtonVisible = await tipButton.isVisible().catch(() => false);

    if (tipButtonVisible) {
      await tipButton.click();
      // Should navigate to tip mode
      await expect(page).toHaveURL(/mode=tip/, { timeout: 10000 });
    }
  });

  // Test non-existent profile handling
  test('non-existent profile shows 404 or redirects appropriately', async ({
    page,
  }) => {
    // Try to access a profile that doesn't exist
    const response = await page.goto('/nonexistentprofile123456', {
      waitUntil: 'domcontentloaded',
    });

    // Should either show 404 or redirect
    const is404 = response?.status() === 404;
    const hasNotFound = await page
      .locator('text=/not found|doesn.*t exist|404/i')
      .isVisible()
      .catch(() => false);
    const redirectedHome =
      page.url().includes('://') &&
      !page.url().includes('/nonexistentprofile123456');

    expect(is404 || hasNotFound || redirectedHome).toBeTruthy();
  });

  // Test profile page responsiveness
  test('profile page is responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/taylorswift', {
      waitUntil: 'domcontentloaded',
    });

    // Check that essential elements are still visible on mobile
    const artistName = page
      .locator('h1, h2')
      .filter({ hasText: /taylor swift/i });
    await expect(artistName.first()).toBeVisible();

    // Buttons should still be accessible
    const buttons = page
      .locator('a, button')
      .filter({ hasText: /listen|tip/i });
    await expect(buttons.first()).toBeVisible();
  });

  // Test profile page performance
  test('profile page loads within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/taylorswift', {
      waitUntil: 'domcontentloaded',
    });

    const loadTime = Date.now() - startTime;

    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);

    // Check that content is interactive quickly
    const listenButton = page
      .locator('a, button')
      .filter({ hasText: /listen/i })
      .first();
    await expect(listenButton).toBeVisible({ timeout: 2000 });
  });
});

// Additional smoke tests for profile features
test.describe('Profile feature smoke tests', () => {
  // Test avatar image loading
  test('profile avatar loads correctly', async ({ page }) => {
    await page.goto('/taylorswift', {
      waitUntil: 'domcontentloaded',
    });

    // Check for avatar image
    const avatar = page
      .locator(
        'img[alt*="taylor" i], img[alt*="avatar" i], img[alt*="profile" i]'
      )
      .first();

    if (await avatar.isVisible().catch(() => false)) {
      // Check that image has loaded (has natural dimensions)
      const hasLoaded = await avatar.evaluate((img: HTMLImageElement) => {
        return img.complete && img.naturalHeight > 0;
      });
      expect(hasLoaded).toBeTruthy();
    }
  });

  // Test social links if present
  test('social links are clickable when present', async ({ page }) => {
    await page.goto('/taylorswift', {
      waitUntil: 'domcontentloaded',
    });

    // Check for social links
    const socialLinks = page.locator(
      'a[href*="instagram"], a[href*="twitter"], a[href*="facebook"], a[href*="tiktok"]'
    );
    const socialCount = await socialLinks.count();

    if (socialCount > 0) {
      // Check that at least one social link is visible and has correct attributes
      const firstSocial = socialLinks.first();
      await expect(firstSocial).toBeVisible();

      const href = await firstSocial.getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).toMatch(/^https?:\/\//);
    }
  });

  // Test dark mode if implemented
  test('profile works in dark mode', async ({ page }) => {
    // Set dark mode preference
    await page.emulateMedia({ colorScheme: 'dark' });

    await page.goto('/taylorswift', {
      waitUntil: 'domcontentloaded',
    });

    // Check that page loads without errors
    const artistName = page
      .locator('h1, h2')
      .filter({ hasText: /taylor swift/i });
    await expect(artistName.first()).toBeVisible();

    // Check for dark mode classes or styles
    const htmlElement = page.locator('html');
    const hasDarkClass = await htmlElement.evaluate(el => {
      return (
        el.classList.contains('dark') ||
        document.documentElement.classList.contains('dark')
      );
    });

    // Dark mode should be applied
    expect(hasDarkClass).toBeTruthy();
  });
});
