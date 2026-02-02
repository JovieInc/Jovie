/**
 * E2E tests for public profile rendering performance
 * Tests loading speed, avatar visibility, social links, and performance metrics
 *
 * NOTE: These tests verify the public unauthenticated profile viewing
 * experience and must run without saved authentication.
 */

import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, smokeNavigate } from './utils/smoke-test-utils';

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Public Profile Performance', () => {
  test.describe('Tim Profile Rendering', () => {
    test.beforeEach(async ({ page }) => {
      // Use seeded 'tim' profile with optimized navigation
      await smokeNavigate(page, '/tim');
    });

    test('renders main heading correctly', async ({ page }) => {
      // Check that the main heading is visible and contains expected content
      const mainHeading = page.locator('h1').first();
      await expect(mainHeading).toBeVisible();

      // Should have tim's display name (based on seeded data)
      await expect(mainHeading).toContainText('Tim');
    });

    test('displays avatar image from next/image', async ({ page }) => {
      // Wait for and verify avatar image is visible
      const avatarImage = page.locator('img').first();
      await expect(avatarImage).toBeVisible();

      // Verify it's using next/image optimization
      await expect(avatarImage).toHaveAttribute('loading');

      // Check alt text is present for accessibility
      const altText = await avatarImage.getAttribute('alt');
      expect(altText).toBeTruthy();
      expect(altText).not.toBe('');
    });

    test('shows at least one social link', async ({ page }) => {
      // Look for social links/buttons
      const socialElements = page.locator(
        '[href*="instagram"], [href*="twitter"], [href*="spotify"], [href*="tiktok"], button[title*="Follow"], a[title*="Follow"]'
      );

      // Should have at least one social link
      await expect(socialElements.first()).toBeVisible();

      const socialCount = await socialElements.count();
      expect(socialCount).toBeGreaterThan(0);
    });

    test('meets loading performance thresholds', async ({ page }) => {
      const startTime = Date.now();

      // Navigate with performance timing
      await page.goto('/tim', {
        waitUntil: 'domcontentloaded',
        timeout: 5000,
      });

      const domLoadTime = Date.now() - startTime;

      // DOM should load quickly (basic threshold)
      expect(domLoadTime).toBeLessThan(3000);

      // Wait for main content to be visible using expect assertions (not waitForSelector)
      await expect(page.locator('h1').first()).toBeVisible({
        timeout: SMOKE_TIMEOUTS.QUICK,
      });
      await expect(page.locator('img').first()).toBeVisible({
        timeout: SMOKE_TIMEOUTS.QUICK,
      });

      const fullLoadTime = Date.now() - startTime;

      // Full content visibility should meet performance budget
      expect(fullLoadTime).toBeLessThan(2500); // LCP target under 2.5s
    });

    test('measures Core Web Vitals with Playwright traces', async ({
      page,
    }) => {
      // Start tracing to capture performance metrics
      await page.context().tracing.start({
        screenshots: true,
        snapshots: true,
      });

      const startTime = Date.now();

      // Use domcontentloaded instead of networkidle for more reliable timing
      await page.goto('/tim', {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });
      await page.waitForLoadState('load');

      // Wait for key elements to ensure LCP measurement using expect assertions
      await expect(page.locator('h1').first()).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await expect(page.locator('img').first()).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const loadTime = Date.now() - startTime;

      // Stop tracing
      await page.context().tracing.stop({
        path: 'test-results/tim-profile-performance-trace.zip',
      });

      // Check basic performance requirements
      expect(loadTime).toBeLessThan(2500); // LCP target

      // Verify main content is rendered (already verified above)
    });

    test('loads efficiently on mobile viewport', async ({ page }) => {
      // Set mobile viewport for performance testing
      await page.setViewportSize({ width: 375, height: 667 });

      const startTime = Date.now();

      await page.goto('/tim', {
        waitUntil: 'domcontentloaded',
        timeout: 5000,
      });

      const mobileLoadTime = Date.now() - startTime;

      // Mobile should still meet performance thresholds
      expect(mobileLoadTime).toBeLessThan(3000);

      // Verify content is visible on mobile
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('img')).toBeVisible();
    });

    test('avatar images are properly optimized', async ({ page }) => {
      await page.goto('/tim');

      const images = page.locator('img');
      const imageCount = await images.count();

      expect(imageCount).toBeGreaterThan(0);

      // Check each image for optimization attributes
      for (let i = 0; i < imageCount; i++) {
        const img = images.nth(i);

        // Should have lazy loading (except for LCP image)
        const alt = await img.getAttribute('alt');

        // Verify images have alt text
        expect(alt).toBeTruthy();

        // Check that image is visible
        await expect(img).toBeVisible();
      }
    });

    test('social links are accessible and functional', async ({ page }) => {
      await page.goto('/tim');

      // Look for social links
      const socialLinks = page.locator(
        '[href*="instagram"], [href*="twitter"], [href*="spotify"], [href*="tiktok"]'
      );
      const socialButtons = page.locator('button[title*="Follow"]');

      const linkCount = await socialLinks.count();
      const buttonCount = await socialButtons.count();

      // Should have at least one social element
      expect(linkCount + buttonCount).toBeGreaterThan(0);

      // Check accessibility attributes for social elements
      if (linkCount > 0) {
        const firstLink = socialLinks.first();
        await expect(firstLink).toBeVisible();

        // Should open in new tab/window for external links
        const target = await firstLink.getAttribute('target');
        if (target) {
          expect(target).toBe('_blank');
        }
      }

      if (buttonCount > 0) {
        const firstButton = socialButtons.first();
        await expect(firstButton).toBeVisible();

        // Should have proper title/aria-label
        const title = await firstButton.getAttribute('title');
        const ariaLabel = await firstButton.getAttribute('aria-label');
        expect(title || ariaLabel).toBeTruthy();
      }
    });

    test('page has proper meta tags for SEO', async ({ page }) => {
      await page.goto('/tim');

      // Check basic meta tags
      await expect(page).toHaveTitle(/Tim/);

      // Check for meta description
      const metaDescription = page.locator('meta[name="description"]');
      await expect(metaDescription).toBeVisible();

      // Check for og:image (important for social sharing)
      const ogImage = page.locator('meta[property="og:image"]');
      await expect(ogImage).toBeVisible();
    });

    test('performance budget compliance in CI environment', async ({
      page,
    }) => {
      // This test focuses on CI/Preview environment performance
      const isCI = process.env.CI;
      const baseUrl = process.env.BASE_URL;

      if (!isCI || !baseUrl) {
        test.skip(true, 'This test only runs in CI against Preview URL');
      }

      const startTime = Date.now();

      await page.goto('/tim', {
        waitUntil: 'load',
        timeout: 8000, // Slightly more lenient for CI
      });

      // Wait for critical content using expect assertions (not waitForSelector)
      await expect(page.locator('h1').first()).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await expect(page.locator('img').first()).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      const loadTime = Date.now() - startTime;

      // LCP target for Preview environment
      expect(loadTime).toBeLessThan(2500);

      // Check for at least one social element
      const socialElements = page.locator(
        '[href*="instagram"], [href*="twitter"], [href*="spotify"], [href*="tiktok"], button[title*="Follow"]'
      );
      await expect(socialElements.first()).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
    });
  });

  test.describe('Performance Edge Cases', () => {
    test('handles slow network conditions gracefully', async ({ page }) => {
      // Simulate slow network
      await page.route('**/*', async route => {
        await new Promise(resolve => setTimeout(resolve, 100)); // Add 100ms delay
        route.continue();
      });

      const startTime = Date.now();

      await page.goto('/tim', {
        waitUntil: 'domcontentloaded',
        timeout: 8000,
      });

      const loadTime = Date.now() - startTime;

      // Should still load within reasonable time even with network delay
      expect(loadTime).toBeLessThan(4000);

      // Critical content should still be visible
      await expect(page.locator('h1').first()).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
    });

    test('measures Time to Interactive (TTI) approximation', async ({
      page,
    }) => {
      const startTime = Date.now();

      await page.goto('/tim', { waitUntil: 'domcontentloaded' });

      // Wait for page to be fully interactive using load state instead of networkidle
      await page.waitForLoadState('load');

      // Test interactivity by trying to interact with social elements
      const socialElement = page.locator('button, a').first();
      const isVisible = await socialElement.isVisible().catch(() => false);
      if (isVisible) {
        await socialElement.hover(); // Test if interactive
      }

      const ttiTime = Date.now() - startTime;

      // TTI should be reasonable
      expect(ttiTime).toBeLessThan(5000);
    });
  });
});
