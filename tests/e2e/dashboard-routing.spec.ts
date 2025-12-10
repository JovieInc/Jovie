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
    await page.goto('/dashboard');

    // Should redirect to overview
    await expect(page).toHaveURL('/dashboard/overview');

    // Check that overview content is visible
    await expect(page.getByText('Dashboard')).toBeVisible();
    await expect(page.getByText('Welcome back')).toBeVisible();
  });

  test('should deep link directly to settings page', async ({ page }) => {
    await page.goto('/settings');

    // URL should remain as settings
    await expect(page).toHaveURL('/settings');

    // Check that settings content is visible
    await expect(page.getByText('Settings')).toBeVisible();
    await expect(
      page.getByText('Manage your account preferences')
    ).toBeVisible();
  });

  test('should deep link directly to analytics page', async ({ page }) => {
    await page.goto('/dashboard/analytics');

    // URL should remain as analytics
    await expect(page).toHaveURL('/dashboard/analytics');

    // Check that analytics content is visible
    await expect(page.getByText('Analytics')).toBeVisible();
    await expect(page.getByText('Track your performance')).toBeVisible();
  });

  test('redirects to settings when clicking settings', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Open user menu' }).click();
    await page.getByRole('menuitem', { name: /account settings/i }).click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test('should navigate between dashboard pages', async ({ page }) => {
    await page.goto('/dashboard/overview');

    // Navigate to links page
    await page.getByText('Links').click();
    await expect(page).toHaveURL('/dashboard/links');
    await expect(page.getByText('Manage Links')).toBeVisible();

    // Navigate to audience page
    await page.getByText('Audience').click();
    await expect(page).toHaveURL('/dashboard/audience');
    await expect(
      page.getByText('Understand and grow your audience')
    ).toBeVisible();

    // Navigate to tipping page
    await page.getByText('Tipping').click();
    await expect(page).toHaveURL('/dashboard/tipping');
    await expect(
      page.getByText('Tipping functionality is coming soon')
    ).toBeVisible();

    // Navigate back to overview
    await page.getByText('Overview').click();
    await expect(page).toHaveURL('/dashboard/overview');
    await expect(page.getByText('Dashboard')).toBeVisible();
  });

  test('browser back/forward navigation should work correctly', async ({
    page,
  }) => {
    await page.goto('/dashboard/overview');

    // Navigate to links page
    await page.getByText('Links').click();
    await expect(page).toHaveURL('/dashboard/links');

    // Navigate to settings page
    await page.getByText('Settings').click();
    await expect(page).toHaveURL('/settings');

    // Go back to links
    await page.goBack();
    await expect(page).toHaveURL('/dashboard/links');

    // Go back to overview
    await page.goBack();
    await expect(page).toHaveURL('/dashboard/overview');

    // Go forward to links
    await page.goForward();
    await expect(page).toHaveURL('/dashboard/links');
  });
});
