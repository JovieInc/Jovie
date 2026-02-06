import { expect, test } from './setup';

/**
 * Pricing Page Tests
 *
 * NOTE: These tests verify the public pricing page for unauthenticated
 * visitors. Must run without saved auth to see correct CTAs.
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Pricing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pricing');
  });

  test('displays pricing plans correctly', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Pricing/);

    // Check main heading copy
    const heading = page.locator('h1');
    await expect(heading).toContainText('Free forever.');
    await expect(heading).toContainText('Remove branding for $5.');

    // Check Free plan
    await expect(page.getByText('Free Forever')).toBeVisible();
    await expect(page.getByText('$0')).toBeVisible();

    // Check Pro plan
    await expect(page.getByText('Pro')).toBeVisible();
    await expect(page.getByText('Remove the Jovie branding')).toBeVisible();
  });

  test('has working call-to-action buttons', async ({ page }) => {
    // Check Free plan CTA
    const freeButton = page.getByRole('link', { name: 'Continue with free' });
    await expect(freeButton).toBeVisible();
    await expect(freeButton).toHaveAttribute('href', '/');

    // Check Pro plan CTA (unauthenticated visitors see Upgrade →)
    const proButton = page.getByRole('button', { name: 'Upgrade →' });
    await expect(proButton).toBeVisible();
  });

  test('shows guarantee information', async ({ page }) => {
    await expect(page.getByText('30-day money-back guarantee')).toBeVisible();
  });
});
