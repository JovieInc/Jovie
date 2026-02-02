import { expect, test } from './setup';

/**
 * Legal Pages Tests
 *
 * NOTE: Legal pages (privacy policy, terms of service) are public
 * and must run without saved authentication.
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Legal Pages', () => {
  test.describe('Privacy Policy', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/legal/privacy');
    });

    test('displays privacy policy page correctly', async ({ page }) => {
      // Check page title
      await expect(page.locator('h1')).toContainText('Privacy Policy');

      // Check main sections
      await expect(page.getByText('Information We Collect')).toBeVisible();
      await expect(page.getByText('How We Use Your Information')).toBeVisible();
      await expect(page.getByText('Information Sharing')).toBeVisible();
      await expect(page.getByText('Data Security')).toBeVisible();
      await expect(page.getByText('Your Rights')).toBeVisible();
      await expect(page.getByText('Contact Us')).toBeVisible();
    });

    test('has proper navigation', async ({ page }) => {
      // Check header navigation
      await expect(page.getByRole('link', { name: 'Jovie' })).toBeVisible();

      // Check if logo is present
      const logo = page.locator('svg[viewBox="0 0 136 39"]');
      await expect(logo).toBeVisible();
    });

    test('has proper meta information', async ({ page }) => {
      // Check page title
      await expect(page).toHaveTitle(/Privacy Policy/);

      // Check meta description
      const metaDescription = page.locator('meta[name="description"]');
      await expect(metaDescription).toBeVisible();
    });

    test('is responsive on mobile', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Check that content is still readable
      await expect(page.locator('h1')).toContainText('Privacy Policy');
      await expect(page.getByText('Information We Collect')).toBeVisible();
    });
  });

  test.describe('Terms of Service', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/legal/terms');
    });

    test('displays terms of service page correctly', async ({ page }) => {
      // Check page title
      await expect(page.locator('h1')).toContainText('Terms of Service');

      // Check main sections
      await expect(page.getByText('Acceptance of Terms')).toBeVisible();
      await expect(page.getByText('Description of Service')).toBeVisible();
      await expect(page.getByText('User Accounts')).toBeVisible();
      await expect(page.getByText('Prohibited Uses')).toBeVisible();
      await expect(page.getByText('Intellectual Property')).toBeVisible();
      await expect(page.getByText('Contact Information')).toBeVisible();
    });

    test('has proper navigation', async ({ page }) => {
      // Check header navigation
      await expect(page.getByRole('link', { name: 'Jovie' })).toBeVisible();

      // Check if logo is present
      const logo = page.locator('svg[viewBox="0 0 136 39"]');
      await expect(logo).toBeVisible();
    });

    test('has proper meta information', async ({ page }) => {
      // Check page title
      await expect(page).toHaveTitle(/Terms of Service/);

      // Check meta description
      const metaDescription = page.locator('meta[name="description"]');
      await expect(metaDescription).toBeVisible();
    });

    test('is responsive on mobile', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Check that content is still readable
      await expect(page.locator('h1')).toContainText('Terms of Service');
      await expect(page.getByText('Acceptance of Terms')).toBeVisible();
    });
  });

  test.describe('Navigation between legal pages', () => {
    test('can navigate from privacy to home', async ({ page }) => {
      await page.goto('/legal/privacy');

      // Click on logo to go home
      await page.getByRole('link', { name: 'Jovie' }).click();
      await expect(page).toHaveURL('/');
    });

    test('can navigate from terms to home', async ({ page }) => {
      await page.goto('/legal/terms');

      // Click on logo to go home
      await page.getByRole('link', { name: 'Jovie' }).click();
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Accessibility', () => {
    test('privacy policy has proper heading structure', async ({ page }) => {
      await page.goto('/legal/privacy');

      // Check for proper heading hierarchy
      const headings = page.locator('h1, h2, h3');
      await expect(headings.first()).toContainText('Privacy Policy');

      // Check that headings are properly nested
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);
    });

    test('terms of service has proper heading structure', async ({ page }) => {
      await page.goto('/legal/terms');

      // Check for proper heading hierarchy
      const headings = page.locator('h1, h2, h3');
      await expect(headings.first()).toContainText('Terms of Service');

      // Check that headings are properly nested
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);
    });

    test('has proper link accessibility', async ({ page }) => {
      await page.goto('/legal/privacy');

      // Check that links have proper text
      const links = page.locator('a');
      for (const link of await links.all()) {
        const text = await link.textContent();
        expect(text?.trim()).toBeTruthy();
      }
    });
  });

  test.describe('SEO and Performance', () => {
    test('privacy policy loads quickly', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/legal/privacy');
      const loadTime = Date.now() - startTime;

      // Should load within 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });

    test('terms of service loads quickly', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/legal/terms');
      const loadTime = Date.now() - startTime;

      // Should load within 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });

    test('has proper canonical URLs', async ({ page }) => {
      await page.goto('/legal/privacy');
      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toBeVisible();

      await page.goto('/legal/terms');
      const canonical2 = page.locator('link[rel="canonical"]');
      await expect(canonical2).toBeVisible();
    });
  });
});
