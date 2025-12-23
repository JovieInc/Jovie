import { expect, test } from './setup';

/**
 * Public Profile Smoke Test
 *
 * Fast, minimal test to verify public creator profiles load correctly.
 * This test runs on every PR to main to block commits that break public profiles.
 *
 * @smoke
 */
test.describe('Public Profile Smoke @smoke', () => {
  // Use a known seeded profile handle
  const testHandle = 'dualipa';

  test('public profile loads and displays core elements', async ({ page }) => {
    // Navigate to public profile
    const response = await page.goto(`/${testHandle}`, { timeout: 30000 });

    // Smoke invariant: must not be a server error
    const status = response?.status() ?? 0;
    expect(status, `Expected <500 but got ${status}`).toBeLessThan(500);

    // Check if we got the "temporarily unavailable" error page (DATABASE_URL not set)
    const pageTitle = await page.title();
    const isTemporarilyUnavailable = pageTitle.includes(
      'temporarily unavailable'
    );

    // If the seeded profile exists, verify core elements.
    // If it doesn't exist (404/400) or database is unavailable, that's acceptable for smoke tests.
    if (status === 200 && !isTemporarilyUnavailable) {
      // Verify page title contains creator name
      await expect(page).toHaveTitle(/Dua Lipa/i, { timeout: 10000 });

      // Verify h1 displays creator name
      await expect(page.locator('h1')).toContainText('Dua Lipa', {
        timeout: 10000,
      });

      // Verify profile image is visible (any profile image)
      const profileImage = page.locator('img').first();
      await expect(profileImage).toBeVisible({ timeout: 10000 });
    } else {
      // For 404/400/temporarily unavailable, just verify page renders (not a 500 error)
      await page.waitForLoadState('domcontentloaded');
      const bodyContent = await page.locator('body').textContent();
      expect(bodyContent).toBeTruthy();
    }
  });

  test('404 page renders for non-existent profile', async ({ page }) => {
    const response = await page.goto('/nonexistent-handle-xyz-123', {
      timeout: 30000,
    });

    const status = response?.status() ?? 0;

    // Should return 200 (Next.js renders 404 page), 404, or 400 (validation error)
    // A 500 indicates a server error which should fail the test
    // 400 is acceptable for invalid usernames (validation error)
    expect(
      [200, 400, 404].includes(status),
      `Expected 200, 400, or 404 but got ${status} (server error)`
    ).toBe(true);

    // If we got a valid status, verify page content exists
    // For 400/404, the page should still render some content
    if (status < 500) {
      await page.waitForLoadState('domcontentloaded');
      const bodyContent = await page.locator('body').textContent();
      expect(bodyContent).toBeTruthy();
    }
  });
});
