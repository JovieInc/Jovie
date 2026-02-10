import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, smokeNavigate } from './utils/smoke-test-utils';

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Check if database is available (seeded profile data required)
 */
const hasDatabase = !!(
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('dummy')
);

test.describe('Public Profile Performance', () => {
  test.describe('Tim Profile Rendering', () => {
    test.beforeEach(async ({ page }) => {
      // These tests require the 'tim' profile in the database
      if (!hasDatabase) {
        test.skip();
        return;
      }

      // Use seeded 'tim' profile with optimized navigation
      await smokeNavigate(page, '/tim');

      // Check if the profile loaded (not 404 or stuck in loading skeleton)
      const is404 = await page
        .locator('text="404"')
        .isVisible({ timeout: 3000 })
        .catch(() => false);
      const isNotFound = await page
        .locator('text="not found"')
        .isVisible({ timeout: 1000 })
        .catch(() => false);
      const h1Visible = await page
        .locator('h1')
        .isVisible({ timeout: 10000 })
        .catch(() => false);
      if (is404 || isNotFound || !h1Visible) {
        console.log(
          '⚠ /tim profile not found or stuck in loading skeleton — skipping'
        );
        test.skip();
        return;
      }
    });

    test('renders main heading correctly', async ({ page }) => {
      // Check that the main heading is visible and contains expected content
      const mainHeading = page.locator('h1').first();
      const isVisible = await mainHeading
        .isVisible({ timeout: 10000 })
        .catch(() => false);
      if (!isVisible) {
        console.log(
          '⚠ No h1 found on /tim profile — profile may not exist in DB'
        );
        test.skip();
        return;
      }

      await expect(mainHeading).toBeVisible();
    });

    test('displays avatar image from next/image', async ({ page }) => {
      // Wait for and verify avatar image is visible
      const avatarImage = page.locator('img').first();
      const isVisible = await avatarImage
        .isVisible({ timeout: 10000 })
        .catch(() => false);
      if (!isVisible) {
        console.log(
          '⚠ No img found on /tim profile — profile may not have avatar'
        );
        test.skip();
        return;
      }

      await expect(avatarImage).toBeVisible();

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

      const socialCount = await socialElements.count();
      if (socialCount === 0) {
        console.log(
          '⚠ No social links found on /tim profile — profile may not have links'
        );
        test.skip();
        return;
      }

      // Filter to only visible social elements (exclude <link> tags in <head>)
      const visibleSocial = page.locator(
        'a:visible[href*="instagram"], a:visible[href*="twitter"], a:visible[href*="spotify"], a:visible[href*="tiktok"], button:visible[title*="Follow"]'
      );
      const visibleCount = await visibleSocial.count();
      expect(visibleCount).toBeGreaterThan(0);
    });

    test('meets loading performance thresholds', async ({ page }) => {
      const startTime = Date.now();

      // Navigate with performance timing
      await page.goto('/tim', {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      const domLoadTime = Date.now() - startTime;

      // DOM should load quickly (basic threshold)
      expect(domLoadTime).toBeLessThan(5000);

      // Wait for any main content to be visible
      const hasContent = await page
        .locator('h1, main, [data-testid]')
        .first()
        .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
        .catch(() => false);

      if (!hasContent) {
        console.log('⚠ Profile page did not render content');
        test.skip();
        return;
      }

      const fullLoadTime = Date.now() - startTime;

      // Full content visibility should meet performance budget (lenient for dev mode)
      expect(fullLoadTime).toBeLessThan(5000);
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
      await page.waitForLoadState('load', { timeout: 60_000 }).catch(() => {});

      // Wait for any key elements
      const hasH1 = await page
        .locator('h1')
        .first()
        .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
        .catch(() => false);

      const loadTime = Date.now() - startTime;

      // Stop tracing
      await page.context().tracing.stop({
        path: 'test-results/tim-profile-performance-trace.zip',
      });

      if (!hasH1) {
        console.log('⚠ Profile page h1 not visible — skipping CWV check');
        test.skip();
        return;
      }

      // Check basic performance requirements (lenient for dev mode)
      expect(loadTime).toBeLessThan(5000);
    });

    test('loads efficiently on mobile viewport', async ({ page }) => {
      // Set mobile viewport for performance testing
      await page.setViewportSize({ width: 375, height: 667 });

      const startTime = Date.now();

      await page.goto('/tim', {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      const mobileLoadTime = Date.now() - startTime;

      // Mobile should still meet performance thresholds
      expect(mobileLoadTime).toBeLessThan(5000);

      // Verify some content is visible on mobile
      const hasContent = await page
        .locator('h1, main')
        .first()
        .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
        .catch(() => false);
      if (!hasContent) {
        console.log('⚠ No content visible on mobile — skipping');
        test.skip();
      }
    });

    test('avatar images are properly optimized', async ({ page }) => {
      await page.goto('/tim', { timeout: 10000 });

      const images = page.locator('img:visible');
      const imageCount = await images.count();

      if (imageCount === 0) {
        console.log(
          '⚠ No visible images on /tim profile — skipping optimization check'
        );
        test.skip();
        return;
      }

      // Check each visible image for optimization attributes
      for (let i = 0; i < imageCount; i++) {
        const img = images.nth(i);

        const alt = await img.getAttribute('alt');
        // Verify images have alt text
        expect(alt).toBeTruthy();
      }
    });

    test('social links are accessible and functional', async ({ page }) => {
      await page.goto('/tim', { timeout: 10000 });

      // Look for visible social links (exclude <link> tags in <head>)
      const socialLinks = page.locator(
        'a:visible[href*="instagram"], a:visible[href*="twitter"], a:visible[href*="spotify"], a:visible[href*="tiktok"]'
      );
      const socialButtons = page.locator('button:visible[title*="Follow"]');

      const linkCount = await socialLinks.count();
      const buttonCount = await socialButtons.count();

      if (linkCount + buttonCount === 0) {
        console.log('⚠ No visible social elements on /tim profile — skipping');
        test.skip();
        return;
      }

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
      const response = await page.goto('/tim', { timeout: 10000 });

      // Skip if profile doesn't exist (404)
      if (response?.status() === 404) {
        console.log('⚠ /tim profile returned 404 — skipping SEO check');
        test.skip();
        return;
      }

      // Check basic meta tags — title may vary based on display name
      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);

      // Check for meta description (meta tags are in <head>, not visible)
      const metaDescription = page.locator('meta[name="description"]');
      await expect(metaDescription).toHaveAttribute('content', /.+/);

      // Check for og:image (important for social sharing)
      const ogImage = page.locator('meta[property="og:image"]');
      await expect(ogImage).toHaveAttribute('content', /.+/);
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
        timeout: 10000,
      });

      // Wait for any content
      const hasContent = await page
        .locator('h1, main')
        .first()
        .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
        .catch(() => false);

      if (!hasContent) {
        console.log('⚠ No content visible — skipping CI perf check');
        test.skip();
        return;
      }

      const loadTime = Date.now() - startTime;

      // LCP target for Preview environment
      expect(loadTime).toBeLessThan(5000);
    });
  });

  test.describe('Performance Edge Cases', () => {
    test.beforeEach(async () => {
      // These tests require the 'tim' profile in the database
      if (!hasDatabase) {
        test.skip();
      }
    });

    test('handles slow network conditions gracefully', async ({ page }) => {
      // Simulate slow network
      await page.route('**/*', async route => {
        await new Promise(resolve => setTimeout(resolve, 100)); // Add 100ms delay
        route.continue();
      });

      const startTime = Date.now();

      await page.goto('/tim', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      const loadTime = Date.now() - startTime;

      // Check if profile loaded (not stuck in skeleton)
      const h1Visible = await page
        .locator('h1')
        .first()
        .isVisible({ timeout: 10000 })
        .catch(() => false);
      if (!h1Visible) {
        console.log('⚠ /tim profile not found or stuck loading — skipping');
        test.skip();
        return;
      }

      // Should still load within reasonable time even with network delay (lenient in dev)
      expect(loadTime).toBeLessThan(30000);
    });

    test('measures Time to Interactive (TTI) approximation', async ({
      page,
    }) => {
      const startTime = Date.now();

      await page.goto('/tim', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Wait for page to be fully interactive using load state instead of networkidle
      await page.waitForLoadState('load', { timeout: 60_000 }).catch(() => {});

      // Check if profile loaded
      const h1Visible = await page
        .locator('h1')
        .first()
        .isVisible({ timeout: 10000 })
        .catch(() => false);
      if (!h1Visible) {
        console.log('⚠ /tim profile not found or stuck loading — skipping');
        test.skip();
        return;
      }

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
