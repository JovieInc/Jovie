import { expect, test } from '@playwright/test';

// Core user journey tests for MVP launch readiness
test.describe('Core User Journeys', () => {
  test('Homepage loads correctly for anonymous users', async ({ page }) => {
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });

    // Should load homepage successfully
    await expect(page).toHaveURL('/');

    // Should show key elements
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('Profile pages load without authentication required', async ({
    page,
  }) => {
    await page.goto('/taylorswift', {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });

    // Should load profile page
    await expect(page).toHaveURL(/\/taylorswift/);
    await expect(page).toHaveTitle(/Taylor Swift/);
  });

  test('Listen mode works without authentication', async ({ page }) => {
    await page.goto('/taylorswift?mode=listen', {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });

    // Should stay on listen mode
    await expect(page).toHaveURL(/mode=listen/);

    // Should not redirect to auth
    await expect(page).not.toHaveURL(/signin/);
  });

  test('Tip mode works without authentication', async ({ page }) => {
    await page.goto('/taylorswift?mode=tip', {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });

    // Should stay on tip mode
    await expect(page).toHaveURL(/mode=tip/);

    // Should not redirect to auth
    await expect(page).not.toHaveURL(/signin/);
  });

  test('Dashboard redirects unauthenticated users', async ({ page }) => {
    await page.goto('/app/dashboard', {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });

    // Should redirect to sign-in
    await expect(page).toHaveURL(/signin/);
  });

  test('No console errors on key pages', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Test homepage
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Test profile page
    await page.goto('/taylorswift', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Check for critical errors (ignore some expected/harmless ones)
    const criticalErrors = errors.filter(
      error =>
        !error.includes('Failed to load resource') && // Image 404s
        !error.includes('net::ERR_FAILED') && // Network errors
        !error.includes('i.scdn.co') // Spotify image errors
    );

    if (criticalErrors.length > 0) {
      console.log('Console errors found:', criticalErrors);
    }

    expect(criticalErrors.length).toBe(0);
  });
});
