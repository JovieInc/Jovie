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

    // If the seeded profile exists, verify core elements.
    // If it doesn't exist (404), that's acceptable in environments without seed data.
    if (status === 200) {
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
      await expect(page.locator('h1')).toContainText(/not found/i, {
        timeout: 10000,
      });
    }
  });

  test('404 page renders for non-existent profile', async ({ page }) => {
    const response = await page.goto('/nonexistent-handle-xyz-123', {
      timeout: 30000,
    });

    const status = response?.status() ?? 0;

    // Should return 200 (Next.js renders 404 page) or 404
    // A 500 indicates a server error which should fail the test
    expect(
      [200, 404].includes(status),
      `Expected 200 or 404 but got ${status} (server error)`
    ).toBe(true);

    // Verify 404 content
    await expect(page.locator('h1')).toContainText(/not found/i, {
      timeout: 10000,
    });
  });
});
