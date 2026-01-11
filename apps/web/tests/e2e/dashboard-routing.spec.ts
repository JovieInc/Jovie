import { expect, test } from '@playwright/test';

test.describe('Dashboard Routing', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication for testing
    // This would need to be adjusted based on your actual auth setup
    await page.route('**/api/auth/**', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ authenticated: true }),
      });
    });
  });

  test('should navigate to overview page by default', async ({ page }) => {
    await page.goto('/app/dashboard');

    // Should stay on dashboard (overview is now the root)
    await expect(page).toHaveURL('/app/dashboard');

    // Check that overview content is visible
    await expect(page.getByText('Dashboard')).toBeVisible();
    await expect(page.getByText('Welcome back')).toBeVisible();
  });

  test('should deep link directly to settings page', async ({ page }) => {
    await page.goto('/app/settings');

    // URL should remain as settings
    await expect(page).toHaveURL('/app/settings');

    // Check that settings content is visible
    await expect(page.getByText('Settings')).toBeVisible();
    await expect(
      page.getByText('Manage your account preferences')
    ).toBeVisible();
  });

  test('should deep link directly to analytics page', async ({ page }) => {
    await page.goto('/app/dashboard/analytics');

    // Analytics page is no longer a dedicated route; it should redirect
    await expect(page).toHaveURL('/app/dashboard');

    // Check that overview content is visible
    await expect(page.getByText('Welcome back')).toBeVisible();
  });

  test('redirects to settings when clicking settings', async ({ page }) => {
    await page.goto('/app/dashboard');
    await page.getByRole('button', { name: 'Open user menu' }).click();
    await page.getByRole('menuitem', { name: /account settings/i }).click();
    await expect(page).toHaveURL(/\/app\/settings/);
  });

  test('should navigate between dashboard pages', async ({ page }) => {
    await page.goto('/app/dashboard');

    // Navigate to profile page
    await page.getByText('Profile').click();
    await expect(page).toHaveURL('/app/dashboard/profile');

    // Navigate to audience page
    await page.getByText('Audience').click();
    await expect(page).toHaveURL('/app/dashboard/audience');
    await expect(
      page.getByText('Understand and grow your audience')
    ).toBeVisible();

    // Navigate to earnings page
    await page.getByText('Earnings').click();
    await expect(page).toHaveURL('/app/dashboard/earnings');

    // Navigate back to dashboard
    await page.getByText('Dashboard').click();
    await expect(page).toHaveURL('/app/dashboard');
    await expect(page.getByText('Dashboard')).toBeVisible();
  });

  test('browser back/forward navigation should work correctly', async ({
    page,
  }) => {
    await page.goto('/app/dashboard');

    // Navigate to profile page
    await page.getByText('Profile').click();
    await expect(page).toHaveURL('/app/dashboard/profile');

    // Navigate to settings page
    await page.getByText('Settings').click();
    await expect(page).toHaveURL('/app/settings');

    // Go back to links
    await page.goBack();
    await expect(page).toHaveURL('/app/dashboard/profile');

    // Go back to overview
    await page.goBack();
    await expect(page).toHaveURL('/app/dashboard');

    // Go forward to links
    await page.goForward();
    await expect(page).toHaveURL('/app/dashboard/profile');
  });
});
