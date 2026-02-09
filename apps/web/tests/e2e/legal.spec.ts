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
      // Check hero title (the h1 from LegalHero)
      await expect(page.locator('h1')).toContainText(
        'Privacy built for artists on the move'
      );

      // Check main section headings (must match actual markdown content)
      await expect(
        page.getByRole('heading', { name: 'Information We Collect' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'How We Use Your Information' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Data Sharing', exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Data Storage and Protection' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Your Preferences and Controls' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Contact Us' })
      ).toBeVisible();
    });

    test('has proper navigation', async ({ page }) => {
      // Check header logo link
      await expect(page.getByTestId('site-logo-link')).toBeVisible();
    });

    test('has proper meta information', async ({ page }) => {
      // Check page title
      await expect(page).toHaveTitle(/Privacy Policy/);

      // Check meta description exists (meta tags are in <head>, not visible)
      const metaDescription = page.locator('meta[name="description"]');
      await expect(metaDescription).toHaveAttribute('content', /.+/);
    });

    test('is responsive on mobile', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Check that content is still readable
      await expect(page.locator('h1')).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Information We Collect' })
      ).toBeVisible();
    });
  });

  test.describe('Terms of Service', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/legal/terms');
    });

    test('displays terms of service page correctly', async ({ page }) => {
      // Check hero title (the h1 from LegalHero)
      await expect(page.locator('h1')).toContainText(
        'Terms that respect your creativity and control'
      );

      // Check main section headings (must match actual markdown content)
      await expect(
        page.getByRole('heading', { name: 'Acceptance of Terms' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'What Jovie Provides' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'User Accounts' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Content and Conduct' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Intellectual Property' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Contact Information' })
      ).toBeVisible();
    });

    test('has proper navigation', async ({ page }) => {
      // Check header logo link
      await expect(page.getByTestId('site-logo-link')).toBeVisible();
    });

    test('has proper meta information', async ({ page }) => {
      // Check page title
      await expect(page).toHaveTitle(/Terms of Service/);

      // Check meta description exists (meta tags are in <head>, not visible)
      const metaDescription = page.locator('meta[name="description"]');
      await expect(metaDescription).toHaveAttribute('content', /.+/);
    });

    test('is responsive on mobile', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Check that content is still readable
      await expect(page.locator('h1')).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Acceptance of Terms' })
      ).toBeVisible();
    });
  });

  test.describe('Navigation between legal pages', () => {
    test('can navigate from privacy to home', async ({ page }) => {
      await page.goto('/legal/privacy');

      // Click on logo to go home
      await page.getByTestId('site-logo-link').click();
      await expect(page).toHaveURL('/');
    });

    test('can navigate from terms to home', async ({ page }) => {
      await page.goto('/legal/terms');

      // Click on logo to go home
      await page.getByTestId('site-logo-link').click();
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Accessibility', () => {
    test('privacy policy has proper heading structure', async ({ page }) => {
      await page.goto('/legal/privacy');

      // The hero h1 should be the first heading
      const headings = page.locator('h1, h2, h3');
      await expect(headings.first()).toBeVisible();

      // There should be exactly one h1 (from LegalHero)
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);
    });

    test('terms of service has proper heading structure', async ({ page }) => {
      await page.goto('/legal/terms');

      // The hero h1 should be the first heading
      const headings = page.locator('h1, h2, h3');
      await expect(headings.first()).toBeVisible();

      // There should be exactly one h1 (from LegalHero)
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);
    });

    test('has proper link accessibility', async ({ page }) => {
      await page.goto('/legal/privacy');

      // Check that links have accessible names (text content or aria-label)
      const links = page.locator('a');
      for (const link of await links.all()) {
        const text = await link.textContent();
        const ariaLabel = await link.getAttribute('aria-label');
        expect(text?.trim() || ariaLabel?.trim()).toBeTruthy();
      }
    });
  });

  test.describe('SEO and Performance', () => {
    test('privacy policy loads quickly', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/legal/privacy');
      const loadTime = Date.now() - startTime;

      // Should load within 5 seconds (dev server may be slower)
      expect(loadTime).toBeLessThan(5000);
    });

    test('terms of service loads quickly', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/legal/terms');
      const loadTime = Date.now() - startTime;

      // Should load within 5 seconds (dev server may be slower)
      expect(loadTime).toBeLessThan(5000);
    });

    test('has proper canonical URLs', async ({ page }) => {
      await page.goto('/legal/privacy');
      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveAttribute('href', /\/legal\/privacy/);

      await page.goto('/legal/terms');
      const canonical2 = page.locator('link[rel="canonical"]');
      await expect(canonical2).toHaveAttribute('href', /\/legal\/terms/);
    });
  });
});
